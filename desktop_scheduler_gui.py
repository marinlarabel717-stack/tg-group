import json
import os
import random
import subprocess
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

import pyautogui
import pyperclip

try:
    import pygetwindow as gw
except Exception:
    gw = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'desktop_scheduler_config.json')
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.15


@dataclass
class Point:
    x: int
    y: int

    def as_dict(self):
        return {'x': int(self.x), 'y': int(self.y)}

    @classmethod
    def from_dict(cls, data):
        if not data:
            return None
        return cls(int(data['x']), int(data['y']))


class DesktopSchedulerApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title('Telegram 每天重复定时发送助手')
        self.root.geometry('860x760')
        self.stop_event = threading.Event()
        self.worker = None
        self.points = {
            'input_box': None,
            'send_button': None,
            'schedule_menu': None,
            'time_field': None,
            'repeat_dropdown': None,
            'repeat_daily': None,
            'confirm_button': None,
        }
        self._build_ui()
        self._load_config()

    def _build_ui(self):
        main = ttk.Frame(self.root, padding=12)
        main.pack(fill='both', expand=True)

        tips = (
            '用途：模拟你手动在 Telegram Desktop 里点「定时发送 -> 重复：每天」。\n'
            '先登录 Telegram Desktop，并打开要设置的群聊窗口。\n'
            '注意：这是桌面自动化，运行时不要乱动鼠标键盘；把鼠标移到屏幕左上角可紧急中断。'
        )
        ttk.Label(main, text=tips, foreground='#555').pack(anchor='w', pady=(0, 10))

        row1 = ttk.Frame(main)
        row1.pack(fill='x', pady=4)
        ttk.Label(row1, text='Telegram 窗口关键字').pack(side='left')
        self.window_keyword = tk.StringVar(value='Telegram')
        ttk.Entry(row1, textvariable=self.window_keyword, width=24).pack(side='left', padx=(8, 16))
        ttk.Label(row1, text='Telegram.exe 路径').pack(side='left')
        self.telegram_path = tk.StringVar(value='')
        ttk.Entry(row1, textvariable=self.telegram_path, width=42).pack(side='left', padx=8, fill='x', expand=True)
        ttk.Button(row1, text='浏览', command=self.pick_telegram_path).pack(side='left', padx=4)
        ttk.Button(row1, text='启动 Telegram', command=self.launch_telegram).pack(side='left')

        row2 = ttk.Frame(main)
        row2.pack(fill='x', pady=4)
        self.start_time = tk.StringVar(value='00:00')
        self.end_time = tk.StringVar(value='23:50')
        self.interval_minutes = tk.StringVar(value='10')
        self.click_delay = tk.StringVar(value='0.45')
        self.message_mode = tk.StringVar(value='rotate')
        ttk.Label(row2, text='开始时间').pack(side='left')
        ttk.Entry(row2, textvariable=self.start_time, width=8).pack(side='left', padx=(6, 14))
        ttk.Label(row2, text='结束时间').pack(side='left')
        ttk.Entry(row2, textvariable=self.end_time, width=8).pack(side='left', padx=(6, 14))
        ttk.Label(row2, text='间隔(分钟)').pack(side='left')
        ttk.Entry(row2, textvariable=self.interval_minutes, width=6).pack(side='left', padx=(6, 14))
        ttk.Label(row2, text='动作延迟(秒)').pack(side='left')
        ttk.Entry(row2, textvariable=self.click_delay, width=6).pack(side='left', padx=(6, 14))
        ttk.Label(row2, text='文案模式').pack(side='left')
        ttk.Combobox(row2, textvariable=self.message_mode, width=10, state='readonly', values=['rotate', 'random']).pack(side='left', padx=(6, 0))

        row3 = ttk.Frame(main)
        row3.pack(fill='both', expand=False, pady=6)
        ttk.Label(row3, text='文案池（多条文案用一行 --- 分隔）').pack(anchor='w')
        self.messages_text = scrolledtext.ScrolledText(row3, height=8, wrap='word')
        self.messages_text.pack(fill='x', expand=True, pady=(6, 0))
        self.messages_text.insert('1.0', '测试消息')

        preview_row = ttk.Frame(main)
        preview_row.pack(fill='x', pady=(8, 6))
        self.preview_var = tk.StringVar(value='将创建 144 条“每天重复”定时任务')
        ttk.Label(preview_row, textvariable=self.preview_var, foreground='#0a6').pack(side='left')
        ttk.Button(preview_row, text='刷新预览', command=self.update_preview).pack(side='right')

        calib_frame = ttk.LabelFrame(main, text='校准坐标（把鼠标移动到目标位置，再点对应按钮）', padding=10)
        calib_frame.pack(fill='x', pady=6)
        self.coord_vars = {}
        mapping = [
            ('input_box', '输入框'),
            ('send_button', '发送按钮'),
            ('schedule_menu', '右键菜单里的「定时发送」'),
            ('time_field', '定时弹窗里的时间输入框'),
            ('repeat_dropdown', '“重复”下拉框'),
            ('repeat_daily', '“每天”选项'),
            ('confirm_button', '最后的“定时”按钮'),
        ]
        for idx, (key, label) in enumerate(mapping):
            row = ttk.Frame(calib_frame)
            row.pack(fill='x', pady=2)
            ttk.Label(row, text=label, width=24).pack(side='left')
            coord_var = tk.StringVar(value='未记录')
            self.coord_vars[key] = coord_var
            ttk.Label(row, textvariable=coord_var, width=22).pack(side='left', padx=(8, 12))
            ttk.Button(row, text='记录当前位置', command=lambda k=key: self.capture_point(k)).pack(side='left')

        action_row = ttk.Frame(main)
        action_row.pack(fill='x', pady=10)
        ttk.Button(action_row, text='保存配置', command=self.save_config).pack(side='left')
        ttk.Button(action_row, text='测试激活 Telegram', command=self.activate_telegram).pack(side='left', padx=6)
        ttk.Button(action_row, text='开始批量设置', command=self.start_schedule).pack(side='left', padx=6)
        ttk.Button(action_row, text='停止', command=self.stop_schedule).pack(side='left')

        log_frame = ttk.LabelFrame(main, text='运行日志', padding=10)
        log_frame.pack(fill='both', expand=True, pady=6)
        self.log_text = scrolledtext.ScrolledText(log_frame, height=16, wrap='word', state='disabled')
        self.log_text.pack(fill='both', expand=True)

        self.update_preview()

    def pick_telegram_path(self):
        path = filedialog.askopenfilename(title='选择 Telegram.exe', filetypes=[('Telegram.exe', 'Telegram.exe'), ('可执行文件', '*.exe'), ('所有文件', '*.*')])
        if path:
            self.telegram_path.set(path)

    def launch_telegram(self):
        path = self.telegram_path.get().strip()
        if not path:
            messagebox.showwarning('提示', '先选择 Telegram.exe 路径')
            return
        subprocess.Popen([path], cwd=os.path.dirname(path) or None)
        self.log(f'已启动 Telegram: {path}')

    def capture_point(self, key):
        pos = pyautogui.position()
        point = Point(pos.x, pos.y)
        self.points[key] = point
        self.coord_vars[key].set(f'({point.x}, {point.y})')
        self.log(f'已记录 {key}: ({point.x}, {point.y})')

    def update_preview(self):
        try:
            slots = self.build_time_slots()
            self.preview_var.set(f'将创建 {len(slots)} 条“每天重复”定时任务')
        except Exception as exc:
            self.preview_var.set(f'时间配置有误：{exc}')

    def parse_messages(self):
        raw = self.messages_text.get('1.0', 'end').strip()
        parts = [item.strip() for item in raw.split('\n---\n') if item.strip()]
        if not parts:
            parts = [line.strip() for line in raw.splitlines() if line.strip()]
        if not parts:
            raise RuntimeError('至少填写一条文案')
        return parts

    def build_time_slots(self):
        start = datetime.strptime(self.start_time.get().strip(), '%H:%M')
        end = datetime.strptime(self.end_time.get().strip(), '%H:%M')
        interval = int(self.interval_minutes.get().strip())
        if interval <= 0:
            raise RuntimeError('间隔必须大于 0')
        if end < start:
            raise RuntimeError('结束时间不能早于开始时间')
        slots = []
        current = start
        while current <= end:
            slots.append(current.strftime('%H:%M'))
            current += timedelta(minutes=interval)
        return slots

    def activate_telegram(self):
        keyword = self.window_keyword.get().strip() or 'Telegram'
        if gw is None:
            self.log('未安装 pygetwindow，跳过窗口激活；请手动把 Telegram 放到前台')
            return True
        windows = [w for w in gw.getWindowsWithTitle(keyword) if getattr(w, 'title', '').strip()]
        if not windows:
            raise RuntimeError(f'没找到标题包含 {keyword!r} 的窗口，请先打开 Telegram 并进入目标群聊')
        win = windows[0]
        try:
            if win.isMinimized:
                win.restore()
            win.activate()
            time.sleep(0.6)
            self.log(f'已激活 Telegram 窗口：{win.title}')
            return True
        except Exception as exc:
            raise RuntimeError(f'激活 Telegram 窗口失败：{exc}')

    def validate_points(self):
        missing = [key for key, value in self.points.items() if value is None]
        if missing:
            raise RuntimeError('这些坐标还没记录：' + '、'.join(missing))

    def save_config(self):
        data = {
            'window_keyword': self.window_keyword.get().strip(),
            'telegram_path': self.telegram_path.get().strip(),
            'start_time': self.start_time.get().strip(),
            'end_time': self.end_time.get().strip(),
            'interval_minutes': self.interval_minutes.get().strip(),
            'click_delay': self.click_delay.get().strip(),
            'message_mode': self.message_mode.get().strip(),
            'messages': self.messages_text.get('1.0', 'end'),
            'points': {key: value.as_dict() if value else None for key, value in self.points.items()},
        }
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        self.log(f'配置已保存到 {CONFIG_PATH}')

    def _load_config(self):
        if not os.path.exists(CONFIG_PATH):
            return
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.window_keyword.set(data.get('window_keyword', 'Telegram'))
            self.telegram_path.set(data.get('telegram_path', ''))
            self.start_time.set(data.get('start_time', '00:00'))
            self.end_time.set(data.get('end_time', '23:50'))
            self.interval_minutes.set(str(data.get('interval_minutes', '10')))
            self.click_delay.set(str(data.get('click_delay', '0.45')))
            self.message_mode.set(data.get('message_mode', 'rotate'))
            self.messages_text.delete('1.0', 'end')
            self.messages_text.insert('1.0', data.get('messages', '测试消息'))
            for key, value in (data.get('points') or {}).items():
                point = Point.from_dict(value)
                self.points[key] = point
                if point and key in self.coord_vars:
                    self.coord_vars[key].set(f'({point.x}, {point.y})')
            self.update_preview()
            self.log('已加载本地配置')
        except Exception as exc:
            self.log(f'加载配置失败：{exc}')

    def log(self, message):
        text = f'[{datetime.now().strftime("%H:%M:%S")}] {message}\n'
        self.log_text.configure(state='normal')
        self.log_text.insert('end', text)
        self.log_text.see('end')
        self.log_text.configure(state='disabled')
        self.root.update_idletasks()

    def click_point(self, key, clicks=1, button='left'):
        point = self.points[key]
        pyautogui.click(point.x, point.y, clicks=clicks, button=button)

    def type_message(self, message):
        self.click_point('input_box')
        pyautogui.hotkey('ctrl', 'a')
        pyautogui.press('backspace')
        pyperclip.copy(message)
        pyautogui.hotkey('ctrl', 'v')

    def set_schedule_time(self, time_text):
        self.click_point('time_field')
        pyautogui.hotkey('ctrl', 'a')
        pyautogui.write(time_text, interval=0.02)
        self.click_point('repeat_dropdown')
        self.click_point('repeat_daily')
        self.click_point('confirm_button')

    def open_schedule_menu(self):
        point = self.points['send_button']
        pyautogui.click(point.x, point.y, button='right')
        self.click_point('schedule_menu')

    def next_message(self, messages, index):
        if self.message_mode.get().strip() == 'random':
            return random.choice(messages)
        return messages[index % len(messages)]

    def run_schedule(self):
        try:
            self.validate_points()
            self.activate_telegram()
            messages = self.parse_messages()
            slots = self.build_time_slots()
            delay = float(self.click_delay.get().strip())
            self.log(f'开始批量设置，共 {len(slots)} 个时间点')
            time.sleep(0.8)
            for idx, slot in enumerate(slots, start=1):
                if self.stop_event.is_set():
                    self.log('已收到停止指令，任务中断')
                    return
                message = self.next_message(messages, idx - 1)
                self.log(f'[{idx}/{len(slots)}] 设置 {slot}')
                self.type_message(message)
                time.sleep(delay)
                self.open_schedule_menu()
                time.sleep(delay)
                self.set_schedule_time(slot)
                time.sleep(delay)
            self.log('全部设置完成')
            messagebox.showinfo('完成', '已经批量创建完每天重复的定时发送。')
        except pyautogui.FailSafeException:
            self.log('检测到左上角 failsafe，已紧急停止')
            messagebox.showwarning('已停止', '你把鼠标移到了左上角，任务已紧急停止。')
        except Exception as exc:
            self.log(f'运行失败：{exc}')
            messagebox.showerror('运行失败', str(exc))
        finally:
            self.worker = None
            self.stop_event.clear()

    def start_schedule(self):
        if self.worker and self.worker.is_alive():
            messagebox.showinfo('提示', '任务已经在跑了')
            return
        self.update_preview()
        self.save_config()
        self.stop_event.clear()
        self.worker = threading.Thread(target=self.run_schedule, daemon=True)
        self.worker.start()

    def stop_schedule(self):
        self.stop_event.set()
        self.log('已请求停止')


def main():
    root = tk.Tk()
    style = ttk.Style(root)
    try:
        style.theme_use('vista')
    except Exception:
        pass
    app = DesktopSchedulerApp(root)
    root.mainloop()


if __name__ == '__main__':
    main()
