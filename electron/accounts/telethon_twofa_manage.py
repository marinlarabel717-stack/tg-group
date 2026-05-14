import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from telethon import TelegramClient as TelethonClient
from telethon import password as pwd_mod
from telethon.tl import functions, types

DEFAULT_API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040') or '2040')
DEFAULT_API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627').strip() or 'b18441a1ff607e10a989891a5462e627'
DEFAULT_TIMEOUT_SECONDS = max(15, int(os.getenv('ACCOUNT_2FA_TIMEOUT_SECONDS', '90') or '90'))


def _read_payload() -> Dict[str, Any]:
    if len(sys.argv) < 2:
        return {}
    try:
        return json.loads(sys.argv[1])
    except Exception:
        return {}


async def _ensure_authorized(client: TelethonClient, timeout_seconds: int):
    await asyncio.wait_for(client.connect(), timeout=timeout_seconds)
    authorized = await asyncio.wait_for(client.is_user_authorized(), timeout=timeout_seconds)
    if not authorized:
        raise RuntimeError('session_not_authorized')


async def _build_password_settings(client: TelethonClient, new_password: str, hint: str):
    password_state = await client(functions.account.GetPasswordRequest())
    assert isinstance(password_state, types.account.Password)
    password_state.new_algo.salt1 += os.urandom(32)
    new_password_hash = pwd_mod.compute_digest(password_state.new_algo, new_password)
    return types.account.PasswordInputSettings(
        new_algo=password_state.new_algo,
        new_password_hash=new_password_hash,
        hint=hint,
        email=None,
        new_secure_settings=None
    )


def _format_datetime(value: Any) -> str:
    if not value:
        return ''
    if isinstance(value, datetime):
        target = value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return target.strftime('%Y-%m-%d %H:%M:%S UTC')
    return str(value)


async def _run(payload: Dict[str, Any]) -> Dict[str, Any]:
    session_path = str(payload.get('sessionPath') or '').strip()
    action = str(payload.get('action') or '').strip()
    phase = str(payload.get('phase') or 'apply').strip() or 'apply'
    current_password = str(payload.get('currentPassword') or '')
    new_password = str(payload.get('newPassword') or '')
    hint = str(payload.get('hint') or '')
    timeout_seconds = max(15, int(payload.get('timeoutSeconds') or DEFAULT_TIMEOUT_SECONDS))

    if not session_path or not Path(session_path).exists():
        return {'ok': False, 'reason': 'session_file_missing'}
    if action not in {'change-2fa', 'disable-2fa', 'reset-2fa'}:
        return {'ok': False, 'reason': 'unsupported_two_factor_action'}
    if action == 'change-2fa' and not new_password:
        return {'ok': False, 'reason': 'new_password_missing'}

    client = TelethonClient(session_path, DEFAULT_API_ID, DEFAULT_API_HASH, receive_updates=False)
    try:
        await _ensure_authorized(client, timeout_seconds)

        if action == 'change-2fa':
            await asyncio.wait_for(
                client.edit_2fa(
                    current_password=current_password or None,
                    new_password=new_password,
                    hint=hint or ''
                ),
                timeout=timeout_seconds
            )
            return {
                'ok': True,
                'action': action,
                'phase': phase,
                'message': '新 2FA 已设置成功',
                'next_two_fa': new_password,
            }

        if action == 'disable-2fa':
            await asyncio.wait_for(
                client.edit_2fa(current_password=current_password or None),
                timeout=timeout_seconds
            )
            return {
                'ok': True,
                'action': action,
                'phase': phase,
                'message': '2FA 已关闭',
                'next_two_fa': None,
            }

        result = await asyncio.wait_for(client(functions.account.ResetPasswordRequest()), timeout=timeout_seconds)
        if isinstance(result, types.account.ResetPasswordRequestedWait):
            until_text = _format_datetime(getattr(result, 'until_date', None))
            return {
                'ok': True,
                'action': action,
                'phase': 'apply',
                'message': f'已触发忘记密码，Telegram 显示会在 {until_text} 后自动重置 2FA。' if until_text else '已触发忘记密码，正在进入 Telegram 的自动重置等待期。',
            }
        if isinstance(result, types.account.ResetPasswordOk):
            return {
                'ok': True,
                'action': action,
                'phase': 'apply',
                'message': '2FA 已直接重置成功。',
                'next_two_fa': None,
            }
        if isinstance(result, types.account.ResetPasswordFailedWait):
            retry_text = _format_datetime(getattr(result, 'retry_date', None))
            return {
                'ok': False,
                'action': action,
                'phase': 'apply',
                'reason': f'RESET_PASSWORD_WAIT_{retry_text}' if retry_text else 'RESET_PASSWORD_WAIT',
            }
        return {
            'ok': False,
            'action': action,
            'phase': 'apply',
            'reason': 'reset_password_result_unknown',
        }
    except Exception as exc:
        return {
            'ok': False,
            'action': action,
            'phase': phase,
            'reason': getattr(exc, 'message', None) or getattr(exc, 'name', None) or str(exc) or exc.__class__.__name__,
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

    payload = _read_payload()
    result = await _run(payload)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(_main())
