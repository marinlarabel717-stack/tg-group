import asyncio
import base64
import io
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from telethon import TelegramClient as TelethonClient, functions, types, utils

DEFAULT_API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040') or '2040')
DEFAULT_API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627').strip() or 'b18441a1ff607e10a989891a5462e627'

USERNAME_LINK_RE = re.compile(r'(?:https?://)?t\.me/([A-Za-z0-9_]{5,32})\b', re.I)
USERNAME_AT_RE = re.compile(r'@([A-Za-z0-9_]{5,32})\b')
CHATLIST_RE = re.compile(r'(?:https?://)?t\.me/addlist/([A-Za-z0-9_-]+)', re.I)


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


def _extract_chatlist_slug(raw: str) -> str:
    matched = CHATLIST_RE.search(str(raw or '').strip())
    return matched.group(1).strip() if matched else ''


def _normalize_candidate(raw: str) -> Dict[str, Any]:
    value = str(raw or '').strip()
    if not value:
        return {
            'raw': raw,
            'normalized': '',
            'kind': 'username',
            'candidate': None,
            'invalidReason': '空内容已跳过'
        }

    link_matched = re.match(r'^(?:https?://)?t\.me/([^/?#]+)(?:[/?#].*)?$', value, re.I)
    if link_matched and link_matched.group(1):
        path_value = link_matched.group(1).strip()
        if not path_value or path_value == '+' or re.match(r'^(joinchat|c)$', path_value, re.I):
            return {
                'raw': raw,
                'normalized': value,
                'kind': 'link',
                'candidate': None,
                'invalidReason': '这不是公开用户名链接，当前只能筛公开 @username / t.me/username'
            }

        candidate = re.sub(r'[^a-z0-9_]+', '', path_value.lower().lstrip('@'))
        if not candidate:
            return {
                'raw': raw,
                'normalized': value,
                'kind': 'link',
                'candidate': None,
                'invalidReason': '链接里没有可用的公开用户名'
            }

        return {
            'raw': raw,
            'normalized': f'https://t.me/{candidate}',
            'kind': 'link',
            'candidate': candidate,
            'cleanedFromRaw': candidate != path_value.lower().lstrip('@')
        }

    direct_candidate = value.lstrip('@')
    candidate = re.sub(r'[^a-z0-9_]+', '', direct_candidate.lower())
    if not candidate:
        return {
            'raw': raw,
            'normalized': value,
            'kind': 'username',
            'candidate': None,
            'invalidReason': '这里不是可识别的用户名'
        }

    return {
        'raw': raw,
        'normalized': f'@{candidate}',
        'kind': 'username',
        'candidate': candidate,
        'cleanedFromRaw': candidate != direct_candidate.lower()
    }


def _is_candidate_pattern_acceptable(candidate: str) -> bool:
    return bool(re.match(r'^[a-z][a-z0-9_]{4,31}$', candidate or '', re.I))


def _read_entity_type(entity: Any) -> str:
    if isinstance(entity, types.User):
        return 'bot' if getattr(entity, 'bot', False) else 'user'
    if isinstance(entity, types.Channel):
        return 'channel' if getattr(entity, 'broadcast', False) else 'group'
    if isinstance(entity, types.Chat):
        return 'group'
    return 'unknown'


def _read_entity_label(entity_type: str) -> str:
    if entity_type == 'user':
        return '用户'
    if entity_type == 'bot':
        return '机器人'
    if entity_type == 'group':
        return '群组'
    if entity_type == 'channel':
        return '频道'
    return '目标'


def _read_title_from_entity(entity: Any) -> str:
    username = str(getattr(entity, 'username', '') or '').strip()
    if isinstance(entity, (types.Channel, types.Chat)):
        title = str(getattr(entity, 'title', '') or '').strip()
        if title:
            return title
    title = str(utils.get_display_name(entity) or '').strip()
    if title:
        return title
    if username:
        return '@' + username.lstrip('@')
    peer_id = _read_peer_id(entity)
    if peer_id:
        return f'peer:{peer_id}'
    return '未命名来源'


