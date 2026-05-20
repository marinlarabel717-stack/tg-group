import asyncio
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from telethon import TelegramClient, functions, types
from telethon.errors import PasswordHashInvalidError, PhoneCodeExpiredError, PhoneCodeInvalidError, SessionPasswordNeededError
from telethon.sessions import SQLiteSession

API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040') or '2040')
API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627').strip() or 'b18441a1ff607e10a989891a5462e627'
DEFAULT_TIMEOUT_SECONDS = max(30, int(os.getenv('ACCOUNT_REAUTHORIZE_TIMEOUT_SECONDS', '180') or '180'))
PROGRESS_PREFIX = '__PROGRESS__'
CODE_PATTERN = re.compile(r'(\d{5,6})')


def _emit(payload: Dict[str, Any]):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def _emit_progress(level: str, message: str):
    sys.stderr.write(f"{PROGRESS_PREFIX}{json.dumps({'level': level, 'message': message}, ensure_ascii=False)}\n")
    sys.stderr.flush()


def _read_payload() -> Dict[str, Any]:
    if len(sys.argv) < 2:
        return {}
    try:
        return json.loads(sys.argv[1])
    except Exception:
        return {}


def _normalize_session_path(raw_value: str) -> str:
    value = (raw_value or '').strip()
    if value.endswith('.session'):
        value = value[:-8]
    return value


def _build_proxy_config(raw_proxy):
    if not raw_proxy:
        return None
    proxy_type = str(raw_proxy.get('type') or '').strip().lower()
    host = str(raw_proxy.get('host') or '').strip()
    port = int(raw_proxy.get('port') or 0)
    if proxy_type not in {'http', 'socks5'} or not host or port <= 0:
        return None
    return {
        'proxy_type': proxy_type,
        'addr': host,
        'port': port,
        'username': str(raw_proxy.get('username') or '').strip() or None,
        'password': str(raw_proxy.get('password') or '').strip() or None,
    }


def _format_error_reason(exc: Exception) -> str:
    pieces: List[str] = []
    for value in [exc.__class__.__name__, getattr(exc, 'name', None), getattr(exc, 'message', None), str(exc).strip()]:
        if isinstance(value, str) and value.strip() and value.strip() not in pieces:
            pieces.append(value.strip())
    return ' | '.join(pieces) or 'REAUTHORIZE_FAILED'


def _format_unix_time(value: Any) -> Optional[str]:
    if value in (None, ''):
        return None
    try:
        timestamp = int(value)
    except Exception:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')


async def _ensure_authorized(client: TelegramClient, timeout_seconds: int):
    await asyncio.wait_for(client.connect(), timeout=timeout_seconds)
    authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=timeout_seconds)
    if not authorized:
        raise RuntimeError('session_not_authorized')


async def _clear_other_authorizations(old_client: TelegramClient, timeout_seconds: int):
    _emit_progress('info', '步骤 1：旧设备正在读取授权列表。')
    session_state = await asyncio.wait_for(old_client(functions.account.GetAuthorizationsRequest()), timeout=timeout_seconds)
    authorizations = list(getattr(session_state, 'authorizations', []) or [])
    other_authorizations = [item for item in authorizations if not getattr(item, 'current', False)]
    reset_count = len(other_authorizations)
    if reset_count > 0:
        await asyncio.wait_for(old_client(functions.auth.ResetAuthorizationsRequest()), timeout=timeout_seconds)
        _emit_progress('success', f'步骤 1 完成：已清理其它 {reset_count} 台设备，只保留当前旧设备。')
    else:
        _emit_progress('success', '步骤 1 完成：当前本来就只有旧设备自己。')

    reset_web_count = 0
    try:
        web_state = await asyncio.wait_for(old_client(functions.account.GetWebAuthorizationsRequest()), timeout=timeout_seconds)
        web_authorizations = list(getattr(web_state, 'authorizations', []) or [])
        if web_authorizations:
            await asyncio.wait_for(old_client(functions.account.ResetWebAuthorizationsRequest()), timeout=timeout_seconds)
            reset_web_count = len(web_authorizations)
            _emit_progress('success', f'已额外清理 {reset_web_count} 个 Web 授权。')
    except Exception:
        reset_web_count = 0

    return reset_count, reset_web_count


