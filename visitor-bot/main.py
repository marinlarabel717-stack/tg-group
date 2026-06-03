from __future__ import annotations

import argparse
import copy
import json
import os
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Any
from urllib import error, request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


DEFAULT_KEYWORD_RULE = {
    "id": "",
    "enabled": True,
    "keyword": "",
    "matchType": "contains",
    "replyEnabled": True,
    "replyType": "text",
    "title": "访客机器人",
    "text": "你好，我已经收到你的消息。\n\n你刚才发送的是：{text}",
    "imageUrl": "",
    "buttons": [],
}

DEFAULT_PAGE = {
    "id": "",
    "title": "访客机器人",
    "text": "",
    "replyType": "text",
    "imageUrl": "",
    "buttons": [],
}

DEFAULT_BOT = {
    "id": "",
    "name": "访客机器人 1",
    "tokenEnvName": "BOT_TOKEN",
    "autoStart": True,
    "guestReplyEnabled": True,
    "guestReplyTitle": "访客机器人",
    "guestReplyText": "你好，我已经收到你的访客消息。\n\n你刚才发送的是：{text}",
    "guestReplyType": "text",
    "guestReplyImageUrl": "",
    "guestReplyButtons": [],
    "privateReplyEnabled": True,
    "privateReplyTitle": "欢迎来到访客机器人",
    "privateReplyText": "这里不用指令，直接点下面按钮就行。",
    "privateReplyType": "text",
    "privateReplyImageUrl": "",
    "privateReplyButtons": [],
    "keywordRules": [],
    "pages": [],
}


def create_id(prefix: str) -> str:
    return f"{prefix}-{int(time.time() * 1000)}"


def normalize_string(value: Any, fallback: str = "") -> str:
    return value.strip() if isinstance(value, str) else fallback


def normalize_boolean(value: Any, fallback: bool) -> bool:
    return value if isinstance(value, bool) else fallback


def normalize_reply_type(value: Any, fallback: str) -> str:
    return "photo" if value == "photo" else fallback


def normalize_match_type(value: Any, fallback: str) -> str:
    return "equals" if value == "equals" else fallback


def normalize_action_type(value: Any, fallback: str) -> str:
    return "page" if value == "page" else fallback


def resolve_path(base_dir: Path, raw_value: Any, fallback: str) -> Path:
    raw = normalize_string(raw_value)
    path = Path(raw or fallback)
    if not path.is_absolute():
        path = base_dir / path
    return path.resolve()


def normalize_button(raw: Any, index: int = 0) -> dict[str, Any]:
    item = raw if isinstance(raw, dict) else {}
    return {
        "id": normalize_string(item.get("id")) or create_id(f"btn-{index}"),
        "text": normalize_string(item.get("text")),
        "actionType": normalize_action_type(item.get("actionType"), "url"),
        "url": normalize_string(item.get("url")),
        "targetPageId": normalize_string(item.get("targetPageId")),
        "style": normalize_string(item.get("style"), "primary") or "primary",
    }


