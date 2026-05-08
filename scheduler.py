import argparse
import asyncio
import os
from datetime import datetime

from dotenv import load_dotenv
from telethon import TelegramClient

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))

API_ID = int(os.getenv('API_ID', '0') or '0')
API_HASH = os.getenv('API_HASH', '').strip()
PHONE = os.getenv('PHONE', '').strip()
CHAT_ID_OR_NAME = os.getenv('CHAT_ID_OR_NAME', '').strip()
MESSAGE = os.getenv('MESSAGE', '').strip()
INTERVAL_MINUTES = int(os.getenv('INTERVAL_MINUTES', '10') or '10')
SESSION_NAME = os.getenv('SESSION_NAME', 'tg_group_scheduler').strip() or 'tg_group_scheduler'


def build_client() -> TelegramClient:
    if not API_ID or not API_HASH:
        raise RuntimeError('请先在 .env 里填写 API_ID 和 API_HASH')
    return TelegramClient(os.path.join(BASE_DIR, SESSION_NAME), API_ID, API_HASH)


async def cmd_login() -> None:
    client = build_client()
    async with client:
        await client.start(phone=PHONE or None)
        me = await client.get_me()
        print(f'登录成功: {getattr(me, "first_name", "")} ({getattr(me, "id", "")})')


async def cmd_list(limit: int = 100) -> None:
    client = build_client()
    async with client:
        await client.start(phone=PHONE or None)
        dialogs = await client.get_dialogs(limit=limit)
        for item in dialogs:
            entity = item.entity
            chat_id = getattr(entity, 'id', '')
            title = getattr(entity, 'title', None) or getattr(entity, 'first_name', None) or ''
            username = getattr(entity, 'username', None) or ''
            print(f'id={chat_id} | title={title} | username=@{username}' if username else f'id={chat_id} | title={title}')


async def resolve_target(client: TelegramClient, target: str):
    target = str(target or '').strip()
    if not target:
        raise RuntimeError('请在 .env 里填写 CHAT_ID_OR_NAME，或者运行 list 先看群 id')

    if target.lstrip('-').isdigit():
        return await client.get_entity(int(target))

    if target.startswith('@'):
        return await client.get_entity(target)

    dialogs = await client.get_dialogs(limit=200)
    target_lower = target.lower()
    for item in dialogs:
        title = (getattr(item.entity, 'title', None) or getattr(item.entity, 'first_name', None) or '').strip()
        username = (getattr(item.entity, 'username', None) or '').strip()
        if title.lower() == target_lower or username.lower() == target_lower.lstrip('@'):
            return item.entity

    return await client.get_entity(target)


async def cmd_send_once() -> None:
    if not MESSAGE:
        raise RuntimeError('请先在 .env 里填写 MESSAGE')
    client = build_client()
    async with client:
        await client.start(phone=PHONE or None)
        entity = await resolve_target(client, CHAT_ID_OR_NAME)
        await client.send_message(entity, MESSAGE)
        print('发送完成')


async def cmd_run() -> None:
    if not MESSAGE:
        raise RuntimeError('请先在 .env 里填写 MESSAGE')
    if INTERVAL_MINUTES <= 0:
        raise RuntimeError('INTERVAL_MINUTES 必须大于 0')

    client = build_client()
    async with client:
        await client.start(phone=PHONE or None)
        entity = await resolve_target(client, CHAT_ID_OR_NAME)
        title = getattr(entity, 'title', None) or getattr(entity, 'first_name', None) or str(getattr(entity, 'id', 'unknown'))
        print(f'开始定时发送 -> {title} | 间隔 {INTERVAL_MINUTES} 分钟')
        while True:
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            await client.send_message(entity, MESSAGE)
            print(f'[{now}] 已发送')
            await asyncio.sleep(INTERVAL_MINUTES * 60)


def main() -> None:
    parser = argparse.ArgumentParser(description='Telegram 群聊定时发送工具')
    sub = parser.add_subparsers(dest='command', required=True)

    sub.add_parser('login', help='登录 Telegram 账号')

    list_parser = sub.add_parser('list', help='列出最近会话，方便找群 id')
    list_parser.add_argument('--limit', type=int, default=100)

    sub.add_parser('send-once', help='先测试发一次')
    sub.add_parser('run', help='按间隔持续发送')

    args = parser.parse_args()
    if args.command == 'login':
        asyncio.run(cmd_login())
    elif args.command == 'list':
        asyncio.run(cmd_list(limit=args.limit))
    elif args.command == 'send-once':
        asyncio.run(cmd_send_once())
    elif args.command == 'run':
        asyncio.run(cmd_run())


if __name__ == '__main__':
    main()
