import asyncio
import json
import os
import sys
from datetime import datetime
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
    port = _safe_int(payload.get('port'))
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


def _json_value_to_python(value: Any):
    if value is None:
        return None
    if isinstance(value, types.JsonObject):
        return {item.key: _json_value_to_python(item.value) for item in value.value}
    if isinstance(value, types.JsonArray):
        return [_json_value_to_python(item) for item in value.value]
    if isinstance(value, types.JsonObjectValue):
        return {value.key: _json_value_to_python(value.value)}
    if isinstance(value, types.JsonString):
        return value.value
    if isinstance(value, types.JsonNumber):
        return value.value
    if isinstance(value, types.JsonBool):
        return value.value
    if isinstance(value, types.JsonNull):
        return None
    if isinstance(value, list):
        return [_json_value_to_python(item) for item in value]
    if isinstance(value, dict):
        return {key: _json_value_to_python(item) for key, item in value.items()}
    return value


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _format_unix_ts(timestamp: Any) -> str:
    ts = _safe_int(timestamp)
    if ts <= 0:
        return ''
    try:
        return datetime.utcfromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S UTC')
    except Exception:
        return ''


def _extract_rpc_error_name(exc: Exception) -> str:
    for attr in ('message', 'name'):
        value = getattr(exc, attr, '')
        if isinstance(value, str) and value:
            return value.upper()
    return str(exc).upper()


def _is_frozen_rpc_error(exc: Exception) -> bool:
    name = _extract_rpc_error_name(exc)
    return 'FROZEN_METHOD_INVALID' in name or 'FROZEN_PARTICIPANT_MISSING' in name


def _classify_rpc_status(exc: Exception) -> str:
    name = _extract_rpc_error_name(exc)
    if 'PHONE_NUMBER_BANNED' in name or 'USER_DEACTIVATED_BAN' in name or 'USER_DEACTIVATED' in name:
        return 'banned'
    if 'AUTH_KEY_UNREGISTERED' in name or 'SESSION_REVOKED' in name or 'SESSION_EXPIRED' in name:
        return 'session_expired'
    if 'UNAUTHORIZED' in name or 'NOT AUTHORIZED' in name:
        return 'not_logged_in'
    if 'TIMEOUT' in name or 'TIMED OUT' in name:
        return 'timeout'
    return 'unknown'


async def _fetch_freeze_metadata(client: Any, timeout_seconds: int) -> Dict[str, Any]:
    try:
        result = await asyncio.wait_for(client(functions.help.GetAppConfigRequest(hash=0)), timeout=timeout_seconds)
    except TypeError:
        result = await asyncio.wait_for(client(functions.help.GetAppConfigRequest(0)), timeout=timeout_seconds)
    except Exception:
        return {}

    config_obj = getattr(result, 'config', None)
    config_map = _json_value_to_python(config_obj)
    if not isinstance(config_map, dict):
        return {}

    freeze_since_date = _safe_int(config_map.get('freeze_since_date'))
    freeze_until_date = _safe_int(config_map.get('freeze_until_date'))
    freeze_appeal_url = str(config_map.get('freeze_appeal_url') or '').strip()
    return {
        'freeze_since_date': freeze_since_date,
        'freeze_until_date': freeze_until_date,
        'freeze_since_text': _format_unix_ts(freeze_since_date),
        'freeze_until_text': _format_unix_ts(freeze_until_date),
        'freeze_appeal_url': freeze_appeal_url,
    }


def _extract_message_text(message: Any) -> str:
    text = getattr(message, 'message', None)
    return text.strip() if isinstance(text, str) else ''


def _is_incoming_message(message: Any) -> bool:
    return not bool(getattr(message, 'out', False))


async def _read_spambot_reply(client: Any, timeout_seconds: int) -> Dict[str, Any]:
    entity = await asyncio.wait_for(client.get_entity('SpamBot'), timeout=timeout_seconds)
    before_messages = await asyncio.wait_for(client.get_messages(entity, limit=1), timeout=timeout_seconds)
    before_id = before_messages[0].id if before_messages else 0

    await asyncio.wait_for(client.send_message(entity, '/start'), timeout=timeout_seconds)

    for _ in range(6):
        await asyncio.sleep(1.2)
        messages = await asyncio.wait_for(client.get_messages(entity, limit=5), timeout=timeout_seconds)
        for message in messages:
            if _is_incoming_message(message) and getattr(message, 'id', 0) > before_id:
                reply_text = _extract_message_text(message)
                if reply_text:
                    return {
                        'status': 'reply',
                        'reply_text': reply_text,
                    }

    fallback_messages = await asyncio.wait_for(client.get_messages(entity, limit=5), timeout=timeout_seconds)
    for message in fallback_messages:
        if _is_incoming_message(message):
            reply_text = _extract_message_text(message)
            if reply_text:
                return {
                    'status': 'reply',
                    'reply_text': reply_text,
                }

    return {
        'status': 'timeout',
        'reason': 'spambot_reply_timeout',
    }