def normalize_buttons(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    buttons = []
    for index, item in enumerate(raw):
        button = normalize_button(item, index)
        if not button["text"]:
            continue
        if button["actionType"] == "page" and button["targetPageId"]:
            buttons.append(button)
        elif button["actionType"] == "url" and button["url"]:
            buttons.append(button)
    return buttons


def normalize_keyword_rule(raw: Any, index: int = 0) -> dict[str, Any]:
    item = raw if isinstance(raw, dict) else {}
    return {
        "id": normalize_string(item.get("id")) or create_id(f"rule-{index}"),
        "enabled": normalize_boolean(item.get("enabled"), DEFAULT_KEYWORD_RULE["enabled"]),
        "keyword": normalize_string(item.get("keyword")),
        "matchType": normalize_match_type(item.get("matchType"), DEFAULT_KEYWORD_RULE["matchType"]),
        "replyEnabled": normalize_boolean(item.get("replyEnabled"), DEFAULT_KEYWORD_RULE["replyEnabled"]),
        "replyType": normalize_reply_type(item.get("replyType"), DEFAULT_KEYWORD_RULE["replyType"]),
        "title": normalize_string(item.get("title"), DEFAULT_KEYWORD_RULE["title"]) or DEFAULT_KEYWORD_RULE["title"],
        "text": item.get("text") if isinstance(item.get("text"), str) and item.get("text").strip() else DEFAULT_KEYWORD_RULE["text"],
        "imageUrl": normalize_string(item.get("imageUrl")),
        "buttons": normalize_buttons(item.get("buttons")),
    }


def normalize_page(raw: Any, index: int = 0) -> dict[str, Any]:
    item = raw if isinstance(raw, dict) else {}
    return {
        "id": normalize_string(item.get("id")) or create_id(f"page-{index}"),
        "title": normalize_string(item.get("title"), DEFAULT_PAGE["title"]) or DEFAULT_PAGE["title"],
        "text": item.get("text") if isinstance(item.get("text"), str) else DEFAULT_PAGE["text"],
        "replyType": normalize_reply_type(item.get("replyType"), DEFAULT_PAGE["replyType"]),
        "imageUrl": normalize_string(item.get("imageUrl")),
        "buttons": normalize_buttons(item.get("buttons")),
    }


def normalize_bot(raw: Any, index: int = 0) -> dict[str, Any]:
    item = raw if isinstance(raw, dict) else {}
    return {
        "id": normalize_string(item.get("id")) or create_id(f"bot-{index + 1}"),
        "name": normalize_string(item.get("name"), f"访客机器人 {index + 1}") or f"访客机器人 {index + 1}",
        "tokenEnvName": normalize_string(item.get("tokenEnvName"), DEFAULT_BOT["tokenEnvName"]) or DEFAULT_BOT["tokenEnvName"],
        "autoStart": normalize_boolean(item.get("autoStart"), DEFAULT_BOT["autoStart"]),
        "guestReplyEnabled": normalize_boolean(item.get("guestReplyEnabled"), DEFAULT_BOT["guestReplyEnabled"]),
        "guestReplyTitle": normalize_string(item.get("guestReplyTitle"), DEFAULT_BOT["guestReplyTitle"]) or DEFAULT_BOT["guestReplyTitle"],
        "guestReplyText": item.get("guestReplyText") if isinstance(item.get("guestReplyText"), str) and item.get("guestReplyText").strip() else DEFAULT_BOT["guestReplyText"],
        "guestReplyType": normalize_reply_type(item.get("guestReplyType"), DEFAULT_BOT["guestReplyType"]),
        "guestReplyImageUrl": normalize_string(item.get("guestReplyImageUrl")),
        "guestReplyButtons": normalize_buttons(item.get("guestReplyButtons")),
        "privateReplyEnabled": normalize_boolean(item.get("privateReplyEnabled"), DEFAULT_BOT["privateReplyEnabled"]),
        "privateReplyTitle": normalize_string(item.get("privateReplyTitle"), DEFAULT_BOT["privateReplyTitle"]) or DEFAULT_BOT["privateReplyTitle"],
        "privateReplyText": item.get("privateReplyText") if isinstance(item.get("privateReplyText"), str) and item.get("privateReplyText").strip() else DEFAULT_BOT["privateReplyText"],
        "privateReplyType": normalize_reply_type(item.get("privateReplyType"), DEFAULT_BOT["privateReplyType"]),
        "privateReplyImageUrl": normalize_string(item.get("privateReplyImageUrl")),
        "privateReplyButtons": normalize_buttons(item.get("privateReplyButtons")),
        "keywordRules": [normalize_keyword_rule(rule, rule_index) for rule_index, rule in enumerate(item.get("keywordRules", []))] if isinstance(item.get("keywordRules"), list) else [],
        "pages": [normalize_page(page, page_index) for page_index, page in enumerate(item.get("pages", []))] if isinstance(item.get("pages"), list) else [],
    }


def normalize_config(raw: dict[str, Any], config_path: Path) -> dict[str, Any]:
    config_dir = config_path.parent
    return {
        "envFile": resolve_path(config_dir, raw.get("envFile"), "./.env"),
        "stateFile": resolve_path(config_dir, raw.get("stateFile"), "./data/runtime-state.json"),
        "bots": [normalize_bot(bot, index) for index, bot in enumerate(raw.get("bots", []))] if isinstance(raw.get("bots"), list) else [],
    }


def ensure_parent_directory(file_path: Path) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)


