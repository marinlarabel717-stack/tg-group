# Visitor Bot

这是从 `TG-Matrix` 的 `机器人中心` 里抽出来的一套独立访客机器人，现已改成 **Python 独立版**。

特点：

- 不依赖 Electron，也不需要 Node.js
- 直接用 `Python 3.10+` 就能跑
- 机器人交互内容继续放在 `config.json`
- 机器人 `Token` 单独放在 `.env`
- 支持 `Guest / 访客消息` 自动回复
- 支持按钮交互配置
- 支持关键词匹配回复
- 支持页面式按钮跳转
- 不靠 `/start`、`/menu` 这类指令驱动

## 运行

1. 复制配置文件：

```powershell
Copy-Item .\config.example.json .\config.json
Copy-Item .\.env.example .\.env
```

2. 修改 `.env`：

```env
BOT_TOKEN=你的机器人Token
```

3. 修改 `config.json` 里的页面、按钮、关键词等交互内容。

4. 先做配置检查：

```powershell
python .\main.py --config .\config.json --check
```

5. 启动：

```powershell
python .\main.py --config .\config.json
```

Linux / 宝塔里直接用：

```bash
python3 main.py --config ./config.json
```

## 配置说明

顶层配置：

- `envFile`
  `.env` 文件路径，默认 `./.env`
- `stateFile`
  运行状态文件，默认 `./data/runtime-state.json`
- `bots`
  机器人列表

单个机器人主要配置：

- `tokenEnvName`
  这个机器人从哪个环境变量里取 Token，例如 `BOT_TOKEN`
- `guestReply*`
  群里 `Guest Chat / 访客消息` 的自动回复
- `privateReply*`
  私聊默认欢迎页
- `keywordRules`
  按关键词匹配不同回复
- `pages`
  按钮跳转的页面配置

## 按钮

按钮支持两种：

- `actionType: "url"`
  直接打开链接
- `actionType: "page"`
  打开配置里的某个页面

例如：

```json
{
  "id": "pricing",
  "text": "套餐介绍",
  "actionType": "page",
  "targetPageId": "pricing"
}
```

## 模板变量

回复文本里可以用这些变量：

- `{text}`: 用户刚发的内容
- `{caller_name}`: 用户名/昵称
- `{caller_username}`: 用户 @username
- `{chat_title}`: 群标题
- `{bot_username}`: 当前机器人用户名

## 状态文件

运行状态默认写到：

`./data/runtime-state.json`

这里会保存：

- `updateOffset`
- 统计数据
- 最近错误
- 最近日志

## 备注

- 如果 Bot 没开 `Guest Chat Mode`，私聊按钮菜单照样能用，只是收不到 `guest_message`
- 这套默认就是“按钮交互优先”，不是靠指令菜单来驱动