async def _probe_session(session_path: str, timeout_seconds: int, proxy: Dict[str, Any] | None = None) -> Dict[str, Any]:
    client = TelethonClient(session_path, DEFAULT_API_ID, DEFAULT_API_HASH, receive_updates=False, proxy=proxy)
    try:
        try:
            await asyncio.wait_for(client.connect(), timeout=timeout_seconds)
            authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=timeout_seconds)
        except Exception as exc:
            if _is_frozen_rpc_error(exc):
                return {
                    'status': 'frozen',
                    'reason': _extract_rpc_error_name(exc),
                }
            return {
                'status': _classify_rpc_status(exc),
                'reason': _extract_rpc_error_name(exc),
            }

        if not authorized:
            return {'status': 'not_logged_in', 'reason': 'session_not_authorized'}

        try:
            me = await asyncio.wait_for(client.get_me(), timeout=timeout_seconds)
        except Exception as exc:
            if _is_frozen_rpc_error(exc):
                frozen_metadata = await _fetch_freeze_metadata(client, timeout_seconds)
                return {
                    'status': 'frozen',
                    'reason': _extract_rpc_error_name(exc),
                    **frozen_metadata,
                }
            return {
                'status': _classify_rpc_status(exc),
                'reason': _extract_rpc_error_name(exc),
            }

        if me is None:
            return {'status': 'unknown', 'reason': 'account_not_found'}

        freeze_metadata = await _fetch_freeze_metadata(client, timeout_seconds)
        if freeze_metadata.get('freeze_since_date') or freeze_metadata.get('freeze_until_date'):
            return {
                'status': 'frozen',
                'reason': 'FREEZE_STATE_IN_APP_CONFIG',
                'premium': bool(getattr(me, 'premium', False)),
                'user_id': getattr(me, 'id', None),
                'first_name': getattr(me, 'first_name', None),
                'last_name': getattr(me, 'last_name', None),
                'username': getattr(me, 'username', None),
                'phone': getattr(me, 'phone', None),
                **freeze_metadata,
            }

        try:
            reply_result = await _read_spambot_reply(client, timeout_seconds)
            return {
                'status': reply_result.get('status', 'unknown'),
                'reason': reply_result.get('reason', 'ok'),
                'reply_text': reply_result.get('reply_text', ''),
                'premium': bool(getattr(me, 'premium', False)),
                'user_id': getattr(me, 'id', None),
                'first_name': getattr(me, 'first_name', None),
                'last_name': getattr(me, 'last_name', None),
                'username': getattr(me, 'username', None),
                'phone': getattr(me, 'phone', None),
            }
        except Exception as exc:
            if _is_frozen_rpc_error(exc):
                frozen_metadata = await _fetch_freeze_metadata(client, timeout_seconds)
                return {
                    'status': 'frozen',
                    'reason': _extract_rpc_error_name(exc),
                    'premium': bool(getattr(me, 'premium', False)),
                    'user_id': getattr(me, 'id', None),
                    'first_name': getattr(me, 'first_name', None),
                    'last_name': getattr(me, 'last_name', None),
                    'username': getattr(me, 'username', None),
                    'phone': getattr(me, 'phone', None),
                    **frozen_metadata,
                }
            return {
                'status': 'unknown',
                'reason': str(exc) or exc.__class__.__name__,
                'premium': bool(getattr(me, 'premium', False)),
                'user_id': getattr(me, 'id', None),
                'first_name': getattr(me, 'first_name', None),
                'last_name': getattr(me, 'last_name', None),
                'username': getattr(me, 'username', None),
                'phone': getattr(me, 'phone', None),
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
        result = await _probe_session(session_path, timeout_seconds, proxy)
    except Exception as exc:
        result = {
            'status': 'unknown',
            'reason': str(exc) or exc.__class__.__name__,
        }

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(_main())
