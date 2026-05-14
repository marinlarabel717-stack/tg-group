import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

from telethon import TelegramClient as TelethonClient
from telethon import utils

DEFAULT_API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040') or '2040')
DEFAULT_API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627').strip() or 'b18441a1ff607e10a989891a5462e627'


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _serialize_dialog(dialog: Any) -> Dict[str, Any] | None:
    entity = getattr(dialog, 'entity', None)
    if entity is None:
        return None

    is_group = bool(getattr(dialog, 'is_group', False))
    is_channel = bool(getattr(dialog, 'is_channel', False))
    is_broadcast = bool(getattr(entity, 'broadcast', False))
    if not is_group and not (is_channel and not is_broadcast):
        return None

    title = str(getattr(dialog, 'title', '') or getattr(entity, 'title', '') or '').strip()
    if not title:
        return None

    username = str(getattr(entity, 'username', '') or '').strip()
    username = f'@{username.lstrip("@")} ' if username else ''
    username = username.strip()
    peer_id = str(utils.get_peer_id(entity))
    participants = getattr(entity, 'participants_count', None)
    if not isinstance(participants, int):
        participants = 0

    return {
        'peerId': peer_id,
        'title': title,
        'username': username,
        'targetRef': username or peer_id,
        'memberCount': participants,
        'type': 'supergroup' if is_channel else 'group'
    }


async def _collect_dialogs(client: Any, archived: bool) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    async for dialog in client.iter_dialogs(archived=archived):
        serialized = _serialize_dialog(dialog)
        if serialized:
            items.append(serialized)
    return items


async def _run(session_path: str, timeout_seconds: int) -> Dict[str, Any]:
    client = TelethonClient(session_path, DEFAULT_API_ID, DEFAULT_API_HASH, receive_updates=False)
    try:
        await asyncio.wait_for(client.connect(), timeout=timeout_seconds)
        authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=timeout_seconds)
        if not authorized:
            return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

        groups: List[Dict[str, Any]] = []
        seen_keys = set()
        for archived in (False, True):
            dialogs = await asyncio.wait_for(_collect_dialogs(client, archived), timeout=timeout_seconds)
            for item in dialogs:
                key = f"{item['peerId']}::{item.get('username', '')}::{item['title'].strip().lower()}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                groups.append(item)

        groups.sort(key=lambda item: item.get('title', '').lower())
        return {
            'ok': True,
            'total': len(groups),
            'groups': groups,
            'summary': f'Telethon 读取完成，共拿到 {len(groups)} 个群。'
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
    timeout_seconds = max(15, _safe_int(sys.argv[2] if len(sys.argv) > 2 else 30, 30))

    if not session_path or not Path(session_path).exists():
        print(json.dumps({'ok': False, 'reason': 'session_file_missing'}, ensure_ascii=False))
        return

    result = await _run(session_path, timeout_seconds)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(_main())
