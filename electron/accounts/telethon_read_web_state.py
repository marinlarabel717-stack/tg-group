import json
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from telethon.sessions import StringSession

SQLITE_HEADER = b'SQLite format 3\x00'


def _looks_like_string_session(content: str) -> bool:
    value = content.strip()
    if not value:
        return False
    return all(ch.isalnum() or ch in '+/=_:-' for ch in value)


def _try_parse_json_string_session(content: str) -> Optional[str]:
    try:
        parsed = json.loads(content)
    except Exception:
        return None

    if not isinstance(parsed, dict):
        return None

    for key in ('session', 'stringSession', 'sessionString'):
        value = parsed.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _detect_session_kind(session_path: Path) -> str:
    with session_path.open('rb') as handle:
        header = handle.read(16)
    return 'sqlite' if header.startswith(SQLITE_HEADER) else 'string'


def _read_sqlite_state(session_path: Path) -> Dict[str, Any]:
    database = sqlite3.connect(str(session_path))
    try:
        row = database.execute('SELECT dc_id, auth_key FROM sessions ORDER BY dc_id LIMIT 1').fetchone()
    finally:
        database.close()

    if not row or not row[1]:
        raise RuntimeError('missing session auth key')

    return {
        'dc_id': int(row[0]),
        'auth_key_hex': bytes(row[1]).hex(),
    }


def _read_string_state(session_path: Path) -> Dict[str, Any]:
    raw = session_path.read_text(encoding='utf-8')
    session_value = _try_parse_json_string_session(raw) or raw.strip()
    if not _looks_like_string_session(session_value):
        raise RuntimeError('不支持的 Session 文件格式')

    session = StringSession(session_value)
    auth_key = getattr(session, 'auth_key', None)
    auth_key_bytes = getattr(auth_key, 'key', None)
    dc_id = getattr(session, 'dc_id', 0)

    if not auth_key_bytes:
        raise RuntimeError('missing session auth key')

    return {
        'dc_id': int(dc_id),
        'auth_key_hex': bytes(auth_key_bytes).hex(),
    }


def _run(command: Dict[str, Any]) -> Dict[str, Any]:
    session_path_value = str(command.get('sessionPath') or '').strip()
    fallback_user_id = str(command.get('fallbackUserId') or '').strip()
    if not session_path_value:
        return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

    session_path = Path(session_path_value)
    if not session_path.exists():
        return {'ok': False, 'reason': 'AUTH_KEY_UNREGISTERED'}

    try:
        if _detect_session_kind(session_path) == 'sqlite':
            state = _read_sqlite_state(session_path)
        else:
            state = _read_string_state(session_path)

        return {
            'ok': True,
            'user_id': fallback_user_id,
            'auth_key_hex': state['auth_key_hex'],
            'dc_id': state['dc_id'],
        }
    except Exception as exc:
        return {'ok': False, 'reason': str(exc) or exc.__class__.__name__}


def main() -> None:
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

    print(json.dumps(_run(command), ensure_ascii=False))


if __name__ == '__main__':
    main()