def _read_peer_id(entity: Any) -> str:
    try:
        return str(utils.get_peer_id(entity))
    except Exception:
        return ''


def _build_entity_ref(entity: Any, fallback: str) -> str:
    username = str(getattr(entity, 'username', '') or '').strip()
    if username:
        return f'https://t.me/{username.lstrip("@")}'
    peer_id = _read_peer_id(entity)
    if peer_id:
        return f'peer:{peer_id}'
    return str(fallback or '').strip() or _read_title_from_entity(entity)


async def _resolve_entity(client: Any, value: str):
    try:
        return await client.get_entity(value)
    except Exception as first_error:
        username = str(value or '').replace('@', '').strip()
        if not username or username.startswith('peer:'):
            raise first_error
        return await client.get_entity(f'https://t.me/{username}')


async def _resolve_username_state(client: Any, item: Dict[str, Any]) -> Dict[str, str]:
    candidate = item.get('candidate')
    if not candidate:
        return {
            'category': 'forbidden',
            'reason': item.get('invalidReason') or '当前内容无法识别成公开用户名',
            'entityType': 'unknown'
        }

    if not _is_candidate_pattern_acceptable(str(candidate)):
        return {
            'category': 'forbidden',
            'reason': '清洗后仍不符合 Telegram 用户名规则，不能继续占位',
            'entityType': 'unknown'
        }

    try:
        entity = await client.get_entity(f'https://t.me/{candidate}')
        entity_type = _read_entity_type(entity)
        return {
            'category': 'valid',
            'reason': f'已查到真实{_read_entity_label(entity_type)}，这个用户名当前是存在的。',
            'entityType': entity_type
        }
    except Exception as error:
        message = str(error)
        upper = message.upper()
        if 'USERNAME_OCCUPIED' in upper:
            return {
                'category': 'valid',
                'reason': '这个用户名当前已被占用，可视为真实存在的公开用户名。',
                'entityType': 'unknown'
            }
        if any(key in upper for key in ['USERNAME_INVALID', 'USERNAMES_UNAVAILABLE', 'USERNAME_PURCHASE_AVAILABLE', 'USERNAME_NOT_MODIFIED']):
            return {
                'category': 'forbidden',
                'reason': '这个用户名属于违禁、保留或不可用状态，不能继续占位。',
                'entityType': 'unknown'
            }
        if not any(key in upper for key in ['NO USER HAS', 'USERNAME NOT OCCUPIED', 'USERNAME_NOT_OCCUPIED', 'CANNOT FIND ANY ENTITY']):
            return {
                'category': 'forbidden',
                'reason': f'查询失败：{message}',
                'entityType': 'unknown'
            }

    try:
        available = await client(functions.account.CheckUsernameRequest(username=str(candidate)))
        if bool(available):
            reason = f'原值本身不可直接用，但清洗成 {item.get("normalized")} 后可以继续占位。' if item.get('cleanedFromRaw') else '当前没有真实目标占用这个用户名，可以继续占位。'
            return {
                'category': 'occupiable',
                'reason': reason,
                'entityType': 'unknown'
            }
        return {
            'category': 'valid',
            'reason': '这个用户名当前已被 Telegram 占用，不属于可占位状态。',
            'entityType': 'unknown'
        }
    except Exception as error:
        message = str(error)
        upper = message.upper()
        if any(key in upper for key in ['USERNAME_INVALID', 'USERNAMES_UNAVAILABLE', 'USERNAME_PURCHASE_AVAILABLE']):
            return {
                'category': 'forbidden',
                'reason': '这个用户名属于违禁、保留或不可用状态，不能继续占位。',
                'entityType': 'unknown'
            }
        if 'USERNAME_OCCUPIED' in upper:
            return {
                'category': 'valid',
                'reason': '这个用户名当前已被占用，可视为真实存在的公开用户名。',
                'entityType': 'unknown'
            }
        return {
            'category': 'forbidden',
            'reason': f'检查占位状态失败：{message}',
            'entityType': 'unknown'
        }


