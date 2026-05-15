import asyncio
import base64
import io
import json
import mimetypes
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from telethon import TelegramClient as TelethonClient
from telethon import functions, types, utils, helpers

DEFAULT_API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040') or '2040')
DEFAULT_API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627').strip() or 'b18441a1ff607e10a989891a5462e627'


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _to_iso_datetime(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        target = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return target.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 1_000_000_000_000:
            timestamp = timestamp / 1000.0
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat().replace('+00:00', 'Z')
    if isinstance(value, str) and value.strip():
        normalized = value.strip().replace('Z', '+00:00')
        try:
            target = datetime.fromisoformat(normalized)
        except Exception:
            return None
        if target.tzinfo is None:
            target = target.replace(tzinfo=timezone.utc)
        return target.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    return None


def _parse_schedule_datetime(value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError('SCHEDULE_DATE_INVALID')
    normalized = value.strip().replace('Z', '+00:00')
    target = datetime.fromisoformat(normalized)
    if target.tzinfo is None:
        target = target.replace(tzinfo=timezone.utc)
    return target.astimezone(timezone.utc)


def _read_scheduled_media_label(message: Any) -> str:
    media = getattr(message, 'media', None)
    media_class = media.__class__.__name__ if media is not None else ''
    if 'MessageMediaPhoto' in media_class:
        return '图片'
    if 'Document' in media_class:
        return '文件'
    if 'Geo' in media_class:
        return '位置'
    if 'Contact' in media_class:
        return '联系人'
    if 'Poll' in media_class:
        return '投票'
    if 'WebPage' in media_class:
        return '链接预览'
    if media is not None:
        return '媒体'
    return '文字'


def _read_forward_label(message: Any) -> str:
    fwd_from = getattr(message, 'fwd_from', None)
    from_name = getattr(fwd_from, 'from_name', None)
    if isinstance(from_name, str) and from_name.strip():
        return from_name.strip()
    post_author = getattr(message, 'post_author', None)
    if isinstance(post_author, str) and post_author.strip():
        return post_author.strip()
    return ''


def _read_repeat_period(message: Any) -> Optional[int]:
    candidates = [
        getattr(message, 'schedule_repeat_period', None),
        getattr(message, 'schedulePeriod', None),
        getattr(message, 'schedule_period', None),
        getattr(message, 'repeatPeriodSeconds', None),
        getattr(message, 'repeat_period_seconds', None)
    ]
    for value in candidates:
        try:
            next_value = int(value)
        except Exception:
            continue
        if next_value > 0:
            return next_value
    return None


def _serialize_scheduled_message(message: Any) -> Optional[Dict[str, Any]]:
    message_id = getattr(message, 'id', None)
    if not isinstance(message_id, int) or message_id <= 0:
        return None
    text = getattr(message, 'message', None)
    if not isinstance(text, str):
        text = getattr(message, 'raw_text', None)
    if not isinstance(text, str):
        text = ''
    return {
        'messageId': message_id,
        'scheduledAt': _to_iso_datetime(getattr(message, 'date', None)),
        'text': text.strip(),
        'hasMedia': bool(getattr(message, 'media', None)),
        'mediaLabel': _read_scheduled_media_label(message),
        'hasButtons': bool(getattr(message, 'reply_markup', None)),
        'isForwarded': bool(getattr(message, 'fwd_from', None)),
        'forwardLabel': _read_forward_label(message),
        'repeatPeriodSeconds': _read_repeat_period(message)
    }


def _extract_invite_hash(raw_value: str) -> str:
    raw = str(raw_value or '').strip()
    if not raw:
        return ''
    matched = re.search(r'(?:https?://)?t\.me/(?:joinchat/|\+)([^/?#]+)', raw, re.IGNORECASE)
    return matched.group(1).strip() if matched and matched.group(1) else ''


def _normalize_group_ref(raw_value: str) -> Optional[Dict[str, Any]]:
    raw = str(raw_value or '').strip()
    if not raw:
        return None
    invite_hash = _extract_invite_hash(raw)
    if invite_hash:
        return {'kind': 'invite', 'value': invite_hash}
    matched = re.search(r'(?:https?://)?t\.me/([^/?#]+)', raw, re.IGNORECASE)
    candidate = (matched.group(1) if matched else raw).strip()
    if not candidate:
        return None
    if re.fullmatch(r'-?\d+', candidate):
        return {'kind': 'peer', 'value': int(candidate)}
    return {'kind': 'username', 'value': candidate if candidate.startswith('@') else '@' + candidate.lstrip('@')}


def _parse_message_link(raw_value: str) -> Optional[Dict[str, Any]]:
    raw = str(raw_value or '').strip()
    if not raw:
        return None
    private_match = re.search(r'(?:https?://)?t\.me/c/(\d+)/(\d+)(?:\?.*)?$', raw, re.IGNORECASE)
    if private_match:
        return {
            'peer': int(f'-100{private_match.group(1)}'),
            'message_id': int(private_match.group(2))
        }
    public_match = re.search(r'(?:https?://)?t\.me/(?:(?:s|a)/)?([A-Za-z0-9_]{3,})/(\d+)(?:\?.*)?$', raw, re.IGNORECASE)
    if public_match:
        return {
            'peer': '@' + public_match.group(1).lstrip('@'),
            'message_id': int(public_match.group(2))
        }
    return None


def _infer_extension(mime_type: str) -> str:
    mime = str(mime_type or '').lower()
    if 'png' in mime:
        return 'png'
    if 'jpeg' in mime or 'jpg' in mime:
        return 'jpg'
    if 'webp' in mime:
        return 'webp'
    if 'gif' in mime:
        return 'gif'
    guessed = mimetypes.guess_extension(mime) or '.bin'
    return guessed.lstrip('.') or 'bin'


def _slugify_file_name(value: str) -> str:
    cleaned = re.sub(r'[^\w\u4e00-\u9fff.-]+', '_', str(value or '').strip(), flags=re.UNICODE).strip('_')
    return cleaned or 'broadcast_image'


def _resolve_media_file(image_url: str, title: str):
    raw = str(image_url or '').strip()
    if not raw:
        return None
    if raw.startswith('data:'):
        matched = re.match(r'^data:([^;,]+)?(;base64)?,(.*)$', raw, re.DOTALL)
        if not matched:
            raise ValueError('PHOTO_INVALID')
        mime_type = matched.group(1) or 'application/octet-stream'
        encoded = matched.group(3) or ''
        buffer = base64.b64decode(encoded) if matched.group(2) else urllib.parse.unquote_to_bytes(encoded)
        stream = io.BytesIO(buffer)
        stream.name = f'{_slugify_file_name(title)}.{_infer_extension(mime_type)}'
        stream.seek(0)
        return stream
    if re.match(r'^https?://', raw, re.IGNORECASE):
        request = urllib.request.Request(raw, headers={'User-Agent': 'TG-Matrix/1.0'})
        with urllib.request.urlopen(request, timeout=20) as response:
            data = response.read()
            mime_type = response.headers.get_content_type() if response.headers else 'application/octet-stream'
        stream = io.BytesIO(data)
        stream.name = f'{_slugify_file_name(title)}.{_infer_extension(mime_type)}'
        stream.seek(0)
        return stream
    file_path = Path(raw)
    return str(file_path) if file_path.exists() else raw


def _is_probable_photo(media_source: Any) -> bool:
    name = ''
    if isinstance(media_source, str):
        name = media_source
    else:
        name = getattr(media_source, 'name', '') or ''
    lower = name.lower()
    return lower.endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif'))


def _build_creative_message(creative: Dict[str, Any]) -> str:
    text = str(creative.get('text') or '').strip()
    if str(creative.get('kind') or '').strip() != 'image_button':
        return text
    button_text = str(creative.get('buttonText') or '').strip()
    button_url = str(creative.get('buttonUrl') or '').strip()
    if not button_url:
        return text
    button_line = f'{button_text}：{button_url}' if button_text else button_url
    return '\n\n'.join([item for item in [text, button_line] if item]).strip()


def _build_proxy_config(command: Dict[str, Any]):
    proxy = command.get('proxy')
    if not isinstance(proxy, dict):
        return None
    host = str(proxy.get('host') or '').strip()
    port = _safe_int(proxy.get('port'), 0)
    proxy_type = str(proxy.get('type') or '').strip().lower()
    if not host or port <= 0 or proxy_type not in {'http', 'https', 'socks5'}:
        return None
    if proxy_type == 'https':
        proxy_type = 'http'
    username = str(proxy.get('username') or '').strip() or None
    password = str(proxy.get('password') or '').strip() or None
    return {
        'proxy_type': proxy_type,
        'addr': host,
        'port': port,
        'username': username,
        'password': password,
        'rdns': True
    }


async def _resolve_group_entity(client: Any, raw_group_ref: str):
    group_ref = _normalize_group_ref(raw_group_ref)
    if not group_ref:
        raise ValueError('CHANNEL_INVALID')
    if group_ref['kind'] == 'invite':
        invite = await client(functions.messages.CheckChatInviteRequest(hash=group_ref['value']))
        if invite.__class__.__name__ == 'ChatInviteAlready':
            return getattr(invite, 'chat', None)
        raise ValueError('USER_NOT_PARTICIPANT')
    if group_ref['kind'] == 'peer':
        try:
            return await client.get_entity(group_ref['value'])
        except Exception:
            for archived in (False, True):
                async for dialog in client.iter_dialogs(archived=archived):
                    dialog_id = getattr(dialog, 'id', None)
                    if dialog_id is not None and str(dialog_id) == str(group_ref['value']):
                        return getattr(dialog, 'entity', None)
            raise
    return await client.get_entity(group_ref['value'])


async def _get_scheduled_history(client: Any, target_input: Any):
    result = await client(functions.messages.GetScheduledHistoryRequest(peer=target_input, hash=0))
    messages = list(getattr(result, 'messages', []) or [])
    serialized = [item for item in (_serialize_scheduled_message(message) for message in messages) if item]
    serialized.sort(key=lambda item: item.get('scheduledAt') or '')
    return messages, serialized


async def _delete_scheduled_messages(client: Any, target_input: Any, message_ids: List[int]):
    cleaned = [int(item) for item in message_ids if isinstance(item, int) and item > 0]
    if not cleaned:
        return 0
    await client(functions.messages.DeleteScheduledMessagesRequest(peer=target_input, id=cleaned))
    return len(cleaned)


async def _load_source_message(client: Any, source_link: str):
    parsed = _parse_message_link(source_link)
    if not parsed:
        raise ValueError('SOURCE_MESSAGE_LINK_INVALID')
    source_message = await client.get_messages(parsed['peer'], ids=parsed['message_id'])
    if source_message is None or source_message.__class__.__name__ == 'MessageEmpty':
        raise ValueError('SOURCE_MESSAGE_LINK_INVALID')
    return parsed, source_message


async def _push_scheduled_message(client: Any, command: Dict[str, Any], target_input: Any):
    creative = command.get('creative') if isinstance(command.get('creative'), dict) else {}
    creative_kind = str(creative.get('kind') or 'text').strip() or 'text'
    repeat_period = _safe_int(command.get('repeatPeriodSeconds'), 0)
    schedule_date = _parse_schedule_datetime(command.get('scheduledAt'))
    before_messages, _ = await _get_scheduled_history(client, target_input)
    before_ids = {getattr(message, 'id', None) for message in before_messages if isinstance(getattr(message, 'id', None), int)}

    if creative_kind == 'channel_forward':
        source_link = str(creative.get('sourceLink') or '').strip()
        parsed, _ = await _load_source_message(client, source_link)
        source_input = await client.get_input_entity(parsed['peer'])
        await client(functions.messages.ForwardMessagesRequest(
            from_peer=source_input,
            id=[parsed['message_id']],
            to_peer=target_input,
            random_id=[helpers.generate_random_long()],
            schedule_date=schedule_date,
            schedule_repeat_period=repeat_period if repeat_period > 0 else None,
            drop_author=False
        ))
    else:
        message_text = _build_creative_message(creative)
        image_url = str(creative.get('imageUrl') or '').strip()
        if image_url:
            media_source = _resolve_media_file(image_url, str(creative.get('title') or creative.get('text') or 'broadcast-image'))
            uploaded = await client.upload_file(media_source)
            input_media = utils.get_input_media(uploaded, is_photo=_is_probable_photo(media_source))
            await client(functions.messages.SendMediaRequest(
                peer=target_input,
                media=input_media,
                message=message_text,
                random_id=helpers.generate_random_long(),
                schedule_date=schedule_date,
                schedule_repeat_period=repeat_period if repeat_period > 0 else None
            ))
        else:
            await client(functions.messages.SendMessageRequest(
                peer=target_input,
                message=message_text,
                random_id=helpers.generate_random_long(),
                schedule_date=schedule_date,
                schedule_repeat_period=repeat_period if repeat_period > 0 else None
            ))

    matched = None
    saw_scheduled_message = False
    for _ in range(8):
        await asyncio.sleep(0.35)
        after_messages, serialized = await _get_scheduled_history(client, target_input)
        if serialized:
            saw_scheduled_message = True
        candidates = []
        for message in after_messages:
            message_id = getattr(message, 'id', None)
            if not isinstance(message_id, int) or message_id in before_ids:
                continue
            candidates.append(message)
        if candidates:
            candidates.sort(key=lambda item: getattr(item, 'id', 0), reverse=True)
            matched = candidates[0]
            break

    if matched is None:
        raise ValueError('SCHEDULE_MESSAGE_NOT_FOUND')

    message_id = getattr(matched, 'id', None)
    if not isinstance(message_id, int) or message_id <= 0:
        raise ValueError('MSG_ID_INVALID')

    if repeat_period > 0:
        actual_repeat = _read_repeat_period(matched)
        if actual_repeat != repeat_period:
            try:
                await _delete_scheduled_messages(client, target_input, [message_id])
            except Exception:
                pass
            if saw_scheduled_message:
                raise ValueError('TELEGRAM_REPEAT_NOT_APPLIED')
            raise ValueError('TELEGRAM_REPEAT_NOT_APPLIED')

    return message_id


async def _run(command: Dict[str, Any]) -> Dict[str, Any]:
    action = str(command.get('action') or '').strip().lower()
    session_path = str(command.get('sessionPath') or '').strip()
    timeout_seconds = max(15, _safe_int(command.get('timeoutSeconds'), 30))

    if action not in {'list', 'push', 'delete'}:
        return {'ok': False, 'reason': 'UNKNOWN_ACTION'}
    if not session_path or not Path(session_path).exists():
        return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

    proxy = _build_proxy_config(command)
    client = TelethonClient(
        session_path,
        DEFAULT_API_ID,
        DEFAULT_API_HASH,
        receive_updates=False,
        timeout=10,
        request_retries=1,
        connection_retries=1,
        retry_delay=0.5,
        auto_reconnect=False,
        proxy=proxy
    )

    try:
        await asyncio.wait_for(client.connect(), timeout=timeout_seconds)
        authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=timeout_seconds)
        if not authorized:
            return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

        entity = await _resolve_group_entity(client, str(command.get('groupRef') or ''))
        target_input = await client.get_input_entity(entity)

        if action == 'list':
            _, serialized = await asyncio.wait_for(_get_scheduled_history(client, target_input), timeout=timeout_seconds)
            return {
                'ok': True,
                'summary': f'已读取到 {len(serialized)} 条定时内容。' if serialized else '这个群当前还没有定时内容。',
                'items': serialized
            }

        if action == 'delete':
            deleted_count = await asyncio.wait_for(_delete_scheduled_messages(client, target_input, list(command.get('messageIds') or [])), timeout=timeout_seconds)
            return {
                'ok': True,
                'deletedCount': deleted_count,
                'summary': f'已删除 {deleted_count} 条定时内容。'
            }

        message_id = await asyncio.wait_for(_push_scheduled_message(client, command, target_input), timeout=max(timeout_seconds, 20))
        return {
            'ok': True,
            'messageId': message_id,
            'summary': '定时内容已写入 Telegram。'
        }
    except Exception as exc:
        return {'ok': False, 'reason': str(exc) or exc.__class__.__name__}
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass


async def _main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

    raw = sys.argv[1] if len(sys.argv) > 1 else '{}'
    try:
        command = json.loads(raw)
    except Exception:
        print(json.dumps({'ok': False, 'reason': 'INVALID_PAYLOAD'}, ensure_ascii=False))
        return

    result = await _run(command)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(_main())
