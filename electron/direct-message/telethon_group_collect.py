import asyncio
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

from telethon import TelegramClient as TelethonClient, functions, types

DEFAULT_API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040') or '2040')
DEFAULT_API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627').strip() or 'b18441a1ff607e10a989891a5462e627'


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _extract_invite_hash(raw: str) -> str:
    matched = re.search(r'(?:https?://)?t\.me/(?:joinchat/|\+)([^/?#]+)', raw, re.I)
    return matched.group(1).strip() if matched else ''


def _parse_message_link(raw: str) -> Dict[str, Any]:
    private_matched = re.search(r'(?:https?://)?t\.me/c/(\d+)/(\d+)(?:\?.*)?$', raw, re.I)
    if private_matched:
        return {
            'kind': 'private',
            'channel_id': _safe_int(private_matched.group(1), 0),
            'message_id': _safe_int(private_matched.group(2), 0),
        }

    public_matched = re.search(r'(?:https?://)?t\.me/(?:(?:s|a)/)?([A-Za-z0-9_]{3,})/(\d+)(?:\?.*)?$', raw, re.I)
    if public_matched:
        return {
            'kind': 'public',
            'peer_ref': public_matched.group(1).strip(),
            'message_id': _safe_int(public_matched.group(2), 0),
        }

    return {}


def _extract_public_username(raw: str) -> str:
    matched = re.search(r'(?:https?://)?t\.me/(?:(?:s|a)/)?([A-Za-z0-9_]{5,32})(?:[/?#].*)?$', raw.strip(), re.I)
    return matched.group(1).strip() if matched else ''


def _normalize_username(raw: str) -> str:
    value = raw.replace('@', '').strip()
    return value if re.fullmatch(r'[A-Za-z0-9_]{5,32}', value or '') else ''


def _extract_usernames_from_text(text: str) -> List[str]:
    seen = set()
    output: List[str] = []
    for matched in re.finditer(r'(?<![A-Za-z0-9_])@([A-Za-z0-9_]{5,32})', text or ''):
        username = _normalize_username(matched.group(1) or '')
        lowered = username.lower()
        if not username or lowered in seen:
            continue
        seen.add(lowered)
        output.append(username)
    return output


def _extract_usernames_from_message(message: Any) -> List[str]:
    text = str(getattr(message, 'raw_text', None) or getattr(message, 'message', None) or '')
    seen = set()
    output: List[str] = []

    def append_username(raw: str):
        username = _normalize_username(raw)
        lowered = username.lower()
        if not username or lowered in seen:
            return
        seen.add(lowered)
        output.append(username)

    for username in _extract_usernames_from_text(text):
        append_username(username)

    for entity in getattr(message, 'entities', None) or []:
        if isinstance(entity, types.MessageEntityMention):
            offset = _safe_int(getattr(entity, 'offset', 0), 0)
            length = _safe_int(getattr(entity, 'length', 0), 0)
            if length > 1:
                append_username(text[offset:offset + length])
            continue

        if isinstance(entity, types.MessageEntityTextUrl):
            append_username(_extract_public_username(str(getattr(entity, 'url', '') or '')))
            continue

        if isinstance(entity, types.MessageEntityUrl):
            offset = _safe_int(getattr(entity, 'offset', 0), 0)
            length = _safe_int(getattr(entity, 'length', 0), 0)
            if length > 0:
                append_username(_extract_public_username(text[offset:offset + length]))

    return output


def _normalize_status(user: Any) -> Dict[str, str]:
    status = getattr(user, 'status', None)
    if isinstance(status, types.UserStatusOnline):
        return {'bucket': 'online', 'label': '在线'}
    if isinstance(status, types.UserStatusRecently):
        return {'bucket': 'recent', 'label': '最近在线'}
    if isinstance(status, types.UserStatusLastWeek):
        return {'bucket': 'week', 'label': '近一周'}
    if isinstance(status, types.UserStatusLastMonth):
        return {'bucket': 'month', 'label': '近一月'}
    if isinstance(status, types.UserStatusOffline):
        return {'bucket': 'offline', 'label': '离线'}
    return {'bucket': 'unknown', 'label': '未知'}


