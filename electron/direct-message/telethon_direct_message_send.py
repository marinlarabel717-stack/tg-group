import asyncio
import base64
import io
import json
import mimetypes
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Any, Dict, Tuple

from telethon import TelegramClient as TelethonClient
from telethon import utils
from telethon.tl import functions, types

DEFAULT_API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040') or '2040')
DEFAULT_API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627').strip() or 'b18441a1ff607e10a989891a5462e627'
RANDOM_TEXT_EMOJIS = ['✨', '🌸', '🍀', '🎉', '💫', '🌈', '🎁', '🍃', '🔥', '💎']


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


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


def _build_random_emoji_suffix(enabled: Any) -> str:
    if not bool(enabled):
        return ''
    import random
    count = 1 if random.random() < 0.5 else 2
    picked = random.sample(RANDOM_TEXT_EMOJIS, k=min(count, len(RANDOM_TEXT_EMOJIS)))
    return f" {' '.join(picked)}" if picked else ''


def _build_direct_text_message(text: str, random_emoji_enabled: Any) -> str:
    base = str(text or '').strip()
    if not base:
        return ''
    return f'{base}{_build_random_emoji_suffix(random_emoji_enabled)}'


def _parse_direct_target(target_value: str) -> Dict[str, str] | None:
    raw = str(target_value or '').strip()
    if not raw:
        return None
    if re.fullmatch(r'\+?\d{6,15}', raw):
        return {'kind': 'phone', 'value': raw if raw.startswith('+') else f'+{raw}'}

    matched = re.search(r'(?:https?://)?t\.me/([A-Za-z0-9_]{5,})(?:\?.*)?$', raw, re.IGNORECASE)
    if matched:
        return {'kind': 'username', 'value': f'@{matched.group(1).lstrip("@")}'}

    if re.fullmatch(r'@?[A-Za-z0-9_]{5,}', raw, re.IGNORECASE):
        return {'kind': 'username', 'value': raw if raw.startswith('@') else f'@{raw}'}

    return None


def _parse_message_link(raw_value: str) -> Dict[str, Any] | None:
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


def _slugify_file_name(value: str) -> str:
    cleaned = re.sub(r'[^\w\u4e00-\u9fff.-]+', '_', str(value or '').strip(), flags=re.UNICODE).strip('_')
    return cleaned or 'direct_message_image'


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


def _resolve_media_file(image_url: str, title: str):
    raw = str(image_url or '').strip()
    if not raw:
        return None

    if raw.startswith('data:'):
        matched = re.match(r'^data:([^;,]+)?(;base64)?,(.*)$', raw, re.DOTALL)
        if not matched:
            raise ValueError('图片 Data URL 格式不正确')
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


async def _resolve_send_entity(client: Any, target_value: str) -> Tuple[Any, Any]:
    parsed = _parse_direct_target(target_value)
    if not parsed:
        raise ValueError('USERNAME_INVALID')

    if parsed['kind'] == 'username':
        entity = await client.get_entity(parsed['value'])

        async def noop_cleanup():
            return None

        return entity, noop_cleanup

    phone = parsed['value']
    result = await client(functions.contacts.ImportContactsRequest(
        contacts=[types.InputPhoneContact(
            client_id=int(time.time() * 1000),
            phone=phone,
            first_name='Direct',
            last_name='Message'
        )]
    ))

    users = list(getattr(result, 'users', []) or [])
    imported_user = users[0] if users else None
    if imported_user is None:
        raise ValueError('PHONE_NUMBER_INVALID')

    entity = await client.get_entity(imported_user)

    async def cleanup():
        try:
            await client(functions.contacts.DeleteByPhonesRequest(phones=[phone]))
        except Exception:
            pass

    return entity, cleanup


async def _load_source_message(client: Any, source_link: str):
    parsed = _parse_message_link(source_link)
    if not parsed or not parsed.get('message_id'):
        raise ValueError('SOURCE_MESSAGE_LINK_INVALID')
    message = await client.get_messages(parsed['peer'], ids=parsed['message_id'])
    if message is None or message.__class__.__name__ == 'MessageEmpty':
        raise ValueError('SOURCE_MESSAGE_LINK_INVALID')
    return parsed, message


def _extract_message_id(result: Any) -> int | None:
    message_id = getattr(result, 'id', None)
    return int(message_id) if isinstance(message_id, int) else None