async def _wait_for_verification_code(old_client: TelegramClient, service_entity: Any, baseline_ids: List[int], timeout_seconds: int) -> str:
    _emit_progress('info', '步骤 3：旧设备正在读取 777000 官方验证码消息。')
    deadline = asyncio.get_running_loop().time() + min(timeout_seconds, 45)
    seen = set(baseline_ids)
    while asyncio.get_running_loop().time() < deadline:
        messages = await asyncio.wait_for(old_client.get_messages(service_entity, limit=5), timeout=15)
        for message in messages:
            message_id = getattr(message, 'id', None)
            text = str(getattr(message, 'message', '') or '')
            if message_id in seen and not CODE_PATTERN.search(text):
                continue
            match = CODE_PATTERN.search(text)
            if match:
                code = match.group(1)
                _emit_progress('success', f'步骤 3 完成：已从旧设备读取到官方验证码 {code}。')
                return code
            if message_id is not None:
                seen.add(message_id)
        await asyncio.sleep(2)
    raise RuntimeError('REAUTHORIZE_VERIFICATION_CODE_NOT_FOUND')


async def _try_sign_in_with_passwords(new_client: TelegramClient, password_candidates: List[str], timeout_seconds: int) -> Optional[str]:
    if not password_candidates:
        raise RuntimeError('PASSWORD_MISSING')

    _emit_progress('warning', f'步骤 5：新设备登录需要 2FA，开始尝试 {len(password_candidates)} 个旧密码候选。')
    for index, candidate in enumerate(password_candidates):
        try:
            _emit_progress('info', f'正在尝试第 {index + 1} 个旧密码候选。')
            await asyncio.wait_for(new_client.sign_in(password=candidate), timeout=timeout_seconds)
            _emit_progress('success', f'步骤 5 完成：第 {index + 1} 个旧密码候选校验通过。')
            return candidate
        except PasswordHashInvalidError:
            _emit_progress('warning', f'第 {index + 1} 个旧密码候选不匹配。')
            continue
    raise RuntimeError('PASSWORD_HASH_INVALID')


async def _clear_official_messages(new_client: TelegramClient, timeout_seconds: int):
    _emit_progress('info', '正在清理 Telegram 官方系统消息。')
    service_peer = await asyncio.wait_for(new_client.get_input_entity('777000'), timeout=timeout_seconds)
    await asyncio.wait_for(new_client(functions.messages.DeleteHistoryRequest(peer=service_peer, max_id=0, revoke=False, just_clear=True)), timeout=timeout_seconds)
    _emit_progress('success', '官方系统消息已清理。')


async def _read_recovery_state(client: TelegramClient, timeout_seconds: int) -> Dict[str, Any]:
    password_state = await asyncio.wait_for(client(functions.account.GetPasswordRequest()), timeout=timeout_seconds)
    has_password = bool(getattr(password_state, 'has_password', False))
    has_recovery = bool(getattr(password_state, 'has_recovery', False))
    recovery_email_pattern = str(getattr(password_state, 'login_email_pattern', '') or '').strip() or None
    unconfirmed_recovery_email_pattern = str(getattr(password_state, 'email_unconfirmed_pattern', '') or '').strip() or None
    pending_recovery_reset_at = _format_unix_time(getattr(password_state, 'pending_reset_date', None))

    return {
        'has_password': has_password,
        'has_recovery': has_recovery,
        'recovery_email_pattern': recovery_email_pattern,
        'unconfirmed_recovery_email_pattern': unconfirmed_recovery_email_pattern,
        'pending_recovery_reset_at': pending_recovery_reset_at,
    }


async def _cleanup_expired_recovery_state(client: TelegramClient, state: Dict[str, Any], timeout_seconds: int) -> Dict[str, bool]:
    cancelled_recovery_email = False
    declined_recovery_reset = False

    if not state.get('has_password'):
        _emit_progress('warning', '检测到当前账号没有 2FA 密码，已跳过恢复方式清理，避免把账号清成无保护状态。')
        return {
            'cancelled_recovery_email': False,
            'declined_recovery_reset': False,
        }

    if state.get('unconfirmed_recovery_email_pattern'):
        _emit_progress('info', '检测到待确认的恢复邮箱，正在取消这条旧恢复设置。')
        await asyncio.wait_for(client(functions.account.CancelPasswordEmailRequest()), timeout=timeout_seconds)
        cancelled_recovery_email = True
        _emit_progress('success', '已取消待确认的旧恢复邮箱。')

    if state.get('pending_recovery_reset_at'):
        _emit_progress('info', '检测到旧的密码重置等待期，正在撤销这条恢复请求。')
        await asyncio.wait_for(client(functions.account.DeclinePasswordResetRequest()), timeout=timeout_seconds)
        declined_recovery_reset = True
        _emit_progress('success', '已撤销旧的密码重置等待期。')

    if not cancelled_recovery_email and not declined_recovery_reset:
        _emit_progress('info', '没有检测到需要清理的过期恢复方式。')

    return {
        'cancelled_recovery_email': cancelled_recovery_email,
        'declined_recovery_reset': declined_recovery_reset,
    }