def _read_role_map(result: Any) -> Dict[int, str]:
    role_map: Dict[int, str] = {}
    participants = getattr(result, 'participants', None) or []
    for participant in participants:
        user_id = getattr(participant, 'user_id', None)
        if not user_id:
            peer = getattr(participant, 'peer', None)
            user_id = getattr(peer, 'user_id', None)
        if not user_id:
            continue
        if isinstance(participant, types.ChannelParticipantCreator):
            role_map[int(user_id)] = 'owner'
        elif isinstance(participant, types.ChannelParticipantAdmin):
            role_map[int(user_id)] = 'admin'
    return role_map


async def _resolve_entity(client: Any, source: str):
    raw = source.strip()
    invite_hash = _extract_invite_hash(raw)
    if invite_hash:
        invite = await client(functions.messages.CheckChatInviteRequest(hash=invite_hash))
        if isinstance(invite, types.ChatInviteAlready):
            return invite.chat
        imported = await client(functions.messages.ImportChatInviteRequest(hash=invite_hash))
        chats = getattr(imported, 'chats', None) or []
        if chats:
            return chats[0]
        refreshed = await client(functions.messages.CheckChatInviteRequest(hash=invite_hash))
        if isinstance(refreshed, types.ChatInviteAlready):
            return refreshed.chat
        raise RuntimeError('INVITE_IMPORT_FAILED')

    try:
        return await client.get_entity(raw)
    except Exception as first_error:
        username = raw.replace('@', '').strip()
        if not username:
            raise first_error
        return await client.get_entity(f'https://t.me/{username}')


async def _resolve_message_entity(client: Any, source: str):
    parsed = _parse_message_link(source)
    message_id = _safe_int(parsed.get('message_id'), 0)
    if message_id <= 0:
        raise RuntimeError('SOURCE_MESSAGE_LINK_INVALID')

    if parsed.get('kind') == 'public':
        peer_ref = str(parsed.get('peer_ref') or '').strip()
        if not peer_ref:
            raise RuntimeError('SOURCE_MESSAGE_LINK_INVALID')
        entity = await client.get_entity(f'@{peer_ref.replace("@", "")}')
        return entity, message_id

    if parsed.get('kind') == 'private':
        channel_id = _safe_int(parsed.get('channel_id'), 0)
        if channel_id <= 0:
            raise RuntimeError('SOURCE_MESSAGE_LINK_INVALID')
        entity = await client.get_entity(types.PeerChannel(channel_id))
        return entity, message_id

    raise RuntimeError('SOURCE_MESSAGE_LINK_INVALID')


async def _ensure_joined(client: Any, entity: Any):
    if isinstance(entity, types.Channel):
        try:
            await client(functions.channels.GetParticipantRequest(channel=entity, participant='me'))
            return entity
        except Exception as exc:
            message = str(exc).upper()
            if (
                'USER_NOT_PARTICIPANT' not in message
                and 'PARTICIPANT_ID_INVALID' not in message
                and 'NOT A MEMBER OF THE SPECIFIED MEGAGROUP OR CHANNEL' not in message
                and 'TARGET USER IS NOT A MEMBER' not in message
            ):
                raise
        await client(functions.channels.JoinChannelRequest(channel=entity))
    return entity


async def _load_admin_roles(client: Any, entity: Any) -> Dict[int, str]:
    try:
        result = await client(functions.channels.GetParticipantsRequest(
            channel=entity,
            filter=types.ChannelParticipantsAdmins(),
            offset=0,
            limit=200,
            hash=0,
        ))
        return _read_role_map(result)
    except Exception:
        return {}


def _serialize_user(user: Any, role_map: Dict[int, str]) -> Dict[str, Any]:
    user_id = getattr(user, 'id', None)
    status = _normalize_status(user)
    return {
        'id': str(user_id) if user_id is not None else '',
        'username': getattr(user, 'username', '') or '',
        'phone': getattr(user, 'phone', '') or '',
        'first_name': getattr(user, 'first_name', '') or '',
        'last_name': getattr(user, 'last_name', '') or '',
        'bot': bool(getattr(user, 'bot', False)),
        'premium': bool(getattr(user, 'premium', False)),
        'has_avatar': getattr(user, 'photo', None) is not None,
        'role': role_map.get(int(user_id), 'member') if user_id is not None else 'member',
        'status_bucket': status['bucket'],
        'status_label': status['label'],
    }