def _read_message_text(message: Any) -> str:
    return str(getattr(message, 'raw_text', '') or getattr(message, 'message', '') or '').strip()


def _read_message_date(message: Any) -> str:
    value = getattr(message, 'date', None)
    if value is None:
        return ''
    try:
        return value.isoformat()
    except Exception:
        return str(value)


def _read_message_urls(message: Any) -> List[str]:
    urls: List[str] = []

    buttons = getattr(message, 'buttons', None) or []
    for row in buttons:
        if not isinstance(row, list):
            continue
        for button in row:
            value = str(getattr(button, 'url', '') or '').strip()
            if value:
                urls.append(value)

    entities = getattr(message, 'entities', None) or []
    for entity in entities:
        if isinstance(entity, types.MessageEntityTextUrl):
            value = str(getattr(entity, 'url', '') or '').strip()
            if value:
                urls.append(value)

    return urls


def _read_source_blob(message: Any) -> str:
    text = _read_message_text(message)
    urls = _read_message_urls(message)
    return '\n'.join([part for part in [text, *urls] if part])


def _matches_keywords(text: str, include_keywords: List[str], exclude_keywords: List[str]) -> bool:
    normalized = text.lower()
    if any(item and item in normalized for item in exclude_keywords):
        return False
    if not include_keywords:
        return True
    return any(item and item in normalized for item in include_keywords)


def _extract_candidates_from_text(value: str) -> List[str]:
    results: List[str] = []
    for pattern in [USERNAME_LINK_RE, USERNAME_AT_RE]:
        for matched in pattern.finditer(value or ''):
            token = str(matched.group(0) or '').strip()
            if token:
                results.append(token)
    return results


def _make_excerpt(message: str, fallback: str = '') -> str:
    source = (message or '').strip() or (fallback or '').strip()
    if not source:
        return '（没有可展示的正文）'
    return source[:120] + '…' if len(source) > 120 else source


def _read_username_value(normalized: str) -> str:
    value = str(normalized or '').strip()
    if value.startswith('https://t.me/'):
        return value.replace('https://t.me/', '').strip()
    return value.lstrip('@').strip()


def _expand_template(template: str, candidate: str, account_id: int, index: int) -> str:
    value = str(template or '')
    value = re.sub(r'\{candidate\}', candidate, value, flags=re.I)
    value = re.sub(r'\{accountId\}', str(account_id), value, flags=re.I)
    value = re.sub(r'\{index\}|\{n\}', str(index + 1), value, flags=re.I)
    return value


def _build_listener_carrier_title(command: Dict[str, Any], candidate: str, account_id: int, index: int) -> str:
    template = str(command.get('createCarrierTitleTemplate') or '').strip() or '监听占位_{candidate}'
    value = _expand_template(template, candidate, account_id, index).strip()
    return (value or f'监听占位_{candidate}')[:128]


def _build_listener_carrier_about(command: Dict[str, Any], candidate: str, account_id: int, index: int) -> str:
    template = str(command.get('createCarrierAboutTemplate') or '').strip()
    if not template:
        return f'自动监听命中 {candidate} 后创建的占位频道。'
    return _expand_template(template, candidate, account_id, index).strip()[:255]


def _slugify_file_name(value: str) -> str:
    cleaned = re.sub(r'[^\w.-]+', '_', str(value or '').strip(), flags=re.U).strip('_')
    return cleaned or 'sniper_post'


def _infer_image_extension(mime_type: str) -> str:
    lowered = str(mime_type or '').lower()
    if 'png' in lowered:
        return 'png'
    if 'jpeg' in lowered or 'jpg' in lowered:
        return 'jpg'
    if 'webp' in lowered:
        return 'webp'
    if 'gif' in lowered:
        return 'gif'
    return 'bin'


