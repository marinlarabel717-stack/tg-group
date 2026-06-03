# Visitor Bot

这是从 `TG-Matrix` 的 `机器人中心` 里抽出来的一套独立访客机器人。

特点：

- 不依赖 Electron，单独用 `Node.js 18+` 就能跑
- 支持 `Guest / 访客消息` 自动回复
- 支持 `按钮交互配置`
- 支持 `关键词 -> 指定回复`
- 支持 `页面式按钮跳转`
- 不依赖 `/start`、`/menu` 这种指令；私聊里用户直接发一句话，机器人就会回默认菜单

## 运行

1. 复制一份配置：

```powershell
Copy-Item .\config.example.json .\config.json
```

2. 把 `config.json` 里的 `botToken` 改成你自己的。

3. 启动：

```powershell
npm start
```

也可以直接跑示例配置做语法检查：

```powershell
npm run start:example
```

## 配置说明

单个机器人主要用这几块：

- `guestReply*`
  用于群里 `Guest Chat / 访客消息` 的自动回复
- `privateReply*`
  用于私聊默认欢迎页
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