def _normalize_limit(raw_limit: int, default: int = 100, max_limit: int = 300) -> int:
    limit = _safe_int(raw_limit, default)
    if limit <= 0:
        limit = default
    return max(1, min(limit, max_limit))


async def _collect_contacts(client: Any, limit: int) -> List[Dict[str, Any]]:
    response = await client(functions.contacts.GetContactsRequest(hash=0))
    users = getattr(response, 'users', None) or []
    output: List[Dict[str, Any]] = []
    for user in users[:limit]:
        if isinstance(user, types.User):
            output.append(_serialize_user(user, {}))
    return output


async def _collect_public_members(client: Any, entity: Any, participant_limit: int, role_map: Dict[int, str]) -> List[Dict[str, Any]]:
    limit = max(1, participant_limit) if participant_limit > 0 else None
    users: List[Dict[str, Any]] = []
    collected = 0

    async for user in client.iter_participants(entity):
        users.append(_serialize_user(user, role_map))
        collected += 1
        if limit is not None and collected >= limit:
            break

    return users


async def _collect_comment_users(client: Any, entity: Any, message_id: int, limit: int) -> List[Dict[str, Any]]:
    response = await client(functions.messages.GetRepliesRequest(
        peer=entity,
        msg_id=message_id,
        offset_id=0,
        offset_date=None,
        add_offset=0,
        limit=limit,
        max_id=0,
        min_id=0,
        hash=0,
    ))

    users_by_id: Dict[int, Any] = {}
    for user in getattr(response, 'users', None) or []:
        user_id = getattr(user, 'id', None)
        if isinstance(user, types.User) and user_id is not None:
            users_by_id[int(user_id)] = user

    collected: Dict[int, Dict[str, Any]] = {}
    for message in getattr(response, 'messages', None) or []:
        sender_id = getattr(message, 'sender_id', None)
        if isinstance(sender_id, types.PeerUser):
            user_id = getattr(sender_id, 'user_id', None)
        else:
            user_id = getattr(sender_id, 'user_id', None) or sender_id
        if user_id is None:
            continue
        user_id = _safe_int(user_id, 0)
        if user_id <= 0 or user_id in collected:
            continue
        user = users_by_id.get(user_id)
        if not isinstance(user, types.User):
            continue
        collected[user_id] = _serialize_user(user, {})
        if len(collected) >= limit:
            break

    return list(collected.values())


async def _collect_reaction_users(client: Any, entity: Any, message_id: int, limit: int) -> List[Dict[str, Any]]:
    response = await client(functions.messages.GetMessageReactionsListRequest(
        peer=entity,
        id=message_id,
        limit=limit,
        reaction=None,
        offset='',
    ))

    users: List[Dict[str, Any]] = []
    for user in getattr(response, 'users', None) or []:
        if not isinstance(user, types.User):
            continue
        users.append(_serialize_user(user, {}))
        if len(users) >= limit:
            break

    return users


async def _collect_history_users(client: Any, entity: Any, history_limit: int, history_days: int, role_map: Dict[int, str]) -> List[Dict[str, Any]]:
    limit = max(1, min(history_limit, 5000)) if history_limit > 0 else 5000
    cutoff = None
    if history_days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=history_days)

    users: Dict[int, Dict[str, Any]] = {}
    messages = await client.get_messages(entity, limit=limit)
    for message in messages:
        message_date = getattr(message, 'date', None)
        if cutoff and isinstance(message_date, datetime):
            normalized_date = message_date if message_date.tzinfo else message_date.replace(tzinfo=timezone.utc)
            if normalized_date < cutoff:
                continue
        try:
            sender = await message.get_sender()
        except Exception:
            sender = None
        if sender is None or not isinstance(sender, types.User):
            continue
        user_id = getattr(sender, 'id', None)
        if user_id is None or int(user_id) in users:
            continue
        users[int(user_id)] = _serialize_user(sender, role_map)
    return list(users.values())