def _resolve_media_file(image_data: str, title: str):
    value = str(image_data or '').strip()
    if not value:
        return None
    if not value.startswith('data:'):
        return value

    matched = re.match(r'^data:([^;,]+)?(;base64)?,(.*)$', value, re.S)
    if not matched:
        raise RuntimeError('图片 Data URL 格式不正确')

    mime_type = matched.group(1) or 'application/octet-stream'
    body = matched.group(3) or ''
    if matched.group(2):
        data = base64.b64decode(body)
    else:
        data = body.encode('utf-8')

    file_obj = io.BytesIO(data)
    file_obj.name = f'{_slugify_file_name(title)}.{_infer_image_extension(mime_type)}'
    return file_obj


def _format_post_error(error: Exception) -> str:
    message = str(error)
    upper = message.upper()
    if any(key in upper for key in ['PHOTO_INVALID', 'MEDIA_INVALID', 'IMAGE_PROCESS_FAILED']):
        return '图片格式不对，Telegram 没收下。'
    if any(key in upper for key in ['MESSAGE_TOO_LONG', 'MEDIA_CAPTION_TOO_LONG']):
        return '文案太长了，发不出去。'
    if 'CHAT_SEND_MEDIA_FORBIDDEN' in upper:
        return '这个频道当前不允许发媒体。'
    if 'CHAT_WRITE_FORBIDDEN' in upper or 'CHAT_ADMIN_REQUIRED' in upper:
        return '这个频道当前没有发帖权限。'
    return f'首帖发送失败：{message}'


async def _send_initial_post(client: Any, entity: Any, command: Dict[str, Any], title: str):
    post_type = str(command.get('postType') or 'none').strip()
    if post_type == 'none':
        return
    message = str(command.get('postText') or '').strip() or None
    if post_type == 'photo':
        file = _resolve_media_file(str(command.get('postImageData') or ''), title)
        await client.send_file(entity, file, caption=message)
        return
    await client.send_message(entity, message or '')


async def _expand_source_entities(client: Any, refs: List[str], join_chatlists: bool) -> Dict[str, Any]:
    expanded_sources: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    chatlist_join_count = 0

    for ref in refs:
        slug = _extract_chatlist_slug(ref)
        if not slug:
            entity = await _resolve_entity(client, ref)
            source_ref = _build_entity_ref(entity, ref)
            key = f'{_read_entity_type(entity)}:{source_ref}'
            if key in seen:
                continue
            seen.add(key)
            expanded_sources.append({
                'ref': source_ref,
                'title': _read_title_from_entity(entity),
                'entity': entity,
                'kind': _read_entity_type(entity)
            })
            continue

        invite = await client(functions.chatlists.CheckChatlistInviteRequest(slug=slug))
        invite_chats = [chat for chat in list(getattr(invite, 'chats', None) or []) if _read_entity_type(chat) in {'channel', 'group'}]
        missing_peer_keys = {_read_peer_id(peer) for peer in list(getattr(invite, 'missing_peers', None) or []) if _read_peer_id(peer)}
        peers_to_join = [chat for chat in invite_chats if not missing_peer_keys or _read_peer_id(chat) in missing_peer_keys]

        if join_chatlists and peers_to_join:
            input_peers = [await client.get_input_entity(chat) for chat in peers_to_join]
            await client(functions.chatlists.JoinChatlistInviteRequest(slug=slug, peers=input_peers))
            chatlist_join_count += len(input_peers)

        for entity in invite_chats:
            source_ref = _build_entity_ref(entity, f'https://t.me/addlist/{slug}')
            key = f'{_read_entity_type(entity)}:{source_ref}'
            if key in seen:
                continue
            seen.add(key)
            expanded_sources.append({
                'ref': source_ref,
                'title': _read_title_from_entity(entity),
                'entity': entity,
                'kind': _read_entity_type(entity)
            })

    return {
        'expanded_sources': expanded_sources,
        'chatlist_join_count': chatlist_join_count
    }


