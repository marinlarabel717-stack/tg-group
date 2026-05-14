import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

from telethon import TelegramClient as TelethonClient
from telethon import errors, password as pwd_mod
from telethon.tl import functions, types

DEFAULT_API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040') or '2040')
DEFAULT_API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627').strip() or 'b18441a1ff607e10a989891a5462e627'
DEFAULT_TIMEOUT_SECONDS = max(15, int(os.getenv('ACCOUNT_2FA_TIMEOUT_SECONDS', '90') or '90'))


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {'1', 'true', 'yes', 'y'}
    return bool(value)


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


async def _run(payload: Dict[str, Any]) -> Dict[str, Any]:
    session_path = str(payload.get('sessionPath') or '').strip()
    action = str(payload.get('action') or '').strip()
    phase = str(payload.get('phase') or 'apply').strip() or 'apply'
    current_password = str(payload.get('currentPassword') or '')
    new_password = str(payload.get('newPassword') or '')
    hint = str(payload.get('hint') or '')
    recovery_code = str(payload.get('recoveryCode') or '')
    timeout_seconds = max(15, int(payload.get('timeoutSeconds') or DEFAULT_TIMEOUT_SECONDS))

    if not session_path or not Path(session_path).exists():
        return {'ok': False, 'reason': 'session_file_missing'}
    if action not in {'change-2fa', 'disable-2fa', 'reset-2fa'}:
        return {'ok': False, 'reason': 'unsupported_two_factor_action'}
    if action == 'reset-2fa' and phase == 'confirm-recovery' and not recovery_code:
        return {'ok': False, 'reason': 'recovery_code_missing'}
    if action in {'change-2fa', 'reset-2fa'} and phase != 'request-recovery' and not new_password:
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

        if phase == 'request-recovery':
            result = await asyncio.wait_for(client(functions.auth.RequestPasswordRecoveryRequest()), timeout=timeout_seconds)
            email_pattern = getattr(result, 'email_pattern', '')
            return {
                'ok': True,
                'action': action,
                'phase': phase,
                'message': '邮箱验证码已发送',
                'email_pattern': email_pattern,
                'next_two_fa': None,
            }

        settings = await asyncio.wait_for(_build_password_settings(client, new_password, hint or ''), timeout=timeout_seconds)
        await asyncio.wait_for(
            client(functions.auth.RecoverPasswordRequest(code=recovery_code, new_settings=settings)),
            timeout=timeout_seconds
        )
        return {
            'ok': True,
            'action': action,
            'phase': phase,
            'message': '2FA 已重置成功',
            'next_two_fa': new_password,
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