async def _collect_channel_mentions(client: Any, entity: Any, history_limit: int, history_days: int) -> List[Dict[str, Any]]:
    limit = max(1, min(history_limit, 5000)) if history_limit > 0 else 2000
    cutoff = None
    if history_days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=history_days)

    users: Dict[str, Dict[str, Any]] = {}
    messages = await client.get_messages(entity, limit=limit)
    for message in messages:
        message_date = getattr(message, 'date', None)
        if cutoff and isinstance(message_date, datetime):
            normalized_date = message_date if message_date.tzinfo else message_date.replace(tzinfo=timezone.utc)
            if normalized_date < cutoff:
                break

        for username in _extract_usernames_from_message(message):
            lowered = username.lower()
            if lowered in users:
                continue
            users[lowered] = {
                'id': f'channel_username:{lowered}',
                'username': username,
                'phone': '',
                'first_name': f'@{username}',
                'last_name': '',
                'bot': False,
                'premium': False,
                'has_avatar': False,
                'role': 'member',
                'status_bucket': 'unknown',
                'status_label': '来自频道正文',
            }

    return list(users.values())


async def _run(session_path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    source = str(payload.get('source') or '').strip()
    mode = str(payload.get('mode') or 'public_members').strip() or 'public_members'
    limit = _normalize_limit(_safe_int(payload.get('limit'), 100), 100, 300)
    participant_limit = _safe_int(payload.get('participantLimit'), 0)
    history_limit = _safe_int(payload.get('historyLimit'), 5000)
    history_days = _safe_int(payload.get('historyDays'), 0)
    timeout_seconds = max(20, _safe_int(payload.get('timeoutSeconds'), 45))

    client = TelethonClient(session_path, DEFAULT_API_ID, DEFAULT_API_HASH, receive_updates=False)
    try:
        await asyncio.wait_for(client.connect(), timeout=timeout_seconds)
        authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=timeout_seconds)
        if not authorized:
            return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

        if mode == 'contact':
            users = await asyncio.wait_for(_collect_contacts(client, limit), timeout=timeout_seconds)
        elif mode == 'group_members':
            entity = await asyncio.wait_for(_resolve_entity(client, source), timeout=timeout_seconds)
            entity = await asyncio.wait_for(_ensure_joined(client, entity), timeout=timeout_seconds)
            role_map = await asyncio.wait_for(_load_admin_roles(client, entity), timeout=timeout_seconds)
            users = await asyncio.wait_for(_collect_public_members(client, entity, limit, role_map), timeout=timeout_seconds)
        elif mode == 'comment_users':
            entity, message_id = await asyncio.wait_for(_resolve_message_entity(client, source), timeout=timeout_seconds)
            users = await asyncio.wait_for(_collect_comment_users(client, entity, message_id, limit), timeout=timeout_seconds)
        elif mode == 'react_users':
            entity, message_id = await asyncio.wait_for(_resolve_message_entity(client, source), timeout=timeout_seconds)
            users = await asyncio.wait_for(_collect_reaction_users(client, entity, message_id, limit), timeout=timeout_seconds)
        elif mode == 'channel_mentions':
            entity = await asyncio.wait_for(_resolve_entity(client, source), timeout=timeout_seconds)
            entity = await asyncio.wait_for(_ensure_joined(client, entity), timeout=timeout_seconds)
            users = await asyncio.wait_for(_collect_channel_mentions(client, entity, history_limit, history_days), timeout=timeout_seconds)
        else:
            entity = await asyncio.wait_for(_resolve_entity(client, source), timeout=timeout_seconds)
            entity = await asyncio.wait_for(_ensure_joined(client, entity), timeout=timeout_seconds)
            role_map = await asyncio.wait_for(_load_admin_roles(client, entity), timeout=timeout_seconds)

            if mode == 'hidden_history':
                users = await asyncio.wait_for(_collect_history_users(client, entity, history_limit, history_days, role_map), timeout=timeout_seconds)
            else:
                users = await asyncio.wait_for(_collect_public_members(client, entity, participant_limit, role_map), timeout=timeout_seconds)

        return {
            'ok': True,
            'total': len(users),
            'users': users,
            'summary': f'Telethon 采集完成，共拿到 {len(users)} 个原始用户。'
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

    session_path = sys.argv[1] if len(sys.argv) > 1 else ''
    payload_raw = sys.argv[2] if len(sys.argv) > 2 else '{}'

    if not session_path or not Path(session_path).exists():
        print(json.dumps({'ok': False, 'reason': 'session_file_missing'}, ensure_ascii=False))
        return

    try:
        payload = json.loads(payload_raw) if payload_raw else {}
    except Exception:
        payload = {}

    result = await _run(session_path, payload)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(_main())