async def _scan_sources(client: Any, command: Dict[str, Any]) -> Dict[str, Any]:
    source_refs = [str(item).strip() for item in list(command.get('sourceRefs') or []) if str(item).strip()]
    source_message_limit = max(1, min(100, _safe_int(command.get('sourceMessageLimit'), 20)))
    include_keywords = [str(item).lower() for item in list(command.get('includeKeywords') or []) if str(item).strip()]
    exclude_keywords = [str(item).lower() for item in list(command.get('excludeKeywords') or []) if str(item).strip()]
    seen_message_keys = {str(item).strip() for item in list(command.get('seenMessageKeys') or []) if str(item).strip()}
    handled_candidate_keys = {str(item).strip().lower() for item in list(command.get('handledCandidateKeys') or []) if str(item).strip()}
    join_chatlists = bool(command.get('joinChatlists', True))

    expanded = await _expand_source_entities(client, source_refs, join_chatlists)
    expanded_sources = expanded['expanded_sources']
    items: List[Dict[str, Any]] = []
    candidate_count = 0
    checked_message_count = 0
    new_seen_message_keys: List[str] = []
    handled_in_pass: Set[str] = set()

    for source in expanded_sources:
        messages = [message async for message in client.iter_messages(source['entity'], limit=source_message_limit)]
        messages.reverse()
        for message in messages:
            message_id = getattr(message, 'id', None)
            key = f"{source['ref']}:{message_id}" if message_id is not None else ''
            if key and key in seen_message_keys:
                continue
            if key:
                seen_message_keys.add(key)
                new_seen_message_keys.append(key)

            blob = _read_source_blob(message)
            if not blob or not _matches_keywords(blob, include_keywords, exclude_keywords):
                continue

            checked_message_count += 1
            text = _read_message_text(message)

            for found in _extract_candidates_from_text(blob):
                normalized = _normalize_candidate(found)
                candidate_key = str(normalized.get('normalized') or '').lower()
                if not normalized.get('candidate') or not candidate_key:
                    continue
                if candidate_key in handled_candidate_keys or candidate_key in handled_in_pass:
                    continue

                resolved = await _resolve_username_state(client, normalized)
                candidate_count += 1
                handled_in_pass.add(candidate_key)
                items.append({
                    'raw': normalized.get('raw') or found,
                    'normalized': normalized.get('normalized') or found,
                    'kind': normalized.get('kind') or 'username',
                    'category': resolved.get('category') or 'forbidden',
                    'reason': resolved.get('reason') or '',
                    'entityType': resolved.get('entityType') or 'unknown',
                    'sourceRef': source['ref'],
                    'sourceTitle': source['title'],
                    'sourceExcerpt': _make_excerpt(text, found),
                    'sourceMessageId': str(message_id or ''),
                    'sourceDate': _read_message_date(message)
                })

    return {
        'expandedSourceCount': len(expanded_sources),
        'chatlistJoinCount': expanded['chatlist_join_count'],
        'checkedMessageCount': checked_message_count,
        'candidateCount': candidate_count,
        'newSeenMessageKeys': new_seen_message_keys,
        'items': items
    }


async def _claim_with_pool(client: Any, command: Dict[str, Any]) -> Dict[str, Any]:
    carrier_ref = str(command.get('carrierRef') or '').strip()
    username = _read_username_value(str(command.get('normalizedCandidate') or ''))
    entity = await _resolve_entity(client, carrier_ref)
    current_username = str(getattr(entity, 'username', '') or '').strip()

    available = await client(functions.channels.CheckUsernameRequest(channel=entity, username=username))
    if not bool(available):
        raise RuntimeError('USERNAME_OCCUPIED')

    await client(functions.channels.UpdateUsernameRequest(channel=entity, username=username))
    title = _read_title_from_entity(entity)
    return {
        'claimTargetTitle': title,
        'claimTargetRef': f'https://t.me/{username}',
        'claimMessage': f'已把池子载体 {title}（原 @{current_username}）改成 @{username}。' if current_username else f'已把池子载体 {title} 绑定成 @{username}。'
    }