async def _send_message(client: Any, entity: Any, payload: Dict[str, Any]) -> int | None:
    message_type = str(payload.get('messageType') or 'text').strip() or 'text'
    message_text = str(payload.get('messageText') or '').strip()
    random_emoji_enabled = payload.get('randomEmojiEnabled')
    image_url = str(payload.get('imageUrl') or '').strip()
    source_link = str(payload.get('sourceLink') or '').strip()
    postbot_code = str(payload.get('postbotCode') or '').strip()

    if message_type == 'channel_forward':
        parsed, _ = await _load_source_message(client, source_link)
        result = await client.forward_messages(entity, parsed['message_id'], parsed['peer'], drop_author=False)
        if isinstance(result, list) and result:
            return _extract_message_id(result[0])
        return _extract_message_id(result)

    if message_type == 'hidden_channel_forward':
        _, source_message = await _load_source_message(client, source_link)
        source_text = str(getattr(source_message, 'message', '') or '').strip()
        source_media = getattr(source_message, 'media', None)
        source_entities = getattr(source_message, 'entities', None) or None
        if not source_text and source_media is None:
            raise ValueError('MEDIA_EMPTY')
        if source_media is not None:
            result = await client.send_file(entity, source_media, caption=source_text or None, formatting_entities=source_entities)
            return _extract_message_id(result)
        result = await client.send_message(entity, source_text or '', formatting_entities=source_entities)
        return _extract_message_id(result)

    if message_type == 'postbot_code':
        inline_bot = await client.get_entity('@postbot')
        inline_results = await client(functions.messages.GetInlineBotResultsRequest(
            bot=inline_bot,
            peer=entity,
            query=postbot_code,
            offset=''
        ))
        first_result = inline_results.results[0] if getattr(inline_results, 'results', None) else None
        if first_result is None or not getattr(first_result, 'id', None):
            raise ValueError('POSTBOT_RESULT_EMPTY')
        updates = await client(functions.messages.SendInlineBotResultRequest(
            peer=entity,
            query_id=inline_results.query_id,
            id=first_result.id,
            random_id=utils.generate_random_long(),
            clear_draft=True
        ))
        return _extract_message_id(updates)

    final_text = _build_direct_text_message(message_text, random_emoji_enabled) if message_type == 'text' else message_text
    media = _resolve_media_file(image_url, final_text or str(payload.get('targetValue') or 'direct_message')) if image_url else None
    if media is not None:
        result = await client.send_file(entity, media, caption=final_text or None)
        return _extract_message_id(result)

    result = await client.send_message(entity, final_text or '')
    return _extract_message_id(result)


async def _run(command: Dict[str, Any]) -> Dict[str, Any]:
    session_path = str(command.get('sessionPath') or '').strip()
    action = str(command.get('action') or '').strip().lower()
    timeout_seconds = max(15, _safe_int(command.get('timeoutSeconds'), 30))

    if not session_path or not Path(session_path).exists():
        return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}
    if action not in {'send', 'pin', 'delete'}:
        return {'ok': False, 'reason': 'UNKNOWN_ACTION'}

    proxy = _build_proxy_config(command)
    client = TelethonClient(session_path, DEFAULT_API_ID, DEFAULT_API_HASH, receive_updates=False, proxy=proxy)
    cleanup = None
    try:
        await asyncio.wait_for(client.connect(), timeout=timeout_seconds)
        authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=timeout_seconds)
        if not authorized:
            return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

        entity, cleanup = await _resolve_send_entity(client, str(command.get('targetValue') or ''))

        if action == 'send':
            message_id = await asyncio.wait_for(_send_message(client, entity, command), timeout=timeout_seconds)
            return {'ok': True, 'messageId': message_id}

        message_id = _safe_int(command.get('messageId'), 0)
        if message_id <= 0:
            return {'ok': False, 'reason': 'MESSAGE_ID_INVALID'}

        if action == 'pin':
            await asyncio.wait_for(client.pin_message(entity, message_id, notify=False, pm_oneside=True), timeout=timeout_seconds)
            return {'ok': True, 'messageId': message_id}

        revoke = str(command.get('deleteMode') or 'none').strip().lower() == 'both'
        await asyncio.wait_for(client.delete_messages(entity, [message_id], revoke=revoke), timeout=timeout_seconds)
        return {'ok': True, 'messageId': message_id}
    except Exception as exc:
        return {'ok': False, 'reason': str(exc) or exc.__class__.__name__}
    finally:
        if cleanup is not None:
            try:
                await cleanup()
            except Exception:
                pass
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
