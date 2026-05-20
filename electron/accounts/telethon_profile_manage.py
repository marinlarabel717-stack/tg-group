import asyncio
import base64
import json
import os
import random
import sys
from pathlib import Path

from telethon import TelegramClient, functions, types, utils
from telethon.sessions import SQLiteSession

API_ID = int(os.getenv('ACCOUNT_CHECK_API_ID', '2040'))
API_HASH = os.getenv('ACCOUNT_CHECK_API_HASH', 'b18441a1ff607e10a989891a5462e627')
DEFAULT_PROFILE_EMOJI_BACKGROUND_COLORS = [
    [0x5B8CFF, 0x7A5CFA],
    [0x2FB7A8, 0x0F9D8E],
    [0xFF8A5B, 0xFF5E7A],
    [0x5B6CFF, 0x3BA7FF],
    [0xA35BFF, 0xEC5FA3],
    [0x4AAE62, 0x9ED65D],
]
DEFAULT_PROFILE_EMOJI_FALLBACK_COLORS = [0x7A5CFA]


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


def _is_benign_profile_clear_error(error: Exception) -> bool:
    raw_message = str(error or '').strip()
    message = raw_message.upper()
    return any(token in message for token in [
        'USERNAME_NOT_MODIFIED',
        'ABOUT_NOT_MODIFIED',
        'NO PHOTO',
        'PHOTO_ID_INVALID',
        'PHOTO_INVALID'
    ]) or any(fragment in raw_message for fragment in [
        'The username is not different from the current username',
        'The about text has not changed',
        'The first name is not modified',
        'The last name is not modified'
    ])


async def _safe_clear_username(client: TelegramClient):
    try:
        await client(functions.account.UpdateUsernameRequest(username=''))
    except Exception as error:
        if not _is_benign_profile_clear_error(error):
            raise


async def _safe_clear_bio(client: TelegramClient):
    try:
        await client(functions.account.UpdateProfileRequest(about=''))
    except Exception as error:
        if not _is_benign_profile_clear_error(error):
            raise


async def _delete_profile_photos(client: TelegramClient):
    try:
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
    except Exception as error:
        if not _is_benign_profile_clear_error(error):
            raise


async def _read_final_profile(client: TelegramClient):
    me = await client.get_me()
    full = await client(functions.users.GetFullUserRequest(id=utils.get_input_user(me)))
    full_user = getattr(full, 'full_user', None)
    about = getattr(full_user, 'about', None)
    avatar_data_url = None

    try:
        downloaded_avatar = await client.download_profile_photo('me', file=bytes)
        if isinstance(downloaded_avatar, (bytes, bytearray)) and downloaded_avatar:
            avatar_data_url = f"data:image/jpeg;base64,{base64.b64encode(bytes(downloaded_avatar)).decode('ascii')}"
    except Exception:
        avatar_data_url = None

    return {
        'first_name': getattr(me, 'first_name', None),
        'last_name': getattr(me, 'last_name', None),
        'username': getattr(me, 'username', None),
        'bio': about,
        'has_profile_photo': bool(getattr(me, 'photo', None)),
        'avatar_data_url': avatar_data_url,
    }


def _is_emoji_markup_invalid_error(error: Exception) -> bool:
    message = str(error or '').strip().upper()
    return 'EMOJI_MARKUP_INVALID' in message or 'VIDEO_EMOJI_MARKUP_INVALID' in message


def _build_background_variants(colors):
    unique_variants = []

    def _push(candidate):
        normalized = [int(color) for color in (candidate or []) if isinstance(color, int)]
        if not normalized:
            return
        key = tuple(normalized)
        if key not in unique_variants:
            unique_variants.append(key)

    _push(colors)
    if len(colors or []) >= 2:
        _push(list(reversed(colors)))
    if colors:
        _push([int(colors[0])])
        _push([int(colors[-1])])
    _push(DEFAULT_PROFILE_EMOJI_FALLBACK_COLORS)
    return [list(item) for item in unique_variants]


async def _upload_emoji_profile_photo(client: TelegramClient, emoji_id: int, background_colors):
    last_error = None
    for candidate_colors in _build_background_variants(background_colors):
        try:
            await client(functions.photos.UploadProfilePhotoRequest(
                fallback=True,
                video_emoji_markup=types.VideoSizeEmojiMarkup(
                    emoji_id=emoji_id,
                    background_colors=candidate_colors,
                )
            ))
            return
        except Exception as error:
            last_error = error
            if not _is_emoji_markup_invalid_error(error):
                raise

    if last_error:
        raise last_error
    raise RuntimeError('EMOJI_MARKUP_INVALID')


async def _apply_random_emoji_profile_photo(client: TelegramClient):
    emoji_list = await client(functions.account.GetDefaultProfilePhotoEmojisRequest(hash=0))
    document_ids = list(getattr(emoji_list, 'document_id', None) or [])
    if not document_ids:
        raise RuntimeError('DEFAULT_PROFILE_PHOTO_EMOJIS_EMPTY')

    emoji_id = int(random.choice(document_ids))
    background_colors = random.choice(DEFAULT_PROFILE_EMOJI_BACKGROUND_COLORS)
    await _upload_emoji_profile_photo(client, emoji_id, background_colors)


async def _apply_action(client: TelegramClient, action: str, value: str, avatar_path: str, first_name: str, last_name: str):
    if action == 'random-profile':
        resolved_first_name = (first_name or '').strip()
        resolved_last_name = (last_name or '').strip()
        await client(functions.account.UpdateProfileRequest(first_name=resolved_first_name, last_name=resolved_last_name, about=value))
        await _apply_random_emoji_profile_photo(client)
        full_name = f'{resolved_first_name} {resolved_last_name}'.strip()
        return f'官方 emoji 头像、名称、简介已随机更新为 {full_name}。'

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
        await _safe_clear_username(client)
        return '用户名已删除。'

    if action == 'remove-bio':
        await _safe_clear_bio(client)
        return '简介已删除。'

    if action in {'random-avatar', 'custom-avatar'}:
        if action == 'random-avatar':
            await _apply_random_emoji_profile_photo(client)
            return '头像已更新为官方 emoji 头像。'
        avatar_file = Path(avatar_path)
        if not avatar_file.exists():
            raise FileNotFoundError('AVATAR_FILE_MISSING')
        uploaded = await client.upload_file(str(avatar_file))
        await client(functions.photos.UploadProfilePhotoRequest(file=uploaded))
        return '头像已更新。'

    if action == 'clear-all-profile':
        await _safe_clear_username(client)
        await _safe_clear_bio(client)
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