async def _rollback_created_entity(client: Any, entity: Any):
    await client(functions.channels.DeleteChannelRequest(channel=entity))


async def _create_carrier_and_claim(client: Any, command: Dict[str, Any]) -> Dict[str, Any]:
    username = _read_username_value(str(command.get('normalizedCandidate') or ''))
    account_id = _safe_int(command.get('accountId'), 0)
    created_index = _safe_int(command.get('createdIndex'), 0)
    title = _build_listener_carrier_title(command, username, account_id, created_index)
    about = _build_listener_carrier_about(command, username, account_id, created_index)

    response = await client(functions.channels.CreateChannelRequest(title=title, about=about, broadcast=True, megagroup=False))
    chats = list(getattr(response, 'chats', None) or [])
    created_entity = chats[0] if chats else None
    if created_entity is None:
        raise RuntimeError('CREATE_CARRIER_FAILED')

    try:
        available = await client(functions.channels.CheckUsernameRequest(channel=created_entity, username=username))
        if not bool(available):
            raise RuntimeError('USERNAME_OCCUPIED')

        await client(functions.channels.UpdateUsernameRequest(channel=created_entity, username=username))

        post_failure_message = ''
        post_sent = False
        if str(command.get('postType') or 'none').strip() != 'none':
            try:
                await _send_initial_post(client, created_entity, command, title)
                post_sent = True
            except Exception as post_error:
                post_failure_message = _format_post_error(post_error)

        claim_message = f'已自动创建频道 {title} 并绑定成 @{username}。'
        if str(command.get('postType') or 'none').strip() != 'none':
            if post_failure_message:
                claim_message = f'已自动创建频道 {title} 并绑定成 @{username}，但首帖发送失败：{post_failure_message}'
            elif post_sent:
                claim_message = f'已自动创建频道 {title} 并绑定成 @{username}，并已发送首帖。'

        return {
            'claimTargetTitle': _read_title_from_entity(created_entity) or title,
            'claimTargetRef': f'https://t.me/{username}',
            'claimMessage': claim_message,
            'postSent': post_sent,
            'postFailureMessage': post_failure_message or None
        }
    except Exception:
        try:
            await _rollback_created_entity(client, created_entity)
        except Exception:
            pass
        raise


async def _run(command: Dict[str, Any]) -> Dict[str, Any]:
    action = str(command.get('action') or '').strip()
    session_path = str(command.get('sessionPath') or '').strip()
    timeout_seconds = max(20, _safe_int(command.get('timeoutSeconds'), 35))

    if not session_path or not Path(session_path).exists():
        return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

    proxy = _build_proxy_config(command)
    client = TelethonClient(session_path, DEFAULT_API_ID, DEFAULT_API_HASH, receive_updates=False, proxy=proxy)
    try:
        await asyncio.wait_for(client.connect(), timeout=timeout_seconds)
        authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=timeout_seconds)
        if not authorized:
            return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

        if action == 'scan_sources':
            result = await asyncio.wait_for(_scan_sources(client, command), timeout=timeout_seconds)
        elif action == 'claim_with_pool':
            result = await asyncio.wait_for(_claim_with_pool(client, command), timeout=timeout_seconds)
        elif action == 'create_carrier_and_claim':
            result = await asyncio.wait_for(_create_carrier_and_claim(client, command), timeout=timeout_seconds)
        else:
            return {'ok': False, 'reason': 'INVALID_ACTION'}

        return {'ok': True, 'result': result}
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
