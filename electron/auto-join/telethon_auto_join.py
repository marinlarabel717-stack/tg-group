import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict

from telethon import TelegramClient as TelethonClient, functions, types

DEFAULT_API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040') or '2040')
DEFAULT_API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627').strip() or 'b18441a1ff607e10a989891a5462e627'


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


def _extract_invite_hash(raw: str) -> str:
    matched = re.search(r'(?:https?://)?t\.me/(?:joinchat/|\+)([^/?#]+)', raw, re.I)
    return matched.group(1).strip() if matched else ''


def _parse_target(item: Dict[str, Any]) -> Dict[str, str]:
    kind = str(item.get('kind') or '').strip().lower()
    raw = str(item.get('raw') or '').strip()
    normalized = str(item.get('normalized') or '').strip()
    if kind == 'invite':
        return {
            'kind': 'invite',
            'value': _extract_invite_hash(raw) or normalized.replace('https://t.me/+', '').strip()
        }
    value = normalized or raw
    if not value.startswith('@'):
        value = '@' + value.replace('@', '').strip()
    return {
        'kind': 'username',
        'value': value
    }


def _read_group_title(source: Any, fallback: str) -> str:
    chats = getattr(source, 'chats', None) or []
    for chat in chats:
        title = str(getattr(chat, 'title', '') or '').strip()
        if title:
            return title
        username = str(getattr(chat, 'username', '') or '').strip()
        if username:
            return '@' + username.lstrip('@')

    title = str(getattr(source, 'title', '') or '').strip()
    if title:
        return title
    username = str(getattr(source, 'username', '') or '').strip()
    if username:
        return '@' + username.lstrip('@')
    return fallback


async def _resolve_entity(client: Any, value: str):
    try:
        return await client.get_entity(value)
    except Exception as first_error:
        username = value.replace('@', '').strip()
        if not username:
            raise first_error
        return await client.get_entity(f'https://t.me/{username}')


async def _is_already_in_channel(client: Any, entity: Any) -> bool:
    try:
        await client(functions.channels.GetParticipantRequest(channel=entity, participant='me'))
        return True
    except Exception as exc:
        message = str(exc).upper()
        if 'USER_NOT_PARTICIPANT' in message or 'PARTICIPANT_ID_INVALID' in message:
            return False
        raise


async def _join_single_target(client: Any, item: Dict[str, Any]) -> Dict[str, Any]:
    parsed = _parse_target(item)
    fallback_label = str(item.get('normalized') or item.get('raw') or parsed.get('value') or '').strip()

    if parsed['kind'] == 'invite':
        try:
            result = await client(functions.messages.ImportChatInviteRequest(hash=parsed['value']))
            result_name = str(getattr(result, 'class_name', '') or getattr(result, 'CLASS_NAME', '') or result.__class__.__name__)
            if 'ChatInviteAlready' in result_name:
                return {'status': 'already', 'groupTitle': _read_group_title(result, fallback_label)}
            return {'status': 'joined', 'groupTitle': _read_group_title(result, fallback_label)}
        except Exception as exc:
            message = str(exc)
            if 'INVITE_REQUEST_SENT' in message:
                return {'status': 'requested', 'groupTitle': fallback_label}
            if 'USER_ALREADY_PARTICIPANT' in message:
                invite = await client(functions.messages.CheckChatInviteRequest(hash=parsed['value']))
                return {'status': 'already', 'groupTitle': _read_group_title(invite, fallback_label)}
            raise

    entity = await _resolve_entity(client, parsed['value'])
    if await _is_already_in_channel(client, entity):
        return {'status': 'already', 'groupTitle': _read_group_title(entity, fallback_label)}

    try:
        await client(functions.channels.JoinChannelRequest(channel=entity))
        return {'status': 'joined', 'groupTitle': _read_group_title(entity, fallback_label)}
    except Exception as exc:
        message = str(exc)
        if 'INVITE_REQUEST_SENT' in message:
            return {'status': 'requested', 'groupTitle': _read_group_title(entity, fallback_label)}
        if 'USER_ALREADY_PARTICIPANT' in message:
            return {'status': 'already', 'groupTitle': _read_group_title(entity, fallback_label)}
        raise


async def _run(command: Dict[str, Any]) -> Dict[str, Any]:
    session_path = str(command.get('sessionPath') or '').strip()
    timeout_seconds = max(20, int(command.get('timeoutSeconds') or 40))
    item = command.get('item') or {}

    if not session_path or not Path(session_path).exists():
        return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

    proxy = _build_proxy_config(command)
    client = TelethonClient(session_path, DEFAULT_API_ID, DEFAULT_API_HASH, receive_updates=False, proxy=proxy)
    try:
        await asyncio.wait_for(client.connect(), timeout=timeout_seconds)
        authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=timeout_seconds)
        if not authorized:
            return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

        result = await asyncio.wait_for(_join_single_target(client, item), timeout=timeout_seconds)
        return {
            'ok': True,
            'status': result.get('status') or 'joined',
            'groupTitle': result.get('groupTitle') or ''
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
