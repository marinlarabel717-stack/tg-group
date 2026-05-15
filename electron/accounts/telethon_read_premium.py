import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

from telethon import TelegramClient as TelethonClient, functions

DEFAULT_API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040') or '2040')
DEFAULT_API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627').strip() or 'b18441a1ff607e10a989891a5462e627'


def _parse_proxy(payload: Any):
    if payload is None:
        return None
    if not isinstance(payload, dict):
        raise ValueError('INVALID_PROXY_PAYLOAD')

    proxy_type = str(payload.get('type') or '').strip().lower()
    if proxy_type == 'https':
        raise ValueError('UNSUPPORTED_PROXY_TYPE_HTTPS')
    if proxy_type not in ('http', 'socks5'):
        raise ValueError(f'UNSUPPORTED_PROXY_TYPE:{proxy_type or "unknown"}')

    host = str(payload.get('host') or '').strip()
    port = max(0, int(payload.get('port') or 0))
    if not host or port <= 0:
        raise ValueError('INVALID_PROXY_ENDPOINT')

    username = str(payload.get('username') or '').strip() or None
    password = str(payload.get('password') or '').strip() or None
    return {
        'proxy_type': proxy_type,
        'addr': host,
        'port': port,
        'username': username,
        'password': password,
        'rdns': True,
    }


def _normalize_status_text(result: Any) -> str:
    for key in ('status_text', 'statusText'):
        value = getattr(result, key, None)
        if isinstance(value, str):
            return value
    return ''


async def _run(command: Dict[str, Any]) -> Dict[str, Any]:
    session_path = str(command.get('sessionPath') or '').strip()
    timeout_seconds = max(20, int(command.get('timeoutSeconds') or 35))
    proxy = _parse_proxy(command.get('proxy'))

    if not session_path or not Path(session_path).exists():
        return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

    client = TelethonClient(session_path, DEFAULT_API_ID, DEFAULT_API_HASH, receive_updates=False, proxy=proxy)
    try:
        await asyncio.wait_for(client.connect(), timeout=timeout_seconds)
        authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=timeout_seconds)
        if not authorized:
            return {'ok': False, 'reason': 'not authorized'}

        result = await asyncio.wait_for(client(functions.help.GetPremiumPromoRequest()), timeout=timeout_seconds)
        return {
            'ok': True,
            'status_text': _normalize_status_text(result)
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