def _replace_session_files(source_base: Path, target_base: Path):
    suffixes = ['.session', '.session-journal', '.session-wal', '.session-shm']
    for suffix in suffixes:
        source = Path(f'{source_base}{suffix}')
        if not source.exists():
            continue
        target = Path(f'{target_base}{suffix}')
        if target.exists():
            target.unlink()
        shutil.move(str(source), str(target))


async def _run(payload: Dict[str, Any]) -> Dict[str, Any]:
    session_path = _normalize_session_path(str(payload.get('sessionPath') or ''))
    delete_official_messages = bool(payload.get('deleteOfficialMessages'))
    cleanup_expired_recovery = bool(payload.get('cleanupExpiredRecovery'))
    timeout_seconds = max(30, int(payload.get('timeoutSeconds') or DEFAULT_TIMEOUT_SECONDS))
    raw_candidates = payload.get('passwordCandidates') or []
    password_candidates = [str(item).strip() for item in raw_candidates if str(item).strip()]
    proxy = _build_proxy_config(payload.get('proxy'))

    if not session_path:
        return {'ok': False, 'reason': 'SESSION_PATH_REQUIRED'}

    old_client = TelegramClient(SQLiteSession(session_path), API_ID, API_HASH, receive_updates=False, proxy=proxy)
    new_client = None
    temp_dir = None
    matched_password = None
    official_messages_cleared = False
    reset_count = 0
    reset_web_count = 0
    recovery_state = {
        'has_password': False,
        'has_recovery': False,
        'recovery_email_pattern': None,
        'unconfirmed_recovery_email_pattern': None,
        'pending_recovery_reset_at': None,
    }
    cancelled_recovery_email = False
    declined_recovery_reset = False

    try:
        _emit_progress('info', '步骤 0：正在连接旧设备会话。')
        await _ensure_authorized(old_client, timeout_seconds)
        _emit_progress('success', '步骤 0 完成：旧设备登录状态正常。')

        reset_count, reset_web_count = await _clear_other_authorizations(old_client, timeout_seconds)

        me = await asyncio.wait_for(old_client.get_me(), timeout=timeout_seconds)
        phone = str(getattr(me, 'phone', '') or '').strip()
        if not phone:
            raise RuntimeError('PHONE_NUMBER_MISSING')
        phone_with_prefix = phone if phone.startswith('+') else f'+{phone}'

        service_entity = await asyncio.wait_for(old_client.get_entity(777000), timeout=timeout_seconds)
        baseline_messages = await asyncio.wait_for(old_client.get_messages(service_entity, limit=3), timeout=timeout_seconds)
        baseline_ids = [getattr(message, 'id', None) for message in baseline_messages if getattr(message, 'id', None) is not None]

        temp_dir = tempfile.mkdtemp(prefix='tgmatrix-reauth-')
        temp_session_base = str(Path(temp_dir) / 'new_authorized_session')
        new_client = TelegramClient(
            SQLiteSession(temp_session_base),
            API_ID,
            API_HASH,
            receive_updates=False,
            proxy=proxy,
            device_model='Desktop',
            system_version='Windows 10',
            app_version='TG-Matrix'
        )

        _emit_progress('info', '步骤 2：正在建立新设备会话并请求官方验证码。')
        await asyncio.wait_for(new_client.connect(), timeout=timeout_seconds)
        sent_code = await asyncio.wait_for(new_client(functions.auth.SendCodeRequest(phone_with_prefix, API_ID, API_HASH, types.CodeSettings())), timeout=timeout_seconds)
        _emit_progress('success', '步骤 2 完成：官方验证码已发送。')

        code = await _wait_for_verification_code(old_client, service_entity, baseline_ids, timeout_seconds)

        _emit_progress('info', '步骤 4：新设备正在使用官方验证码登录。')
        try:
            await asyncio.wait_for(new_client.sign_in(phone=phone_with_prefix, code=code, phone_code_hash=sent_code.phone_code_hash), timeout=timeout_seconds)
            _emit_progress('success', '步骤 4 完成：新设备验证码登录成功。')
        except SessionPasswordNeededError:
            matched_password = await _try_sign_in_with_passwords(new_client, password_candidates, timeout_seconds)
        except PhoneCodeInvalidError:
            raise RuntimeError('PHONE_CODE_INVALID')
        except PhoneCodeExpiredError:
            raise RuntimeError('PHONE_CODE_EXPIRED')

        await asyncio.wait_for(new_client.get_me(), timeout=timeout_seconds)
        _emit_progress('success', '步骤 6：新设备账号校验通过。')

        recovery_state = await _read_recovery_state(new_client, timeout_seconds)
        if recovery_state.get('has_password'):
            _emit_progress('success', '已确认当前账号仍保留 2FA 密码。')
        else:
            _emit_progress('warning', '当前账号没有检测到 2FA 密码。')

        if recovery_state.get('recovery_email_pattern'):
            _emit_progress('info', f"当前仍保留有效恢复邮箱：{recovery_state['recovery_email_pattern']}。")
        if recovery_state.get('unconfirmed_recovery_email_pattern'):
            _emit_progress('warning', f"检测到待确认的旧恢复邮箱：{recovery_state['unconfirmed_recovery_email_pattern']}。")
        if recovery_state.get('pending_recovery_reset_at'):
            _emit_progress('warning', f"检测到旧的密码重置等待期：{recovery_state['pending_recovery_reset_at']}。")

        if cleanup_expired_recovery:
            cleanup_state = await _cleanup_expired_recovery_state(new_client, recovery_state, timeout_seconds)
            cancelled_recovery_email = cleanup_state.get('cancelled_recovery_email', False)
            declined_recovery_reset = cleanup_state.get('declined_recovery_reset', False)
            recovery_state = await _read_recovery_state(new_client, timeout_seconds)

        if delete_official_messages:
            try:
                await _clear_official_messages(new_client, timeout_seconds)
                official_messages_cleared = True
            except Exception:
                official_messages_cleared = False
                _emit_progress('warning', '官方系统消息清理失败，已跳过。')

        await asyncio.wait_for(new_client.disconnect(), timeout=timeout_seconds)
        new_session_file = Path(f'{temp_session_base}.session')
        if not new_session_file.exists():
            raise RuntimeError('REAUTHORIZE_NEW_SESSION_MISSING')

        _emit_progress('info', '步骤 7：新设备已确认可用，旧设备准备退出登录。')
        await asyncio.wait_for(old_client.log_out(), timeout=timeout_seconds)
        _emit_progress('success', '步骤 7 完成：旧设备已退出登录。')

        await asyncio.wait_for(old_client.disconnect(), timeout=timeout_seconds)
        original_base = Path(session_path)
        backup_base = Path(f'{session_path}.bak-{int(asyncio.get_running_loop().time() * 1000)}')
        if Path(f'{original_base}.session').exists():
            shutil.copy2(f'{original_base}.session', f'{backup_base}.session')
            for suffix in ['.session-journal', '.session-wal', '.session-shm']:
                source = Path(f'{original_base}{suffix}')
                if source.exists():
                    shutil.copy2(str(source), str(Path(f'{backup_base}{suffix}')))
            _emit_progress('success', '已备份原 session 文件。')

        _replace_session_files(Path(temp_session_base), original_base)
        _emit_progress('success', '步骤 8 完成：新 session 已写回本地。')

        success_message = '重新授权成功：已先清理其它旧设备，再用官方验证码完成新设备登录，最后让旧设备退出。'
        if cleanup_expired_recovery:
            if cancelled_recovery_email or declined_recovery_reset:
                success_message += ' 已顺带清理旧的恢复痕迹。'
            else:
                success_message += ' 恢复方式已检查，没发现需要清理的过期项。'

        return {
            'ok': True,
            'message': success_message,
            'matched_password': matched_password,
            'official_messages_cleared': official_messages_cleared,
            'terminated_authorizations_count': reset_count,
            'terminated_web_authorizations_count': reset_web_count,
            'phone': phone_with_prefix,
            'recovery_email_pattern': recovery_state.get('recovery_email_pattern'),
            'unconfirmed_recovery_email_pattern': recovery_state.get('unconfirmed_recovery_email_pattern'),
            'pending_recovery_reset_at': recovery_state.get('pending_recovery_reset_at'),
            'cancelled_recovery_email': cancelled_recovery_email,
            'declined_recovery_reset': declined_recovery_reset,
        }
    except Exception as exc:
        return {
            'ok': False,
            'reason': _format_error_reason(exc),
            'matched_password': matched_password,
            'official_messages_cleared': official_messages_cleared,
            'terminated_authorizations_count': reset_count,
            'terminated_web_authorizations_count': reset_web_count,
            'recovery_email_pattern': recovery_state.get('recovery_email_pattern'),
            'unconfirmed_recovery_email_pattern': recovery_state.get('unconfirmed_recovery_email_pattern'),
            'pending_recovery_reset_at': recovery_state.get('pending_recovery_reset_at'),
            'cancelled_recovery_email': cancelled_recovery_email,
            'declined_recovery_reset': declined_recovery_reset,
        }
    finally:
        try:
            if new_client:
                await new_client.disconnect()
        except Exception:
            pass
        try:
            await old_client.disconnect()
        except Exception:
            pass
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)


async def _main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

    payload = _read_payload()
    result = await _run(payload)
    _emit(result)


if __name__ == '__main__':
    asyncio.run(_main())
