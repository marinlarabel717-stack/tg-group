# Telegram 群聊定时发送工具

这个小工具用于：
- 登录你自己的 Telegram 账号
- 选择你账号里已有的群聊
- 按固定间隔自动发送消息（默认每 10 分钟一次）

## 1. 安装依赖

```bash
pip install -r requirements.txt
```

## 2. 复制配置

把 `.env.example` 复制成 `.env`，然后填写：

```env
API_ID=123456
API_HASH=your_api_hash_here
PHONE=+1234567890
CHAT_ID_OR_NAME=-1001234567890
MESSAGE=测试消息
INTERVAL_MINUTES=10
SESSION_NAME=tg_group_scheduler
```

## 3. 先登录

```bash
python scheduler.py login
```

首次会要求输入验证码；如果账号开了两步验证，还会要求输入密码。

## 4. 查看你的群 / 会话

```bash
python scheduler.py list
```

你可以拿到：
- 群 id
- 群标题
- username（如果有）

然后把 `.env` 里的 `CHAT_ID_OR_NAME` 改成：
- `-100...` 群 id，最稳
- 或 `@username`
- 或群标题（标题重复时不推荐）

## 5. 先试发一次

```bash
python scheduler.py send-once
```

## 6. 开始每 10 分钟发送

```bash
python scheduler.py run
```

## 说明

- 默认间隔就是 `10` 分钟，改 `.env` 里的 `INTERVAL_MINUTES` 就行。
- 登录信息会保存在本目录下的 session 文件里，下次不用重复登录。
- 只建议用于你自己的账号、你自己的群，别拿去乱发。
