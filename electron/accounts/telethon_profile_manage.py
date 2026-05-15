import asyncio
import json
import os
import sys
from pathlib import Path

from telethon import TelegramClient, functions, utils
from telethon.sessions import SQLiteSession

API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040'))
API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627')


def _emit(payload: dict):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


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


async def _delete_profile_photos(client: TelegramClient):
    photos = await client(functions.photos.GetUserPhotosRequest(user_id='me', offset=0, max_id=0, limit=100))
    input_photos = []
    for photo in getattr(photos, 'photos', []) or []:
      try:
        input_photo = utils.get_input_photo(photo)
        if input_photo:
          input_photos.append(input_photo)
      except Exception:
        continue
    if input_photos:
      await client(functions.photos.DeletePhotosRequest(id=input_photos))


async def _read_final_profile(client: TelegramClient):
    me = await client.get_me()
    full = await client(functions.users.GetFullUserRequest(id=utils.get_input_user(me)))
    full_user = getattr(full, 'full_user', None)
    about = getattr(full_user, 'about', None)
    return {
        'first_name': getattr(me, 'first_name', None),
        'last_name': getattr(me, 'last_name', None),
        'username': getattr(me, 'username', None),
        'bio': about,
        'has_profile_photo': bool(getattr(me, 'photo', None)),
    }


async def _apply_action(client: TelegramClient, action: str, value: str, avatar_path: str, first_name: str, last_name: str):
    if action == 'random-profile':
        resolved_first_name = (first_name or '').strip()
        resolved_last_name = (last_name or '').strip()
        await client(functions.account.UpdateProfileRequest(first_name=resolved_first_name, last_name=resolved_last_name, about=value))
        avatar_file = Path(avatar_path)
        if not avatar_file.exists():
            raise FileNotFoundError('AVATAR_FILE_MISSING')
        uploaded = await client.upload_file(str(avatar_file))
        await client(functions.photos.UploadProfilePhotoRequest(file=uploaded))
        full_name = f'{resolved_first_name} {resolved_last_name}'.strip()
        return f'头像、名称、简介已随机更新为 {full_name}。'

    if action in {'random-nickname', 'custom-nickname'}:
        resolved_first_name = (first_name or value or '').strip()
        resolved_last_name = (last_name or '').strip()
        await client(functions.account.UpdateProfileRequest(first_name=resolved_first_name, last_name=resolved_last_name))
        full_name = f'{resolved_first_name} {resolved_last_name}'.strip()
        return f'昵称已更新为 {full_name}。'

    if action in {'random-username', 'custom-username'}:
        username = value.lstrip('@').strip()
        await client(functions.account.UpdateUsernameRequest(username=username))
        return f'用户名已更新为 @{username}。'

    if action in {'random-bio', 'custom-bio'}:
        await client(functions.account.UpdateProfileRequest(about=value))
        return '简介已更新。'

    if action == 'remove-username':
        await client(functions.account.UpdateUsernameRequest(username=''))
        return '用户名已删除。'

    if action == 'remove-bio':
        await client(functions.account.UpdateProfileRequest(about=''))
        return '简介已删除。'

    if action in {'random-avatar', 'custom-avatar'}:
        avatar_file = Path(avatar_path)
        if not avatar_file.exists():
            raise FileNotFoundError('AVATAR_FILE_MISSING')
        uploaded = await client.upload_file(str(avatar_file))
        await client(functions.photos.UploadProfilePhotoRequest(file=uploaded))
        return '头像已更新。'

    if action == 'clear-all-profile':
        await client(functions.account.UpdateUsernameRequest(username=''))
        await client(functions.account.UpdateProfileRequest(about=''))
        await _delete_profile_photos(client)
        return '用户名、简介、头像已清空。'

    raise ValueError('PROFILE_ACTION_INVALID')


async def main():
    raw_payload = sys.argv[1] if len(sys.argv) > 1 else '{}'
    payload = json.loads(raw_payload)

    session_path = _normalize_session_path(payload.get('sessionPath', ''))
    action = str(payload.get('action') or '').strip()
    value = str(payload.get('value') or '')
    first_name = str(payload.get('firstName') or '')
    last_name = str(payload.get('lastName') or '')
    avatar_path = str(payload.get('avatarPath') or '').strip()
    proxy = _build_proxy_config(payload.get('proxy'))

    if not session_path:
        _emit({'ok': False, 'reason': 'SESSION_PATH_REQUIRED'})
        return
    if not action:
        _emit({'ok': False, 'reason': 'PROFILE_ACTION_REQUIRED'})
        return

    client = TelegramClient(SQLiteSession(session_path), API_ID, API_HASH, proxy=proxy)
    try:
        await client.connect()
        if not await client.is_user_authorized():
            _emit({'ok': False, 'reason': 'SESSION_NOT_AUTHORIZED'})
            return

        message = await _apply_action(client, action, value, avatar_path, first_name, last_name)
        final_profile = await _read_final_profile(client)
        _emit({
            'ok': True,
            'message': message,
            **final_profile,
        })
    except Exception as error:
        _emit({'ok': False, 'reason': str(error)})
    finally:
        await client.disconnect()


if __name__ == '__main__':
    asyncio.run(main())