def read_json(file_path: Path, fallback: Any) -> Any:
    try:
        if not file_path.exists():
            return fallback
        return json.loads(file_path.read_text("utf-8"))
    except Exception:
        return fallback


def write_json(file_path: Path, payload: Any) -> None:
    ensure_parent_directory(file_path)
    file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), "utf-8")


def normalize_keyword_text(value: Any) -> str:
    return str(value or "").strip().lower()


def apply_template(template: str, variables: dict[str, Any]) -> str:
    result = str(template or "")
    for key, value in variables.items():
        result = result.replace(f"{{{key}}}", str(value or ""))
    return result


def cap_logs(logs: list[dict[str, Any]], max_size: int = 200) -> list[dict[str, Any]]:
    return logs[:max_size]


def chunk_buttons(items: list[dict[str, Any]], size: int = 2) -> list[list[dict[str, Any]]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def load_env_file(file_path: Path) -> None:
    if not file_path.exists():
        return
    for raw_line in file_path.read_text("utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if value.startswith(("'", '"')) and value.endswith(("'", '"')) and len(value) >= 2:
            value = value[1:-1]
        os.environ.setdefault(key, value)


class RuntimeStateStore:
    def __init__(self, file_path: Path) -> None:
        self.file_path = file_path
        self.lock = threading.RLock()
        self.state = read_json(file_path, {"bots": {}})
        if not isinstance(self.state, dict) or not isinstance(self.state.get("bots"), dict):
            self.state = {"bots": {}}

    def default_state(self) -> dict[str, Any]:
        return {
            "updateOffset": 0,
            "profile": {
                "id": None,
                "username": "",
                "firstName": "",
                "supportsGuestQueries": False,
                "valid": False,
                "fetchedAt": None,
            },
            "stats": {
                "receivedGuestCount": 0,
                "answeredGuestCount": 0,
                "failedGuestCount": 0,
                "privateReplyCount": 0,
                "callbackReplyCount": 0,
                "lastGuestAt": None,
                "lastPrivateAt": None,
            },
            "lastPollAt": None,
            "lastActionMessage": "",
            "lastError": "",
            "logs": [],
        }

    def get_bot_state(self, bot_id: str) -> dict[str, Any]:
        with self.lock:
            item = self.state["bots"].get(bot_id)
            if isinstance(item, dict):
                return copy.deepcopy(item)
            return self.default_state()

    def update_bot_state(self, bot_id: str, updater) -> dict[str, Any]:
        with self.lock:
            current = self.get_bot_state(bot_id)
            next_state = updater(current)
            self.state["bots"][bot_id] = next_state
            write_json(self.file_path, self.state)
            return copy.deepcopy(next_state)


class TelegramBotApi:
    def __init__(self, token: str) -> None:
        self.token = token

    def call(self, method: str, payload: dict[str, Any] | None = None, timeout: int = 70) -> Any:
        url = f"https://api.telegram.org/bot{self.token}/{method}"
        body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
        req = request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Telegram Bot API 请求失败（HTTP {exc.code}）：{detail or exc.reason}") from exc
        except error.URLError as exc:
            raise RuntimeError(f"Telegram Bot API 请求失败：{exc.reason}") from exc

        json_payload = json.loads(raw)
        if not json_payload.get("ok"):
            raise RuntimeError(str(json_payload.get("description") or f"{method} 调用失败"))
        return json_payload.get("result")


class VisitorBotRuntime:
    def __init__(self, bot_config: dict[str, Any], state_store: RuntimeStateStore) -> None:
        self.bot = bot_config
        self.state_store = state_store
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.token = os.environ.get(self.bot["tokenEnvName"], "").strip()
        self.api = TelegramBotApi(self.token) if self.token else None

    def read_state(self) -> dict[str, Any]:
        return self.state_store.get_bot_state(self.bot["id"])

    def write_state(self, updater) -> dict[str, Any]:
        return self.state_store.update_bot_state(self.bot["id"], updater)

    def log(self, level: str, message: str) -> None:
        line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [{self.bot['name']}] {message}"
        print(line, flush=True)
        self.write_state(
            lambda current: {
                **current,
                "logs": cap_logs(
                    [
                        {
                            "id": create_id("log"),
                            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                            "level": level,
                            "message": message,
                        },
                        *list(current.get("logs", [])),
                    ]
                ),
            }
        )

    def start(self) -> None:
        self.thread = threading.Thread(target=self.run, name=f"visitor-bot-{self.bot['id']}", daemon=True)
        self.thread.start()

    def stop(self, reason: str = "机器人已停止。") -> None:
        if self.stop_event.is_set():
            return
        self.stop_event.set()
        self.write_state(lambda current: {**current, "lastActionMessage": reason})
        self.log("info", reason)

    def run(self) -> None:
        if not self.token:
            self.log("warning", f"环境变量 {self.bot['tokenEnvName']} 未设置，已跳过启动。")
            return
        if not self.api:
            self.log("error", "Bot API 初始化失败。")
            return

        profile = self.refresh_profile()
        if not profile or not profile.get("valid"):
            self.log("error", "Bot 信息读取失败，当前机器人没有启动。")
            return

        mode_text = "Guest 模式可用" if profile.get("supportsGuestQueries") else "Guest 模式未开启，仅保留私聊按钮交互"
        self.log("success", f"机器人已启动：@{profile.get('username') or '未命名'}，{mode_text}")

        while not self.stop_event.is_set():
            self.write_state(
                lambda current: {
                    **current,
                    "lastPollAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "lastError": "",
                }
            )
            try:
                current = self.read_state()
                updates = self.api.call(
                    "getUpdates",
                    {
                        "offset": int(current.get("updateOffset", 0)) + 1,
                        "timeout": 50,
                        "allowed_updates": ["guest_message", "message", "callback_query"],
                    },
                    timeout=65,
                )
                for update in updates or []:
                    update_id = update.get("update_id")
                    if isinstance(update_id, int):
                        self.write_state(
                            lambda state, uid=update_id: {
                                **state,
                                "updateOffset": max(int(state.get("updateOffset", 0)), uid),
                            }
                        )
                    self.handle_update(update)
            except Exception as exc:
                if self.stop_event.is_set():
                    break
                self.write_state(lambda current: {**current, "lastError": str(exc)})
                self.log("error", f"轮询失败：{exc}")
                self.stop_event.wait(2.5)

    def refresh_profile(self) -> dict[str, Any] | None:
        if not self.api:
            return None
        try:
            payload = self.api.call("getMe", {}, timeout=20)
            profile = {
                "id": payload.get("id"),
                "username": payload.get("username", ""),
                "firstName": payload.get("first_name", ""),
                "supportsGuestQueries": bool(payload.get("supports_guest_queries", False)),
                "valid": True,
                "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            self.write_state(
                lambda current: {
                    **current,
                    "profile": profile,
                    "lastError": "",
                    "lastActionMessage": "已刷新 Bot 信息。",
                }
            )
            return profile
        except Exception as exc:
            self.write_state(
                lambda current: {
                    **current,
                    "profile": {
                        "id": None,
                        "username": "",
                        "firstName": "",
                        "supportsGuestQueries": False,
                        "valid": False,
                        "fetchedAt": None,
                    },
                    "lastError": str(exc),
                }
            )
            self.log("error", f"读取 Bot 信息失败：{exc}")
            return None

    def handle_update(self, update: dict[str, Any]) -> None:
        if isinstance(update.get("guest_message"), dict):
            self.handle_guest_message(update["guest_message"])
            return
        if isinstance(update.get("callback_query"), dict):
            self.handle_callback_query(update["callback_query"])
            return
        if isinstance(update.get("message"), dict):
            self.handle_private_message(update["message"])

    def resolve_keyword_reply(self, text: str) -> dict[str, Any] | None:
        normalized_text = normalize_keyword_text(text)
        if not normalized_text:
            return None
        for rule in self.bot["keywordRules"]:
            if not rule.get("enabled") or not rule.get("replyEnabled"):
                continue
            keyword = normalize_keyword_text(rule.get("keyword"))
            if not keyword:
                continue
            matched = normalized_text == keyword if rule.get("matchType") == "equals" else keyword in normalized_text
            if matched:
                return rule
        return None

    def resolve_page(self, page_id: str) -> dict[str, Any] | None:
        for page in self.bot["pages"]:
            if page.get("id") == page_id:
                return page
        return None

    def render_text(self, template: str, context: dict[str, Any]) -> str:
        profile = self.read_state().get("profile", {})
        return apply_template(
            template,
            {
                "text": context.get("text", ""),
                "caller_name": context.get("callerName", ""),
                "caller_username": context.get("callerUsername", ""),
                "chat_title": context.get("chatTitle", ""),
                "bot_username": f"@{profile.get('username')}" if profile.get("username") else "当前机器人",
            },
        )

    def build_reply_markup(self, buttons: list[dict[str, Any]]) -> dict[str, Any] | None:
        valid_buttons = [button for button in buttons if button.get("text")]
        if not valid_buttons:
            return None
        return {
            "inline_keyboard": [
                [
                    {
                        "text": button["text"],
                        **({"callback_data": f"page:{button['targetPageId']}"} if button.get("actionType") == "page" else {"url": button["url"]}),
                    }
                    for button in row
                ]
                for row in chunk_buttons(valid_buttons)
            ]
        }

    def build_guest_result(self, reply_config: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        rendered_text = self.render_text(reply_config.get("text", ""), context)
        reply_markup = self.build_reply_markup(reply_config.get("buttons", []))
        if reply_config.get("replyType") == "photo" and reply_config.get("imageUrl"):
            payload = {
                "type": "photo",
                "id": create_id("guest-photo"),
                "title": reply_config.get("title", ""),
                "photo_url": reply_config["imageUrl"],
                "thumbnail_url": reply_config["imageUrl"],
                "caption": rendered_text,
            }
            if reply_markup:
                payload["reply_markup"] = reply_markup
            return payload

        payload = {
            "type": "article",
            "id": create_id("guest-article"),
            "title": reply_config.get("title", ""),
            "input_message_content": {"message_text": rendered_text},
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup
        return payload

    def send_chat_reply(self, chat_id: int, reply_config: dict[str, Any], context: dict[str, Any]) -> None:
        if not self.api:
            raise RuntimeError("Bot API 未初始化")
        rendered_text = self.render_text(reply_config.get("text", ""), context)
        reply_markup = self.build_reply_markup(reply_config.get("buttons", []))
        if reply_config.get("replyType") == "photo" and reply_config.get("imageUrl"):
            payload: dict[str, Any] = {
                "chat_id": chat_id,
                "photo": reply_config["imageUrl"],
                "caption": rendered_text,
            }
            if reply_markup:
                payload["reply_markup"] = reply_markup
            self.api.call("sendPhoto", payload, timeout=20)
            return

        payload = {"chat_id": chat_id, "text": rendered_text}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        self.api.call("sendMessage", payload, timeout=20)

    def handle_guest_message(self, guest_message: dict[str, Any]) -> None:
        query_id = guest_message.get("guest_query_id")
        text = normalize_string(guest_message.get("text")) or normalize_string(guest_message.get("caption")) or "[非文本消息]"
        sender = guest_message.get("from") or guest_message.get("guest_sender_user") or {}
        caller_name = " ".join(part for part in [sender.get("first_name"), sender.get("last_name")] if isinstance(part, str) and part.strip()).strip() or "访客用户"
        caller_username = f"@{sender.get('username').lstrip('@')}" if normalize_string(sender.get("username")) else "未提供"
        chat = guest_message.get("chat") or {}
        chat_title = normalize_string(chat.get("title")) or "未命名群组"

        self.write_state(
            lambda current: {
                **current,
                "stats": {
                    **current.get("stats", {}),
                    "receivedGuestCount": int(current.get("stats", {}).get("receivedGuestCount", 0)) + 1,
                    "lastGuestAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                },
            }
        )
        self.log("info", f"收到访客消息：群【{chat_title}】/ 用户【{caller_name}】/ 内容【{text}】")

        if not self.bot.get("guestReplyEnabled"):
            self.log("warning", "Guest 自动回复当前已关闭，这条只记日志，不回复。")
            return
        if not query_id:
            self.write_state(
                lambda current: {
                    **current,
                    "stats": {
                        **current.get("stats", {}),
                        "failedGuestCount": int(current.get("stats", {}).get("failedGuestCount", 0)) + 1,
                    },
                    "lastError": "未拿到 guest_query_id，无法回复访客消息。",
                }
            )
            self.log("error", "收到访客消息，但没拿到 guest_query_id，无法回复。")
            return

        matched_rule = self.resolve_keyword_reply(text)
        reply_config = matched_rule or {
            "title": self.bot["guestReplyTitle"],
            "text": self.bot["guestReplyText"],
            "replyType": self.bot["guestReplyType"],
            "imageUrl": self.bot["guestReplyImageUrl"],
            "buttons": self.bot["guestReplyButtons"],
        }

        try:
            assert self.api is not None
            self.api.call(
                "answerGuestQuery",
                {
                    "guest_query_id": query_id,
                    "result": self.build_guest_result(
                        reply_config,
                        {
                            "text": text,
                            "callerName": caller_name,
                            "callerUsername": caller_username,
                            "chatTitle": chat_title,
                        },
                    ),
                },
                timeout=20,
            )
            self.write_state(
                lambda current: {
                    **current,
                    "stats": {
                        **current.get("stats", {}),
                        "answeredGuestCount": int(current.get("stats", {}).get("answeredGuestCount", 0)) + 1,
                    },
                    "lastActionMessage": f"已回复群【{chat_title}】的访客消息。",
                    "lastError": "",
                }
            )
            self.log("success", f"访客消息已{'按关键词回复' if matched_rule else '自动回复'}。")
        except Exception as exc:
            self.write_state(
                lambda current: {
                    **current,
                    "stats": {
                        **current.get("stats", {}),
                        "failedGuestCount": int(current.get("stats", {}).get("failedGuestCount", 0)) + 1,
                    },
                    "lastError": str(exc),
                }
            )
            self.log("error", f"回复访客消息失败：{exc}")

    def handle_private_message(self, message: dict[str, Any]) -> None:
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        if not isinstance(chat_id, int) or chat.get("type") != "private":
            return
        if isinstance(message.get("from"), dict) and message["from"].get("is_bot"):
            return
        if not self.bot.get("privateReplyEnabled"):
            return

        text = normalize_string(message.get("text")) or normalize_string(message.get("caption")) or "[非文本消息]"
        sender = message.get("from") or {}
        caller_name = " ".join(part for part in [sender.get("first_name"), sender.get("last_name")] if isinstance(part, str) and part.strip()).strip() or "访客用户"
        caller_username = f"@{sender.get('username').lstrip('@')}" if normalize_string(sender.get("username")) else "未提供"
        matched_rule = self.resolve_keyword_reply(text)
        reply_config = matched_rule or {
            "title": self.bot["privateReplyTitle"],
            "text": self.bot["privateReplyText"],
            "replyType": self.bot["privateReplyType"],
            "imageUrl": self.bot["privateReplyImageUrl"],
            "buttons": self.bot["privateReplyButtons"],
        }

        try:
            self.send_chat_reply(
                chat_id,
                reply_config,
                {
                    "text": text,
                    "callerName": caller_name,
                    "callerUsername": caller_username,
                    "chatTitle": "私聊",
                },
            )
            self.write_state(
                lambda current: {
                    **current,
                    "stats": {
                        **current.get("stats", {}),
                        "privateReplyCount": int(current.get("stats", {}).get("privateReplyCount", 0)) + 1,
                        "lastPrivateAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    },
                    "lastError": "",
                }
            )
            self.log("success", f"私聊消息已{'按关键词回复' if matched_rule else '发送默认菜单'}。")
        except Exception as exc:
            self.write_state(lambda current: {**current, "lastError": str(exc)})
            self.log("error", f"私聊回复失败：{exc}")

    def handle_callback_query(self, callback_query: dict[str, Any]) -> None:
        data = normalize_string(callback_query.get("data"))
        message = callback_query.get("message") or {}
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        if not data or not isinstance(chat_id, int):
            return

        if data.startswith("page:"):
            page_id = data.split("page:", 1)[1]
            page = self.resolve_page(page_id)
            if not page:
                self.safe_answer_callback(callback_query.get("id"), "这个按钮页面不存在。")
                return
            sender = callback_query.get("from") or {}
            caller_name = " ".join(part for part in [sender.get("first_name"), sender.get("last_name")] if isinstance(part, str) and part.strip()).strip() or "访客用户"
            caller_username = f"@{sender.get('username').lstrip('@')}" if normalize_string(sender.get("username")) else "未提供"
            try:
                self.send_chat_reply(
                    chat_id,
                    page,
                    {
                        "text": normalize_string(message.get("text")) or normalize_string(message.get("caption")),
                        "callerName": caller_name,
                        "callerUsername": caller_username,
                        "chatTitle": normalize_string(chat.get("title")) or "私聊",
                    },
                )
                self.safe_answer_callback(callback_query.get("id"), "已打开。")
                self.write_state(
                    lambda current: {
                        **current,
                        "stats": {
                            **current.get("stats", {}),
                            "callbackReplyCount": int(current.get("stats", {}).get("callbackReplyCount", 0)) + 1,
                        },
                        "lastError": "",
                    }
                )
                self.log("info", f"按钮交互已触发页面【{page_id}】。")
            except Exception as exc:
                self.safe_answer_callback(callback_query.get("id"), "打开失败，请稍后再试。")
                self.write_state(lambda current: {**current, "lastError": str(exc)})
                self.log("error", f"按钮页面发送失败：{exc}")
            return

        self.safe_answer_callback(callback_query.get("id"), "这个按钮动作暂时没接。")

    def safe_answer_callback(self, callback_id: Any, text: str) -> None:
        if not callback_id or not self.api:
            return
        try:
            self.api.call("answerCallbackQuery", {"callback_query_id": callback_id, "text": text}, timeout=15)
        except Exception:
            return


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Standalone Python visitor bot for TG-Matrix")
    parser.add_argument("--config", default="config.json", help="Path to config json")
    parser.add_argument("--check", action="store_true", help="Validate config only and exit")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config_path = Path(args.config).resolve()
    if not config_path.exists():
        print(f"配置文件不存在：{config_path}", file=sys.stderr)
        return 1

    raw_config = read_json(config_path, None)
    if not isinstance(raw_config, dict):
        print(f"配置文件读取失败：{config_path}", file=sys.stderr)
        return 1

    config = normalize_config(raw_config, config_path)
    load_env_file(config["envFile"])

    if not config["bots"]:
        print("没有可启动的机器人配置。", file=sys.stderr)
        return 1

    if args.check:
        print(f"配置检查通过：{config_path}")
        print(f"env 文件：{config['envFile']}")
        for bot in config["bots"]:
            print(f"- {bot['name']} -> env: {bot['tokenEnvName']}")
        return 0

    state_store = RuntimeStateStore(config["stateFile"])
    runtimes = [VisitorBotRuntime(bot, state_store) for bot in config["bots"] if bot.get("autoStart", True)]
    if not runtimes:
        print("当前没有开启 autoStart 的机器人。")
        return 0

    shut_down = threading.Event()

    def request_shutdown(signame: str) -> None:
        if shut_down.is_set():
            return
        shut_down.set()
        for runtime in runtimes:
            runtime.stop(f"收到 {signame}，正在停止机器人...")

    signal.signal(signal.SIGINT, lambda *_: request_shutdown("SIGINT"))
    signal.signal(signal.SIGTERM, lambda *_: request_shutdown("SIGTERM"))

    for runtime in runtimes:
        runtime.start()

    try:
        while True:
            alive = [runtime.thread for runtime in runtimes if runtime.thread and runtime.thread.is_alive()]
            if not alive:
                break
            time.sleep(1.0)
    except KeyboardInterrupt:
        request_shutdown("KeyboardInterrupt")

    for runtime in runtimes:
        if runtime.thread:
            runtime.thread.join(timeout=2.0)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
