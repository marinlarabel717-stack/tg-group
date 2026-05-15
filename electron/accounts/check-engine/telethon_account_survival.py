import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

from telethon import TelegramClient as TelethonClient
from telethon.tl import functions, types

DEFAULT_API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040') or '2040')
DEFAULT_API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627').strip() or 'b18441a1ff607e10a989891a5462e627'
DEFAULT_TIMEOUT_SECONDS = max(5, int(os.getenv('ACCOUNT_CHECK_TIMEOUT_SECONDS', '25') or '25'))


def _parse_proxy(raw_value: str):
    if not raw_value:
        return None

    try:
        payload = json.loads(raw_value)
    except Exception as exc:
        raise ValueError(f'INVALID_PROXY_PAYLOAD:{exc}') from exc

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


async def _run(session_path: str, timeout_seconds: int, proxy: Dict[str, Any] | None = None) -> Dict[str, Any]:
    client = TelethonClient(session_path, DEFAULT_API_ID, DEFAULT_API_HASH, receive_updates=False, proxy=proxy)
    try:
        await asyncio.wait_for(client.connect(), timeout=timeout_seconds)
        authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=timeout_seconds)
        if not authorized:
            return {'status': 'not_logged_in', 'reason': 'session_not_authorized'}

        me = await asyncio.wait_for(client.get_me(), timeout=timeout_seconds)
        if me is None:
            return {'status': 'unknown', 'reason': 'account_not_found'}

        result = await asyncio.wait_for(
            client(functions.account.SetAccountTTLRequest(ttl=types.AccountDaysTTL(days=730))),
            timeout=timeout_seconds,
        )
        if result is False:
            return {'status': 'unknown', 'reason': 'set_account_ttl_failed'}

        return {
            'status': 'ok',
            'reason': 'ok',
            'user_id': getattr(me, 'id', None),
            'first_name': getattr(me, 'first_name', None),
            'last_name': getattr(me, 'last_name', None),
            'username': getattr(me, 'username', None),
            'phone': getattr(me, 'phone', None),
            'premium': bool(getattr(me, 'premium', False)),
            'ttl_days': 730,
        }
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
    timeout_seconds = max(5, int(sys.argv[2])) if len(sys.argv) > 2 else DEFAULT_TIMEOUT_SECONDS
    proxy = _parse_proxy(sys.argv[3]) if len(sys.argv) > 3 else None

    if not session_path or not Path(session_path).exists():
        print(json.dumps({'status': 'unknown', 'reason': 'session_file_missing'}, ensure_ascii=False))
        return

    try:
        result = await _run(session_path, timeout_seconds, proxy)
    except Exception as exc:
        result = {
            'status': 'unknown',
            'reason': str(exc) or exc.__class__.__name__,
        }

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(_main())
