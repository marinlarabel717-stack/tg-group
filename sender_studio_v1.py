import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QColor, QBrush
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFormLayout,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QProgressDialog,
    QScrollArea,
    QSizePolicy,
    QSplitter,
    QStackedWidget,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from studio_store import STATUS_OPTIONS, StudioStore

BASE_DIR = Path(__file__).resolve().parent

APP_STYLE = """
QWidget {
    background: #0b1020;
    color: #e5e7eb;
    font-family: 'Segoe UI', 'Microsoft YaHei UI';
    font-size: 14px;
}
QMainWindow {
    background: #0b1020;
}
QFrame#Sidebar {
    background: #0f172a;
    border-right: 1px solid #1e293b;
}
QFrame#TopBar {
    background: #111827;
    border-bottom: 1px solid #1f2937;
}
QFrame#Card, QFrame#Panel {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 18px;
}
QFrame#AccentCard {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #1d4ed8, stop:1 #7c3aed);
    border: none;
    border-radius: 20px;
}
QPushButton {
    background: #1f2937;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 10px 16px;
}
QPushButton:hover {
    background: #273449;
}
QPushButton[role='primary'] {
    background: #2563eb;
    border: 1px solid #3b82f6;
    color: white;
    font-weight: 600;
}
QPushButton[role='primary']:hover {
    background: #1d4ed8;
}
QPushButton[role='ghost'] {
    background: transparent;
    border: 1px solid #263244;
}
QToolButton[nav='true'] {
    text-align: left;
    border: none;
    border-radius: 14px;
    padding: 12px 14px;
    background: transparent;
    color: #cbd5e1;
    font-size: 15px;
}
QToolButton[nav='true']:hover {
    background: #172033;
}
QToolButton[active='true'] {
    background: #1d4ed8;
    color: white;
    font-weight: 600;
}
QLineEdit, QTextEdit, QComboBox {
    background: #1a2236;
    border: 1px solid #2d3855;
    border-radius: 10px;
    padding: 8px 12px;
    selection-background-color: #2563eb;
}
QTextEdit {
    padding: 12px;
}
QComboBox::drop-down {
    border: none;
    width: 24px;
}
QTableWidget {
    background: #141c2f;
    border: 1px solid #243146;
    gridline-color: #1f2937;
    border-radius: 14px;
    alternate-background-color: #182235;
    selection-background-color: #2c3854;
    selection-color: white;
}
QHeaderView::section {
    background: #27314a;
    color: #d4dcf2;
    border: none;
    border-bottom: 1px solid #394562;
    padding: 14px 12px;
    font-weight: 600;
}
QTableWidget::item {
    border-bottom: 1px solid #202b43;
    padding: 8px;
}
QTableWidget::item:selected {
    background: #2c3854;
    color: white;
}
QTableWidget::item:selected:active {
    background: #2c3854;
    color: white;
}
QTableCornerButton::section {
    background: #0f172a;
    border: none;
}
QScrollBar:vertical {
    background: transparent;
    width: 10px;
    margin: 4px;
}
QScrollBar::handle:vertical {
    background: #334155;
    border-radius: 5px;
    min-height: 24px;
}
QCheckBox {
    spacing: 8px;
}
QFrame[variant='toolbar'] {
    background: #1b2440;
    border: 1px solid #273250;
    border-radius: 16px;
}
QFrame[variant='statusbar'] {
    background: #1b2440;
    border: 1px solid #273250;
    border-radius: 16px;
}
QFrame[variant='miniCard'] {
    background: #202944;
    border: 1px solid #2d3855;
    border-radius: 12px;
}
QFrame[variant='inspector'] {
    background: #121a2c;
    border: 1px solid #243146;
    border-radius: 16px;
}
QLabel[chip='true'] {
    background: #111827;
    border: 1px solid #233048;
    border-radius: 12px;
    padding: 8px 12px;
    color: #cbd5e1;
}
QLabel[soft='true'] {
    color: #cbd5e1;
    font-size: 13px;
}
QLabel[dim='true'] {
    color: #94a3b8;
}
QListWidget {
    background: transparent;
    border: none;
}
QListWidget::item {
    background: #0f172a;
    border: 1px solid #263244;
    border-radius: 12px;
    margin: 4px 0;
    padding: 12px;
}
QLabel[status='normal'] {
    color: #22c55e;
    font-weight: 700;
}
QLabel[status='warning'] {
    color: #f59e0b;
    font-weight: 700;
}
QLabel[status='danger'] {
    color: #ef4444;
    font-weight: 700;
}
QLabel[status='muted'] {
    color: #94a3b8;
    font-weight: 700;
}
QSplitter::handle {
    background: #0f172a;
}
QCheckBox[table='true']::indicator {
    width: 16px;
    height: 16px;
}
QCheckBox[table='true']::indicator:unchecked {
    border-radius: 8px;
    border: 1px solid #4b5b79;
    background: #141c2f;
}
QCheckBox[table='true']::indicator:checked {
    border-radius: 8px;
    border: 1px solid #4c8dff;
    background: #3b82f6;
}
QLabel[tableHeader='true'] {
    color: #7dd3fc;
    font-weight: 700;
    font-size: 13px;
}
"""


class Panel(QFrame):
    def __init__(self, title: str = '', subtitle: str = ''):
        super().__init__()
        self.setObjectName('Panel')
        outer = QVBoxLayout(self)
        outer.setContentsMargins(18, 18, 18, 18)
        outer.setSpacing(14)
        if title:
            title_label = QLabel(title)
            title_label.setStyleSheet('font-size:18px;font-weight:700;color:white;')
            outer.addWidget(title_label)
        if subtitle:
            sub_label = QLabel(subtitle)
            sub_label.setStyleSheet('color:#94a3b8;font-size:13px;')
            outer.addWidget(sub_label)
        self.body = QVBoxLayout()
        self.body.setSpacing(12)
        outer.addLayout(self.body)


class MetricCard(QFrame):
    def __init__(self, title: str, value: str, subtitle: str, accent: str = '#22c55e'):
        super().__init__()
        self.setObjectName('Card')
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 18, 18, 18)
        dot = QLabel('●')
        dot.setStyleSheet(f'color:{accent};font-size:18px;')
        self.title_label = QLabel(title)
        self.title_label.setStyleSheet('color:#94a3b8;font-size:13px;')
        self.value_label = QLabel(value)
        self.value_label.setStyleSheet('font-size:28px;font-weight:700;color:white;')
        self.subtitle_label = QLabel(subtitle)
        self.subtitle_label.setStyleSheet('color:#9ca3af;font-size:12px;')
        layout.addWidget(dot)
        layout.addWidget(self.title_label)
        layout.addWidget(self.value_label)
        layout.addWidget(self.subtitle_label)
        layout.addStretch()

    def update_value(self, value: str, subtitle: str | None = None):
        self.value_label.setText(str(value))
        if subtitle is not None:
            self.subtitle_label.setText(str(subtitle))


class AccountOverviewCard(QFrame):
    def __init__(self, title: str, subtitle: str = '', active: bool = False):
        super().__init__()
        self.setProperty('variant', 'miniCard')
        self.setStyleSheet(
            "background:#202944;border:1px solid %s;border-radius:12px;" % ('#4f9cff' if active else '#2b3654')
        )
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 14, 16, 14)
        layout.setSpacing(4)
        self.value_label = QLabel('0')
        self.value_label.setStyleSheet("color:%s;font-size:20px;font-weight:800;" % ('#63a5ff' if active else '#ffffff'))
        self.title_label = QLabel(title)
        self.title_label.setStyleSheet('color:#e5e7eb;font-size:13px;font-weight:700;')
        self.subtitle_label = QLabel(subtitle)
        self.subtitle_label.setStyleSheet('color:#98a4c3;font-size:11px;')
        layout.addWidget(self.value_label)
        layout.addWidget(self.title_label)
        if subtitle:
            layout.addWidget(self.subtitle_label)
        layout.addStretch()

    def update_value(self, value: str, subtitle: str | None = None):
        self.value_label.setText(str(value))
        if subtitle is not None:
            self.subtitle_label.setText(str(subtitle))


class SenderStudioV1(QMainWindow):
    def __init__(self):
        super().__init__()
        self.store = StudioStore(str(BASE_DIR))
        self.nav_buttons = []
        self.current_account_id = None
        self.current_text_material_id = None
        self.current_image_material_id = None
        self.current_rule_id = None
        self.account_inspector_visible = False
        self.account_profile_autosave_timer = QTimer(self)
        self.account_profile_autosave_timer.setSingleShot(True)
        self.account_profile_autosave_timer.timeout.connect(self.auto_save_account_profile)
        self.setWindowTitle('TG Sender Studio · v1')
        self.resize(1600, 980)
        self._build_ui()
        self.refresh_all()

    def status_palette(self, status: str):
        mapping = {
            '正常': {'bg': '#052e1c', 'fg': '#22c55e', 'label': 'normal'},
            '受限': {'bg': '#3b2206', 'fg': '#f59e0b', 'label': 'warning'},
            '失效': {'bg': '#3a0f12', 'fg': '#ef4444', 'label': 'danger'},
            '需重新登录': {'bg': '#3a0f12', 'fg': '#ef4444', 'label': 'danger'},
            '检查失败': {'bg': '#3b2206', 'fg': '#f59e0b', 'label': 'warning'},
            '未检查': {'bg': '#162033', 'fg': '#94a3b8', 'label': 'muted'},
        }
        return mapping.get(status, {'bg': '#162033', 'fg': '#94a3b8', 'label': 'muted'})

    def set_status_label_style(self, label: QLabel, status: str):
        palette = self.status_palette(status)
        label.setText(status or '-')
        label.setProperty('status', palette['label'])
        label.setStyleSheet(
            f"background:{palette['bg']}; border:1px solid {palette['fg']}; border-radius:10px; padding:8px 12px;"
        )
        label.style().unpolish(label)
        label.style().polish(label)

    def paint_status_item(self, item: QTableWidgetItem, status: str):
        palette = self.status_palette(status)
        item.setBackground(QBrush(QColor(palette['bg'])))
        item.setForeground(QBrush(QColor(palette['fg'])))

    def _icon_button(self, text: str, handler=None, primary: bool = False, width: int = 42):
        btn = QPushButton(text)
        btn.setFixedSize(width, 42)
        if primary:
            btn.setProperty('role', 'primary')
        else:
            btn.setProperty('role', 'ghost')
            btn.setStyleSheet('padding:0 0; font-size:16px;')
        if handler:
            btn.clicked.connect(handler)
        return btn

    def _table_text_item(self, text: str, align=Qt.AlignLeft | Qt.AlignVCenter, color: str = '#e5e7eb'):
        item = QTableWidgetItem(text)
        item.setTextAlignment(int(align))
        item.setForeground(QBrush(QColor(color)))
        return item

    def _make_table_checkbox(self, checked: bool = True):
        host = QWidget()
        layout = QHBoxLayout(host)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setAlignment(Qt.AlignCenter)
        cb = QCheckBox()
        cb.setProperty('table', 'true')
        cb.setChecked(checked)
        cb.setEnabled(False)
        layout.addWidget(cb)
        return host

    def _make_name_cell(self, display_name: str, username: str, selected: bool = False):
        host = QWidget()
        layout = QHBoxLayout(host)
        layout.setContentsMargins(8, 2, 8, 2)
        layout.setSpacing(10)
        avatar = QLabel((display_name[:1] or 'A').upper())
        avatar.setFixedSize(28, 28)
        avatar.setAlignment(Qt.AlignCenter)
        avatar.setStyleSheet('background:qlineargradient(x1:0,y1:0,x2:1,y2:1, stop:0 #fb7185, stop:1 #8b5cf6);border-radius:14px;color:white;font-size:12px;font-weight:800;')
        layout.addWidget(avatar)
        text_col = QVBoxLayout()
        text_col.setContentsMargins(0, 0, 0, 0)
        text_col.setSpacing(2)
        name_label = QLabel(display_name or '未命名')
        name_label.setStyleSheet(f"color:{'#ffffff' if selected else '#e5e7eb'};font-weight:700;")
        meta_label = QLabel(('@' + username) if username else '无用户名')
        meta_label.setStyleSheet(f"color:{'#cbd5e1' if selected else '#94a3b8'};font-size:12px;")
        text_col.addWidget(name_label)
        text_col.addWidget(meta_label)
        layout.addLayout(text_col)
        layout.addStretch()
        return host

    def _make_status_chip(self, text: str, status: str):
        palette = self.status_palette(status)
        label = QLabel(text)
        label.setAlignment(Qt.AlignCenter)
        label.setStyleSheet(
            f"background:{palette['bg']};border:1px solid {palette['fg']};border-radius:10px;padding:6px 10px;color:{palette['fg']};font-weight:700;"
        )
        return label

    def _make_tag_chip(self, text: str, fg: str = '#cbd5e1', bg: str = '#162033', border: str = '#2b3850'):
        label = QLabel(text)
        label.setAlignment(Qt.AlignCenter)
        label.setStyleSheet(
            f"background:{bg};border:1px solid {border};border-radius:10px;padding:6px 10px;color:{fg};font-weight:700;"
        )
        return label

    def infer_account_region(self, phone: str):
        phone = str(phone or '').strip().replace(' ', '')
        mapping = [
            ('+20', '🇪🇬 EG'),
            ('+1', '🇺🇸 US'),
            ('+44', '🇬🇧 UK'),
            ('+86', '🇨🇳 CN'),
            ('+7', '🇷🇺 RU'),
            ('+81', '🇯🇵 JP'),
            ('+82', '🇰🇷 KR'),
            ('+84', '🇻🇳 VN'),
            ('+66', '🇹🇭 TH'),
            ('+63', '🇵🇭 PH'),
            ('+65', '🇸🇬 SG'),
        ]
        for prefix, label in mapping:
            if phone.startswith(prefix):
                return label
        return '🌐 --'

    def format_account_status_badge(self, status: str):
        mapping = {
            '正常': ('在线', '#14324a', '#38bdf8', '#0ea5e9'),
            '受限': ('冷冻', '#102840', '#38bdf8', '#0ea5e9'),
            '失效': ('失效', '#3a0f12', '#ef4444', '#b91c1c'),
            '需重新登录': ('登录', '#3b2206', '#f59e0b', '#92400e'),
            '检查失败': ('异常', '#3b2206', '#f59e0b', '#92400e'),
            '未检查': ('未测', '#162033', '#94a3b8', '#334155'),
        }
        return mapping.get(status, ('未知', '#162033', '#94a3b8', '#334155'))

    def format_last_used_text(self, last_check_at: str):
        text = str(last_check_at or '').strip()
        if not text:
            return '-'
        try:
            dt = datetime.strptime(text, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return text
        now = datetime.now()
        if dt.date() == now.date():
            return dt.strftime('今天下午 %#I:%M').replace('AM', '上午').replace('PM', '下午')
        return dt.strftime('%m-%d %H:%M')

    def build_account_overview_stats(self, rows):
        status_counter = {}
        enabled_count = 0
        for row in rows:
            status = row.get('status') or '未检查'
            status_counter[status] = status_counter.get(status, 0) + 1
            if row.get('enabled'):
                enabled_count += 1
        abnormal = sum(count for key, count in status_counter.items() if key not in ('正常', '未检查'))
        return {
            'all': len(rows),
            'work': enabled_count,
            'spam': 0,
            'unlimited': max(status_counter.get('正常', 0) - abnormal, 0),
            'frozen': status_counter.get('受限', 0),
            'member': 0,
            'no2fa': 0,
            'unlimited_ok': status_counter.get('正常', 0),
            'spam_ok': 0,
            'unlimited_fail': status_counter.get('检查失败', 0),
            'spam_fail': 0,
            'untested': status_counter.get('未检查', 0),
            'years_1_2': 0,
            'years_3_plus': 0,
            'years_10_ok': 0,
        }

    def refresh_account_overview_cards(self, rows):
        stats = self.build_account_overview_stats(rows)
        for key, value in stats.items():
            card = self.account_overview_cards.get(key)
            if card:
                card.update_value(value)

    def format_relative_check_time(self, last_check_at: str):
        text = str(last_check_at or '').strip()
        if not text:
            return '-'
        try:
            dt = datetime.strptime(text, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return text
        delta = datetime.now() - dt
        minutes = max(int(delta.total_seconds() // 60), 0)
        if minutes < 1:
            return '刚刚'
        if minutes < 60:
            return f'{minutes} 分钟前'
        hours = minutes // 60
        if hours < 24:
            return f'{hours} 小时前'
        days = hours // 24
        return f'{days} 天前'

    def _apply_accounts_table_row_styles(self):
        selected_rows = {index.row() for index in self.accounts_table.selectionModel().selectedRows()}
        for row in range(self.accounts_table.rowCount()):
            row_selected = row in selected_rows
            bg = QColor('#2c3854' if row_selected else ('#182235' if row % 2 else '#141c2f'))
            fg = QColor('#ffffff' if row_selected else '#e5e7eb')
            for col in range(self.accounts_table.columnCount()):
                item = self.accounts_table.item(row, col)
                if item:
                    item.setBackground(QBrush(bg))
                    if col != 4:
                        item.setForeground(QBrush(fg))
            name_widget = self.accounts_table.cellWidget(row, 8)
            if name_widget and name_widget.layout() and name_widget.layout().count() >= 2:
                text_col = name_widget.layout().itemAt(1).layout()
                if text_col:
                    text_col.itemAt(0).widget().setStyleSheet(f"color:{'#ffffff' if row_selected else '#e5e7eb'};font-weight:700;")
                    text_col.itemAt(1).widget().setStyleSheet(f"color:{'#cbd5e1' if row_selected else '#94a3b8'};font-size:12px;")
            for col in [4, 8]:
                widget = self.accounts_table.cellWidget(row, col)
                if widget:
                    widget.setStyleSheet(widget.styleSheet() + (";opacity:1;" if row_selected else ''))

    def toggle_account_inspector(self):
        self.account_inspector_visible = not self.account_inspector_visible
        self.account_detail_card.setVisible(self.account_inspector_visible)
        self.account_detail_toggle_btn.setText('详情' if not self.account_inspector_visible else '收起')

    def format_check_summary(self, results):
        summary = {key: 0 for key in STATUS_OPTIONS}
        for row in results:
            if not row:
                continue
            status = row.get('status') or '未检查'
            summary[status] = summary.get(status, 0) + 1
        parts = [f"{key} {value} 个" for key, value in summary.items() if value]
        return '，'.join(parts) if parts else '没有可汇总结果'

    def show_check_results_dialog(self, scope_text: str, results, canceled: bool = False):
        dialog = QDialog(self)
        dialog.setWindowTitle('检查结果汇总')
        dialog.resize(680, 520)
        layout = QVBoxLayout(dialog)
        title = QLabel('账号检查已完成' + ('（已中断）' if canceled else ''))
        title.setStyleSheet('font-size:22px;font-weight:800;color:white;')
        layout.addWidget(title)
        subtitle = QLabel(f'{scope_text} · 共返回 {len(results)} 条结果')
        subtitle.setStyleSheet('color:#94a3b8;font-size:13px;')
        layout.addWidget(subtitle)

        chips = QHBoxLayout()
        summary = {key: 0 for key in STATUS_OPTIONS}
        for row in results:
            status = (row or {}).get('status') or '未检查'
            summary[status] = summary.get(status, 0) + 1
        for key, count in summary.items():
            if not count:
                continue
            palette = self.status_palette(key)
            chip = QLabel(f'{key} {count}')
            chip.setStyleSheet(
                f"background:{palette['bg']};border:1px solid {palette['fg']};border-radius:12px;padding:8px 12px;color:{palette['fg']};font-weight:700;"
            )
            chips.addWidget(chip)
        chips.addStretch()
        layout.addLayout(chips)

        detail_list = QListWidget()
        for row in results:
            if not row:
                continue
            palette = self.status_palette(row.get('status') or '未检查')
            detail = f"{row.get('display_name', '-') }  ·  {row.get('status', '-') }\n{row.get('last_check_result', '-') }"
            item = QListWidgetItem(detail)
            item.setForeground(QBrush(QColor(palette['fg'])))
            detail_list.addItem(item)
        layout.addWidget(detail_list, 1)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok)
        buttons.accepted.connect(dialog.accept)
        layout.addWidget(buttons)
        dialog.exec()

    def _build_ui(self):
        root = QWidget()
        self.setCentralWidget(root)
        shell = QHBoxLayout(root)
        shell.setContentsMargins(0, 0, 0, 0)
        shell.setSpacing(0)

        shell.addWidget(self._build_sidebar())

        content_wrap = QVBoxLayout()
        content_wrap.setContentsMargins(0, 0, 0, 0)
        content_wrap.setSpacing(0)
        content_wrap.addWidget(self._build_topbar())

        self.stack = QStackedWidget()
        self.dashboard_page = self._wrap_page(self._build_dashboard_page())
        self.accounts_page = self._wrap_page(self._build_accounts_page())
        self.materials_page = self._wrap_page(self._build_materials_page())
        self.rules_page = self._wrap_page(self._build_rules_page())
        self.preview_page = self._wrap_page(self._build_preview_page())
        self.logs_page = self._wrap_page(self._build_logs_page())
        self.settings_page = self._wrap_page(self._build_settings_page())
        for page in [self.dashboard_page, self.accounts_page, self.materials_page, self.rules_page, self.preview_page, self.logs_page, self.settings_page]:
            self.stack.addWidget(page)
        content_wrap.addWidget(self.stack)

        content = QWidget()
        content.setLayout(content_wrap)
        shell.addWidget(content, 1)
        self._set_page(0)

    def _build_sidebar(self):
        frame = QFrame()
        frame.setObjectName('Sidebar')
        frame.setFixedWidth(280)
        layout = QVBoxLayout(frame)
        layout.setContentsMargins(18, 20, 18, 20)
        layout.setSpacing(12)

        brand = QFrame()
        brand.setObjectName('AccentCard')
        brand_layout = QVBoxLayout(brand)
        brand_layout.setContentsMargins(18, 18, 18, 18)
        title = QLabel('Sender Studio')
        title.setStyleSheet('font-size:22px;font-weight:800;color:white;')
        subtitle = QLabel('v1 本地可用版\n账号 / 素材 / 规则 / 预览')
        subtitle.setStyleSheet('color:rgba(255,255,255,0.85);font-size:13px;line-height:1.7;')
        brand_layout.addWidget(title)
        brand_layout.addWidget(subtitle)
        layout.addWidget(brand)

        for idx, text in enumerate(['总览', '账号管理', '素材配置', '定时规则', '任务预览', '日志中心', '设置']):
            btn = QToolButton()
            btn.setProperty('nav', True)
            btn.setText(text)
            btn.setMinimumHeight(46)
            btn.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
            btn.clicked.connect(lambda checked=False, i=idx: self._set_page(i))
            layout.addWidget(btn)
            self.nav_buttons.append(btn)

        layout.addStretch()
        footer = QLabel('这版已经接本地 SQLite。\n先把“管理层”做顺，\n后面再看是否扩展。')
        footer.setStyleSheet('color:#94a3b8;line-height:1.7;padding:8px 4px;')
        layout.addWidget(footer)
        return frame

    def _build_topbar(self):
        bar = QFrame()
        bar.setObjectName('TopBar')
        bar.setFixedHeight(82)
        layout = QHBoxLayout(bar)
        layout.setContentsMargins(26, 16, 26, 16)
        layout.setSpacing(16)
        title_wrap = QVBoxLayout()
        title = QLabel('TG Sender Studio')
        title.setStyleSheet('font-size:24px;font-weight:800;color:white;')
        subtitle = QLabel('第一版本地软件：导入账号、配置素材、保存规则、生成预览')
        subtitle.setStyleSheet('color:#94a3b8;font-size:13px;')
        title_wrap.addWidget(title)
        title_wrap.addWidget(subtitle)
        layout.addLayout(title_wrap)
        layout.addStretch()
        self.top_search = QLineEdit()
        self.top_search.setPlaceholderText('输入关键词后回车，可在账号页里筛选')
        self.top_search.setFixedWidth(360)
        self.top_search.returnPressed.connect(self.apply_account_filter_from_top)
        layout.addWidget(self.top_search)
        refresh_btn = QPushButton('全部刷新')
        refresh_btn.setProperty('role', 'primary')
        refresh_btn.clicked.connect(self.refresh_all)
        layout.addWidget(refresh_btn)
        return bar

    def _wrap_page(self, widget):
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        container = QWidget()
        lay = QVBoxLayout(container)
        lay.setContentsMargins(24, 24, 24, 24)
        lay.addWidget(widget)
        lay.addStretch()
        scroll.setWidget(container)
        return scroll

    def _build_dashboard_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(20)

        hero = QFrame()
        hero.setObjectName('AccentCard')
        hero_layout = QHBoxLayout(hero)
        hero_layout.setContentsMargins(24, 24, 24, 24)
        left = QVBoxLayout()
        title = QLabel('本地管理版 v1')
        title.setStyleSheet('font-size:30px;font-weight:800;color:white;')
        summary = QLabel('这版已经不是纯原型了。\n你现在可以导入 session、保存素材和规则、生成任务预览。')
        summary.setStyleSheet('font-size:14px;color:rgba(255,255,255,0.9);line-height:1.7;')
        left.addWidget(title)
        left.addWidget(summary)
        buttons = QHBoxLayout()
        for text, idx in [('导入账号', 1), ('配置素材', 2), ('生成预览', 4)]:
            btn = QPushButton(text)
            btn.setProperty('role', 'primary' if text == '导入账号' else 'ghost')
            btn.clicked.connect(lambda checked=False, i=idx: self._set_page(i))
            buttons.addWidget(btn)
        buttons.addStretch()
        left.addSpacing(10)
        left.addLayout(buttons)
        hero_layout.addLayout(left, 1)

        right = Panel('当前进度', '先把本地管理链路做通')
        for line in ['✓ SQLite 数据层', '✓ Session 导入', '✓ 文案 / 图片管理', '✓ 规则保存', '✓ 任务预览生成']:
            item = QLabel(line)
            item.setStyleSheet('color:white;font-size:14px;')
            right.body.addWidget(item)
        hero_layout.addWidget(right, 0)
        layout.addWidget(hero)

        metrics_layout = QGridLayout()
        metrics_layout.setSpacing(16)
        self.metric_accounts = MetricCard('账号总数', '0', '已导入 session', '#22c55e')
        self.metric_rules = MetricCard('启用规则', '0', '可生成计划', '#38bdf8')
        self.metric_materials = MetricCard('启用素材', '0', '文案 + 图片', '#f59e0b')
        self.metric_abnormal = MetricCard('异常账号', '0', '需要关注', '#ef4444')
        for i, widget in enumerate([self.metric_accounts, self.metric_rules, self.metric_materials, self.metric_abnormal]):
            metrics_layout.addWidget(widget, 0, i)
        layout.addLayout(metrics_layout)

        lower = QSplitter(Qt.Horizontal)
        self.dashboard_recent = Panel('近期动作', '最近 6 条日志')
        self.dashboard_recent_list = QListWidget()
        self.dashboard_recent.body.addWidget(self.dashboard_recent_list)
        lower.addWidget(self.dashboard_recent)

        guide = Panel('推荐流程', '按照这条链路去用，最顺')
        for step in ['1. 导入 Session', '2. 补账号备注 / 目标群', '3. 添加文案和图片', '4. 配规则', '5. 生成任务预览']:
            label = QLabel(step)
            label.setStyleSheet('color:white; font-size:14px;')
            guide.body.addWidget(label)
        lower.addWidget(guide)
        lower.setSizes([900, 500])
        layout.addWidget(lower)
        return page

    def _build_accounts_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(14)

        overview_wrap = QFrame()
        overview_wrap.setProperty('variant', 'toolbar')
        overview_layout = QGridLayout(overview_wrap)
        overview_layout.setContentsMargins(0, 0, 0, 0)
        overview_layout.setHorizontalSpacing(14)
        overview_layout.setVerticalSpacing(14)
        self.account_overview_cards = {}
        overview_specs = [
            ('all', 'Все аккаунты', '全部账号', False),
            ('work', 'Для работы', '工作', False),
            ('spam', '垃圾邮件', '垃圾邮件', False),
            ('unlimited', '无限制', '无限制', False),
            ('frozen', '冻结', '冻结', True),
            ('member', '会员', '会员', False),
            ('no2fa', '无2FA', '无2FA', False),
            ('unlimited_ok', '无限制成功', '无限制成功', False),
            ('spam_ok', '垃圾邮件成功', '垃圾邮件成功', False),
            ('unlimited_fail', '无限制失败', '无限制失败', False),
            ('spam_fail', '垃圾邮件失败', '垃圾邮件失败', False),
            ('untested', '未测试', '未测试', False),
            ('years_1_2', '1-2年', '1-2年 无限制', False),
            ('years_3_plus', '3年以上', '3年以上 无限制', False),
            ('years_10_ok', '10年', '10年无限制成功', False),
        ]
        for idx, (key, title, subtitle, active) in enumerate(overview_specs):
            card = AccountOverviewCard(title, subtitle, active=active)
            self.account_overview_cards[key] = card
            overview_layout.addWidget(card, idx // 6, idx % 6)
        layout.addWidget(overview_wrap)

        action_bar = QFrame()
        action_bar.setProperty('variant', 'toolbar')
        action_layout = QHBoxLayout(action_bar)
        action_layout.setContentsMargins(14, 12, 14, 12)
        action_layout.setSpacing(8)
        self.btn_import_session = self._icon_button('+', self.import_sessions)
        self.btn_new_account = self._icon_button('⌂', self.new_account)
        self.btn_refresh_accounts = self._icon_button('⟳', self.refresh_accounts)
        self.btn_check_account = self._icon_button('✓', self.check_selected_accounts)
        self.btn_check_all_accounts = self._icon_button('✔', self.check_all_accounts)
        for btn in [self.btn_import_session, self.btn_new_account, self.btn_refresh_accounts, self.btn_check_account, self.btn_check_all_accounts]:
            action_layout.addWidget(btn)
        action_layout.addStretch()
        self.account_visible_count_label = QLabel('显示账户：0 / 0')
        self.account_visible_count_label.setStyleSheet('color:#cbd5e1;font-size:13px;font-weight:600;padding-right:8px;')
        action_layout.addWidget(self.account_visible_count_label)
        layout.addWidget(action_bar)

        filter_bar = QFrame()
        filter_bar.setProperty('variant', 'toolbar')
        filter_layout = QHBoxLayout(filter_bar)
        filter_layout.setContentsMargins(14, 12, 14, 12)
        filter_layout.setSpacing(10)
        self.btn_delete_account = self._icon_button('🗑', self.delete_selected_accounts, width=44)
        self.btn_delete_account.setStyleSheet('background:#1a2033;border:1px solid #a74a63;border-radius:12px;color:#ff6b8b;font-size:16px;')
        filter_layout.addWidget(self.btn_delete_account)

        self.account_role_filter = QComboBox()
        self.account_role_filter.addItems(['角色', '全部'])
        self.account_geo_filter = QComboBox()
        self.account_geo_filter.addItems(['地理', 'EG', 'US', 'CN'])
        self.account_geo_filter.currentIndexChanged.connect(self.refresh_accounts)

        self.account_group_filter = QComboBox()
        self.account_group_filter.addItems(['休息处', '已选群组>0', '未选群组'])
        self.account_group_filter.currentIndexChanged.connect(self.refresh_accounts)

        self.account_status_filter = QComboBox()
        self.account_status_filter.addItems(['限制：冷冻'] + STATUS_OPTIONS)
        self.account_status_filter.currentIndexChanged.connect(self.refresh_accounts)

        self.account_enabled_filter = QComboBox()
        self.account_enabled_filter.addItems(['文件夹', '已启用', '已停用'])
        self.account_enabled_filter.currentIndexChanged.connect(self.refresh_accounts)

        self.account_more_filter = QPushButton('...')
        self.account_more_filter.setFixedHeight(40)

        for widget in [self.account_role_filter, self.account_geo_filter, self.account_group_filter, self.account_status_filter, self.account_enabled_filter, self.account_more_filter]:
            widget.setFixedHeight(40)
            filter_layout.addWidget(widget)

        filter_layout.addStretch()
        self.account_search = QLineEdit()
        self.account_search.setPlaceholderText('搜索...')
        self.account_search.setFixedWidth(300)
        self.account_search.setFixedHeight(40)
        self.account_search.returnPressed.connect(self.refresh_accounts)
        filter_layout.addWidget(self.account_search)
        layout.addWidget(filter_bar)

        self.account_check_summary_label = QLabel('状态摘要会显示在这里')
        self.account_check_summary_label.setStyleSheet('color:#93a1c4;padding:0 2px 2px 4px;font-size:12px;')
        layout.addWidget(self.account_check_summary_label)

        table_card = QFrame()
        table_card.setObjectName('Card')
        table_layout = QVBoxLayout(table_card)
        table_layout.setContentsMargins(0, 0, 0, 0)
        table_layout.setSpacing(0)
        self.accounts_table = self._create_table(['', '#', '电话', '地理', '地位', '休息处', '角色', '用过的', '姓名', '各种各样的'])
        self.accounts_table.setSelectionMode(QTableWidget.ExtendedSelection)
        self.accounts_table.itemSelectionChanged.connect(self.on_account_selection_changed)
        self.accounts_table.cellClicked.connect(lambda row, _col: self.on_account_row_clicked(row))
        self.accounts_table.setSortingEnabled(False)
        table_layout.addWidget(self.accounts_table)
        self.account_table_empty_label = QLabel('还没有账号，先点左上角 + 导入。')
        self.account_table_empty_label.setAlignment(Qt.AlignCenter)
        self.account_table_empty_label.setProperty('dim', 'true')
        self.account_table_empty_label.setMinimumHeight(72)
        table_layout.addWidget(self.account_table_empty_label)
        layout.addWidget(table_card, 1)

        bottom_bar = QFrame()
        bottom_bar.setProperty('variant', 'statusbar')
        bottom_layout = QHBoxLayout(bottom_bar)
        bottom_layout.setContentsMargins(16, 12, 16, 12)
        self.account_bottom_status_label = QLabel('专用账号：0 / 0')
        self.account_bottom_status_label.setStyleSheet('font-size:15px;font-weight:700;color:white;')
        bottom_layout.addWidget(self.account_bottom_status_label)
        self.account_footer_hint_label = QLabel('未选择账号')
        self.account_footer_hint_label.setProperty('dim', 'true')
        bottom_layout.addWidget(self.account_footer_hint_label)
        bottom_layout.addStretch()
        self.btn_footer_check = self._icon_button('⟳', self.check_current_account)
        self.btn_footer_materials = self._icon_button('⌁', lambda: self.jump_to_materials(self.current_account_id))
        self.btn_footer_rules = self._icon_button('⇄', lambda: self.jump_to_rules(self.current_account_id))
        self.account_detail_toggle_btn = QPushButton('详情')
        self.account_detail_toggle_btn.clicked.connect(self.toggle_account_inspector)
        self.btn_footer_save = QPushButton('行动')
        self.btn_footer_save.setProperty('role', 'primary')
        self.btn_footer_save.clicked.connect(self.save_current_account)
        for btn in [self.account_detail_toggle_btn, self.btn_footer_check, self.btn_footer_materials, self.btn_footer_rules, self.btn_footer_save]:
            bottom_layout.addWidget(btn)
        layout.addWidget(bottom_bar)

        detail_card = QFrame()
        detail_card.setProperty('variant', 'inspector')
        detail_layout = QVBoxLayout(detail_card)
        detail_layout.setContentsMargins(16, 16, 16, 16)
        detail_layout.setSpacing(14)

        hero_row = QHBoxLayout()
        self.account_avatar_label = QLabel('A')
        self.account_avatar_label.setFixedSize(48, 48)
        self.account_avatar_label.setAlignment(Qt.AlignCenter)
        self.account_avatar_label.setStyleSheet('background:#334155;border-radius:24px;color:white;font-size:20px;font-weight:800;')
        hero_row.addWidget(self.account_avatar_label)
        hero_text = QVBoxLayout()
        self.account_detail_name_label = QLabel('未选择账号')
        self.account_detail_name_label.setStyleSheet('font-size:18px;font-weight:800;color:white;')
        self.account_detail_meta_label = QLabel('点击左侧表格任意一行后，这里显示账号名称、手机号、用户名和状态。')
        self.account_detail_meta_label.setProperty('dim', 'true')
        hero_text.addWidget(self.account_detail_name_label)
        hero_text.addWidget(self.account_detail_meta_label)
        hero_row.addLayout(hero_text, 1)
        self.account_status_badge = QLabel('未检查')
        hero_row.addWidget(self.account_status_badge, 0, Qt.AlignRight)
        detail_layout.addLayout(hero_row)

        quick_stats_row = QHBoxLayout()
        self.account_quick_phone_chip = QLabel('电话：-'); self.account_quick_phone_chip.setProperty('chip', 'true')
        self.account_quick_user_chip = QLabel('用户名：-'); self.account_quick_user_chip.setProperty('chip', 'true')
        self.account_quick_group_chip = QLabel('群组：0'); self.account_quick_group_chip.setProperty('chip', 'true')
        for chip in [self.account_quick_phone_chip, self.account_quick_user_chip, self.account_quick_group_chip]:
            quick_stats_row.addWidget(chip)
        quick_stats_row.addStretch()
        detail_layout.addLayout(quick_stats_row)

        fields_row = QHBoxLayout()
        fields_row.setSpacing(14)

        identity_card = QFrame(); identity_card.setProperty('variant', 'toolbar')
        identity_layout = QVBoxLayout(identity_card)
        identity_layout.setContentsMargins(16, 16, 16, 16)
        identity_title = QLabel('基础信息')
        identity_title.setStyleSheet('font-size:16px;font-weight:700;color:white;')
        identity_layout.addWidget(identity_title)
        form = QFormLayout()
        self.account_id_label = QLabel('-')
        self.account_name_edit = QLineEdit(); self.account_name_edit.editingFinished.connect(self.auto_save_account_profile)
        self.account_bio_edit = QTextEdit(); self.account_bio_edit.setMinimumHeight(90); self.account_bio_edit.setPlaceholderText('暂无简介'); self.account_bio_edit.textChanged.connect(self.schedule_account_profile_autosave)
        self.account_phone_edit = QLineEdit(); self.account_phone_edit.editingFinished.connect(self.schedule_account_profile_autosave)
        self.account_username_edit = QLineEdit(); self.account_username_edit.editingFinished.connect(self.schedule_account_profile_autosave)
        self.account_session_label = QLabel('-')
        self.account_enabled_check = QCheckBox('启用这个账号'); self.account_enabled_check.setChecked(True); self.account_enabled_check.stateChanged.connect(self.schedule_account_profile_autosave)
        form.addRow('账号 ID', self.account_id_label)
        form.addRow('账号名称', self.account_name_edit)
        form.addRow('简介', self.account_bio_edit)
        form.addRow('手机号', self.account_phone_edit)
        form.addRow('用户名', self.account_username_edit)
        form.addRow('Session', self.account_session_label)
        form.addRow('', self.account_enabled_check)
        identity_layout.addLayout(form)
        fields_row.addWidget(identity_card, 3)

        status_card = QFrame(); status_card.setProperty('variant', 'toolbar')
        status_layout = QVBoxLayout(status_card)
        status_layout.setContentsMargins(16, 16, 16, 16)
        status_title = QLabel('检查状态')
        status_title.setStyleSheet('font-size:16px;font-weight:700;color:white;')
        status_layout.addWidget(status_title)
        self.account_status_combo = QComboBox(); self.account_status_combo.addItems(STATUS_OPTIONS)
        self.account_status_combo.currentTextChanged.connect(lambda text: self.set_status_label_style(self.account_status_badge, text))
        self.account_status_combo.currentTextChanged.connect(lambda _text: self.schedule_account_profile_autosave())
        status_layout.addWidget(self.account_status_combo)
        self.account_last_check = QLabel('-'); self.account_last_check.setProperty('chip', 'true')
        self.account_last_result = QLabel('暂无检查结果'); self.account_last_result.setWordWrap(True)
        self.account_last_error = QLabel('暂无错误信息'); self.account_last_error.setWordWrap(True)
        status_layout.addWidget(QLabel('最近检查'))
        status_layout.addWidget(self.account_last_check)
        status_layout.addWidget(QLabel('最近结果'))
        status_layout.addWidget(self.account_last_result)
        status_layout.addWidget(QLabel('最近错误'))
        status_layout.addWidget(self.account_last_error)
        self.set_status_label_style(self.account_status_badge, '未检查')
        fields_row.addWidget(status_card, 2)
        detail_layout.addLayout(fields_row)

        groups_card = QFrame(); groups_card.setProperty('variant', 'toolbar')
        groups_layout = QVBoxLayout(groups_card)
        groups_layout.setContentsMargins(16, 16, 16, 16)
        groups_title_row = QHBoxLayout()
        groups_title = QLabel('账号已加入的群（可多选）')
        groups_title.setStyleSheet('font-size:16px;font-weight:700;color:white;')
        groups_title_row.addWidget(groups_title)
        groups_title_row.addStretch()
        self.account_selected_groups_label = QLabel('已选群：0')
        self.account_selected_groups_label.setProperty('chip', 'true')
        groups_title_row.addWidget(self.account_selected_groups_label)
        groups_layout.addLayout(groups_title_row)
        self.account_groups_search = QLineEdit(); self.account_groups_search.setPlaceholderText('搜索群名 / 用户名'); self.account_groups_search.textChanged.connect(self.filter_account_groups)
        groups_layout.addWidget(self.account_groups_search)
        self.account_groups_list = QListWidget(); self.account_groups_list.itemChanged.connect(lambda item: self.schedule_account_profile_autosave())
        groups_layout.addWidget(self.account_groups_list)
        detail_layout.addWidget(groups_card)

        hint = QLabel('检查的是 session 可用性与授权状态。')
        hint.setProperty('soft', 'true')
        detail_layout.addWidget(hint)
        detail_card.setVisible(False)
        self.account_detail_card = detail_card
        layout.addWidget(detail_card)
        return page

    def _build_materials_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(18)

        top = Panel('素材配置', '每个账号独立维护文案和图片')
        row = QHBoxLayout()
        self.material_account_combo = QComboBox()
        self.material_account_combo.currentIndexChanged.connect(self.on_material_account_changed)
        row.addWidget(QLabel('当前账号'))
        row.addWidget(self.material_account_combo)
        row.addStretch()
        top.body.addLayout(row)
        layout.addWidget(top)

        split = QSplitter(Qt.Horizontal)
        text_panel = Panel('文案池', '左边选文案，右边编辑')
        text_top = QHBoxLayout()
        add_text = QPushButton('新增文案'); add_text.setProperty('role', 'primary'); add_text.clicked.connect(self.new_text_material)
        delete_text = QPushButton('删除文案'); delete_text.clicked.connect(self.delete_current_text_material)
        text_top.addWidget(add_text); text_top.addWidget(delete_text); text_top.addStretch()
        text_panel.body.addLayout(text_top)
        self.text_materials_list = QListWidget()
        self.text_materials_list.currentItemChanged.connect(self.on_text_material_selected)
        text_panel.body.addWidget(self.text_materials_list)
        text_form = QFormLayout()
        self.text_title_edit = QLineEdit()
        self.text_content_edit = QTextEdit(); self.text_content_edit.setMinimumHeight(180)
        self.text_enabled_check = QCheckBox('启用这条文案'); self.text_enabled_check.setChecked(True)
        text_form.addRow('标题', self.text_title_edit)
        text_form.addRow('文案内容', self.text_content_edit)
        text_panel.body.addLayout(text_form)
        text_panel.body.addWidget(self.text_enabled_check)
        save_text = QPushButton('保存文案'); save_text.setProperty('role', 'primary'); save_text.clicked.connect(self.save_text_material)
        text_panel.body.addWidget(save_text, 0, Qt.AlignLeft)
        split.addWidget(text_panel)

        image_panel = Panel('图片池', '支持图片路径和 caption')
        image_top = QHBoxLayout()
        add_image = QPushButton('上传图片'); add_image.setProperty('role', 'primary'); add_image.clicked.connect(self.upload_image_material)
        delete_image = QPushButton('删除图片'); delete_image.clicked.connect(self.delete_current_image_material)
        image_top.addWidget(add_image); image_top.addWidget(delete_image); image_top.addStretch()
        image_panel.body.addLayout(image_top)
        self.image_materials_list = QListWidget()
        self.image_materials_list.currentItemChanged.connect(self.on_image_material_selected)
        image_panel.body.addWidget(self.image_materials_list)
        img_form = QFormLayout()
        self.image_title_edit = QLineEdit()
        self.image_path_edit = QLineEdit()
        self.image_caption_edit = QTextEdit(); self.image_caption_edit.setMinimumHeight(120)
        self.image_enabled_check = QCheckBox('启用这张图片'); self.image_enabled_check.setChecked(True)
        img_form.addRow('标题', self.image_title_edit)
        img_form.addRow('图片路径', self.image_path_edit)
        img_form.addRow('Caption', self.image_caption_edit)
        image_panel.body.addLayout(img_form)
        image_panel.body.addWidget(self.image_enabled_check)
        save_image = QPushButton('保存图片素材'); save_image.setProperty('role', 'primary'); save_image.clicked.connect(self.save_image_material)
        image_panel.body.addWidget(save_image, 0, Qt.AlignLeft)
        split.addWidget(image_panel)
        split.setSizes([760, 760])
        layout.addWidget(split)
        return page

    def _build_rules_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(18)
        header = Panel('定时规则', '把账号、群、时间、条数和素材策略合到一起')
        toolbar = QHBoxLayout()
        new_rule = QPushButton('新增规则'); new_rule.setProperty('role', 'primary'); new_rule.clicked.connect(self.new_rule)
        delete_rule = QPushButton('删除规则'); delete_rule.clicked.connect(self.delete_current_rule)
        generate = QPushButton('生成预览'); generate.clicked.connect(self.generate_preview)
        toolbar.addWidget(new_rule); toolbar.addWidget(delete_rule); toolbar.addWidget(generate); toolbar.addStretch()
        header.body.addLayout(toolbar)
        layout.addWidget(header)

        split = QSplitter(Qt.Horizontal)
        table_panel = Panel('规则列表')
        self.rules_table = self._create_table(['ID', '规则名', '账号', '目标群', '时间范围', '间隔', '条数', '状态'])
        self.rules_table.cellClicked.connect(self.on_rule_row_clicked)
        table_panel.body.addWidget(self.rules_table)
        split.addWidget(table_panel)

        editor = Panel('规则编辑')
        form = QFormLayout()
        self.rule_id_label = QLabel('-')
        self.rule_name_edit = QLineEdit()
        self.rule_account_combo = QComboBox(); self.rule_account_combo.currentIndexChanged.connect(self.refresh_rule_image_choices)
        self.rule_target_edit = QLineEdit()
        self.rule_start_edit = QLineEdit('09:00')
        self.rule_end_edit = QLineEdit('21:00')
        self.rule_interval_edit = QLineEdit('10')
        self.rule_daily_limit_edit = QLineEdit('30')
        self.rule_text_mode_combo = QComboBox(); self.rule_text_mode_combo.addItems(['顺序轮播', '随机抽取'])
        self.rule_image_mode_combo = QComboBox(); self.rule_image_mode_combo.addItems(['不带图', '固定图片', '随机图片'])
        self.rule_fixed_image_combo = QComboBox(); self.rule_fixed_image_combo.addItem('不指定', None)
        self.rule_enabled_check = QCheckBox('启用这条规则'); self.rule_enabled_check.setChecked(True)
        form.addRow('规则ID', self.rule_id_label)
        form.addRow('规则名', self.rule_name_edit)
        form.addRow('账号', self.rule_account_combo)
        form.addRow('目标群 / 频道', self.rule_target_edit)
        form.addRow('开始时间', self.rule_start_edit)
        form.addRow('结束时间', self.rule_end_edit)
        form.addRow('间隔分钟', self.rule_interval_edit)
        form.addRow('每天条数', self.rule_daily_limit_edit)
        form.addRow('文案模式', self.rule_text_mode_combo)
        form.addRow('图片模式', self.rule_image_mode_combo)
        form.addRow('固定图片', self.rule_fixed_image_combo)
        editor.body.addLayout(form)
        editor.body.addWidget(self.rule_enabled_check)
        btns = QHBoxLayout()
        save = QPushButton('保存规则'); save.setProperty('role', 'primary'); save.clicked.connect(self.save_rule)
        btns.addWidget(save)
        btns.addWidget(QPushButton('清空表单', clicked=self.clear_rule_form))
        btns.addStretch()
        editor.body.addLayout(btns)
        split.addWidget(editor)
        split.setSizes([960, 520])
        layout.addWidget(split)
        return page

    def _build_preview_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(18)
        panel = Panel('任务预览', '先生成计划任务，确认布局与内容，再决定下一步')
        row = QHBoxLayout()
        self.preview_date_combo = QComboBox(); self.preview_date_combo.addItems(['今天', '明天'])
        self.preview_account_combo = QComboBox(); self.preview_account_combo.addItem('全部账号', 0)
        self.preview_account_combo.currentIndexChanged.connect(self.refresh_preview)
        generate = QPushButton('生成预览'); generate.setProperty('role', 'primary'); generate.clicked.connect(self.generate_preview)
        clear = QPushButton('清空预览'); clear.clicked.connect(self.clear_preview)
        row.addWidget(QLabel('日期')); row.addWidget(self.preview_date_combo)
        row.addWidget(QLabel('账号')); row.addWidget(self.preview_account_combo)
        row.addStretch(); row.addWidget(generate); row.addWidget(clear)
        panel.body.addLayout(row)
        self.preview_table = self._create_table(['时间', '账号', '目标群', '文案摘要', '图片', '状态'])
        panel.body.addWidget(self.preview_table)
        layout.addWidget(panel)
        return page

    def _build_logs_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        panel = Panel('日志中心', '导入、保存、生成等本地动作都会记在这里')
        top = QHBoxLayout()
        refresh = QPushButton('刷新日志'); refresh.setProperty('role', 'primary'); refresh.clicked.connect(self.refresh_logs)
        top.addWidget(refresh); top.addStretch()
        panel.body.addLayout(top)
        self.logs_table = self._create_table(['时间', '账号', '动作', '结果', '详情'])
        panel.body.addWidget(self.logs_table)
        layout.addWidget(panel)
        return page

    def _build_settings_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        panel = Panel('设置', '先保留本地目录和主题位')
        form = QFormLayout()
        self.setting_data_dir = QLineEdit()
        self.setting_sessions_dir = QLineEdit()
        self.setting_images_dir = QLineEdit()
        self.setting_logs_dir = QLineEdit()
        self.setting_api_id = QLineEdit()
        self.setting_api_hash = QLineEdit()
        self.setting_theme_combo = QComboBox(); self.setting_theme_combo.addItems(['深色 · 默认', '浅色 · 后续'])
        self.setting_density_combo = QComboBox(); self.setting_density_combo.addItems(['舒适', '紧凑'])
        form.addRow('数据目录', self.setting_data_dir)
        form.addRow('Session 目录', self.setting_sessions_dir)
        form.addRow('图片目录', self.setting_images_dir)
        form.addRow('日志目录', self.setting_logs_dir)
        form.addRow('API ID', self.setting_api_id)
        form.addRow('API HASH', self.setting_api_hash)
        form.addRow('主题', self.setting_theme_combo)
        form.addRow('显示密度', self.setting_density_combo)
        panel.body.addLayout(form)
        save = QPushButton('保存设置'); save.setProperty('role', 'primary'); save.clicked.connect(self.save_settings)
        panel.body.addWidget(save, 0, Qt.AlignLeft)
        layout.addWidget(panel)
        return page

    def _create_table(self, headers):
        table = QTableWidget(0, len(headers))
        table.setHorizontalHeaderLabels(headers)
        table.horizontalHeader().setVisible(True)
        table.verticalHeader().setVisible(False)
        table.setSelectionBehavior(QTableWidget.SelectRows)
        table.setSelectionMode(QTableWidget.ExtendedSelection)
        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.setShowGrid(False)
        table.setAlternatingRowColors(True)
        table.horizontalHeader().setStretchLastSection(False)
        table.horizontalHeader().setDefaultSectionSize(96)
        table.horizontalHeader().setSectionResizeMode(QHeaderView.Interactive)
        table.horizontalHeader().setDefaultAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        table.setMinimumHeight(320)
        table.setFocusPolicy(Qt.StrongFocus)
        if len(headers) >= 10:
            table.setColumnWidth(0, 42)
            table.setColumnWidth(1, 46)
            table.setColumnWidth(2, 160)
            table.setColumnWidth(3, 86)
            table.setColumnWidth(4, 92)
            table.setColumnWidth(5, 104)
            table.setColumnWidth(6, 70)
            table.setColumnWidth(7, 132)
            table.setColumnWidth(8, 220)
            table.setColumnWidth(9, 140)
        else:
            table.setColumnWidth(0, 42)
            table.setColumnWidth(1, 52)
        return table

    def _set_page(self, index: int):
        self.stack.setCurrentIndex(index)
        for idx, btn in enumerate(self.nav_buttons):
            btn.setProperty('active', idx == index)
            btn.style().unpolish(btn)
            btn.style().polish(btn)

    def apply_account_filter_from_top(self):
        self.account_search.setText(self.top_search.text().strip())
        self._set_page(1)
        self.refresh_accounts()

    def refresh_all(self):
        self.refresh_dashboard()
        self.refresh_accounts()
        self.refresh_material_account_choices()
        self.refresh_rules()
        self.refresh_preview_account_choices()
        self.refresh_preview()
        self.refresh_logs()
        self.load_settings()

    def refresh_dashboard(self):
        data = self.store.dashboard_metrics()
        self.metric_accounts.update_value(str(data['account_total']))
        self.metric_rules.update_value(str(data['enabled_rules']))
        self.metric_materials.update_value(str(data['material_total']))
        self.metric_abnormal.update_value(str(data['abnormal_accounts']))
        self.dashboard_recent_list.clear()
        for row in data['recent_logs']:
            item = QListWidgetItem(f"{row['created_at']} · {row['action']} · {row['result']}\n{row['detail']}")
            self.dashboard_recent_list.addItem(item)

    def refresh_accounts(self):
        selected_id = self.current_account_id
        metrics = self.store.account_metrics()
        status_filter = self.account_status_filter.currentText()
        if status_filter == '限制：冷冻':
            status_filter = '全部状态'
        enabled_filter = self.account_enabled_filter.currentText()
        if enabled_filter == '文件夹':
            enabled_filter = '全部启用状态'
        rows = self.store.list_accounts(status_filter, self.account_search.text().strip(), enabled_filter)
        group_filter = self.account_group_filter.currentText()
        if group_filter == '已选群组>0':
            rows = [row for row in rows if any(g.get('selected') for g in (row.get('joined_groups') or []))]
        elif group_filter == '未选群组':
            rows = [row for row in rows if not any(g.get('selected') for g in (row.get('joined_groups') or []))]
        geo_filter = self.account_geo_filter.currentText()
        if geo_filter not in ('地理', '全部'):
            rows = [row for row in rows if self.infer_account_region(row.get('phone') or '').endswith(geo_filter)]
        self.accounts_table.setSortingEnabled(False)
        self.accounts_table.clearSelection()
        self.accounts_table.setRowCount(len(rows))
        self.account_table_empty_label.setVisible(len(rows) == 0)
        self.refresh_account_overview_cards(rows)
        for r, row in enumerate(rows):
            self.accounts_table.setCellWidget(r, 0, self._make_table_checkbox(True))

            index_item = self._table_text_item(str(r + 1), Qt.AlignCenter)
            index_item.setData(Qt.UserRole, row['id'])
            self.accounts_table.setItem(r, 1, index_item)

            self.accounts_table.setItem(r, 2, self._table_text_item(row['phone'] or '未同步', Qt.AlignLeft | Qt.AlignVCenter))
            self.accounts_table.setItem(r, 3, self._table_text_item(self.infer_account_region(row.get('phone') or ''), Qt.AlignCenter, '#cbd5e1'))

            badge_text, badge_bg, badge_fg, badge_border = self.format_account_status_badge(row['status'])
            self.accounts_table.setCellWidget(r, 4, self._make_tag_chip(badge_text, badge_fg, badge_bg, badge_border))
            self.accounts_table.setItem(r, 4, self._table_text_item(badge_text, Qt.AlignCenter, '#ffffff'))
            self.accounts_table.item(r, 4).setText('')

            self.accounts_table.setItem(r, 5, self._table_text_item(self.format_relative_check_time(row.get('last_check_at') or ''), Qt.AlignCenter, '#cbd5e1'))

            self.accounts_table.setItem(r, 6, self._table_text_item('-', Qt.AlignCenter, '#cbd5e1'))
            self.accounts_table.setItem(r, 7, self._table_text_item(self.format_last_used_text(row.get('last_check_at') or ''), Qt.AlignCenter, '#dbe4ff'))

            self.accounts_table.setCellWidget(r, 8, self._make_name_cell(row.get('display_name') or '未命名', row.get('username') or ''))
            self.accounts_table.setItem(r, 8, self._table_text_item('', Qt.AlignCenter, '#ffffff'))

            misc_text = '◻  🔒  ⓘ  ⎘'
            self.accounts_table.setItem(r, 9, self._table_text_item(misc_text, Qt.AlignCenter, '#8fb4ff'))
            self.accounts_table.setRowHeight(r, 54)

        self.account_visible_count_label.setText(f"显示账户： {len(rows)} / {metrics['total']}")
        self.account_check_summary_label.setText(
            f"账号总数 {metrics['total']} · 正常 {metrics['normal']} · 异常 {metrics['abnormal']} · 启用 {metrics['enabled']} · 最近检查 {metrics['last_check_at']}"
        )
        self.refresh_dashboard()
        if rows and selected_id:
            for r, row in enumerate(rows):
                if row['id'] == selected_id:
                    self.accounts_table.selectRow(r)
                    self.on_account_row_clicked(r)
                    break
        if rows and self.current_account_id is None:
            self.load_account_detail(rows[0]['id'])
            self.accounts_table.selectRow(0)
            self.on_account_row_clicked(0)
        elif self.current_account_id and not any(row['id'] == self.current_account_id for row in rows):
            self.clear_account_form()
        elif not rows:
            self.clear_account_form()
        self._apply_accounts_table_row_styles()
        self.refresh_account_selection_status()

    def selected_account_id_from_table(self):
        rows = self.accounts_table.selectionModel().selectedRows(1)
        if not rows:
            return None
        item = self.accounts_table.item(rows[0].row(), 1)
        return item.data(Qt.UserRole) if item else None

    def selected_account_ids(self):
        rows = self.accounts_table.selectionModel().selectedRows(1)
        ids = []
        for model_index in rows:
            item = self.accounts_table.item(model_index.row(), 1)
            if item:
                ids.append(item.data(Qt.UserRole))
        return ids

    def on_account_selection_changed(self):
        self.refresh_account_selection_status()
        account_id = self.selected_account_id_from_table()
        if account_id:
            self.load_account_detail(account_id)

    def on_account_row_clicked(self, row):
        item = self.accounts_table.item(row, 1)
        if not item:
            return
        account_id = item.data(Qt.UserRole)
        if account_id:
            self.load_account_detail(account_id)

    def refresh_account_selection_status(self):
        selected_ids = self.selected_account_ids()
        self._apply_accounts_table_row_styles()
        total_rows = self.accounts_table.rowCount()
        self.account_bottom_status_label.setText(f'专用账号：{total_rows} / {total_rows}')
        if len(selected_ids) == 1 and self.current_account_id:
            self.account_footer_hint_label.setText(f'当前账号：{self.account_name_edit.text().strip() or "未命名账号"}')
        elif selected_ids:
            self.account_footer_hint_label.setText(f'已选中 {len(selected_ids)} 个账号')
        elif self.current_account_id:
            self.account_footer_hint_label.setText(f'当前账号：{self.account_name_edit.text().strip() or "未命名账号"}')
        else:
            self.account_footer_hint_label.setText('当前未选择账号')

    def update_account_detail_header(self, data):
        display_name = data.get('display_name') or '未命名账号'
        phone = data.get('phone') or '未同步手机号'
        username = ('@' + data.get('username')) if data.get('username') else '无用户名'
        selected_groups = len([g for g in (data.get('joined_groups') or []) if g.get('selected')])
        self.account_detail_name_label.setText(display_name)
        self.account_detail_meta_label.setText(f'{phone}  ·  {self.infer_account_region(phone)}  ·  {username}')
        self.account_avatar_label.setText((display_name[:1] or 'A').upper())
        self.account_selected_groups_label.setText(f"已选群：{selected_groups}")
        self.account_quick_phone_chip.setText(f'电话：{phone}')
        self.account_quick_user_chip.setText(f'用户名：{username}')
        self.account_quick_group_chip.setText(f'群组：{selected_groups}')

    def load_account_detail(self, account_id: int):
        data = self.store.get_account(account_id)
        if not data:
            return
        self.current_account_id = account_id
        self.update_account_detail_header(data)
        self.account_id_label.setText(str(data['id']))
        self.account_name_edit.setText(data.get('display_name') or '未命名账号')
        self.account_bio_edit.blockSignals(True)
        self.account_bio_edit.setPlainText(data.get('bio') or '')
        self.account_bio_edit.blockSignals(False)
        self.account_phone_edit.setText(data.get('phone') or '')
        self.account_username_edit.setText(data.get('username') or '')
        self.account_session_label.setText(data['session_name'])
        self.account_status_combo.setCurrentText(data['status'])
        self.set_status_label_style(self.account_status_badge, data['status'])
        self.account_enabled_check.setChecked(bool(data['enabled']))
        self.account_last_check.setText(data['last_check_at'] or '-')
        self.account_last_result.setText(data['last_check_result'] or '暂无检查结果')
        self.account_last_error.setText(data['last_error'] or '暂无错误信息')
        self.populate_account_groups(data.get('joined_groups') or [])
        self.refresh_account_selection_status()

    def clear_account_form(self):
        self.current_account_id = None
        self.account_profile_autosave_timer.stop()
        self.account_detail_name_label.setText('未选择账号')
        self.account_detail_meta_label.setText('点击左侧表格任意一行后，这里显示账号名称、手机号、用户名和状态。')
        self.account_avatar_label.setText('A')
        self.account_selected_groups_label.setText('已选群：0')
        self.account_quick_phone_chip.setText('电话：-')
        self.account_quick_user_chip.setText('用户名：-')
        self.account_quick_group_chip.setText('群组：0')
        self.account_id_label.setText('-')
        self.account_name_edit.clear()
        self.account_bio_edit.blockSignals(True)
        self.account_bio_edit.clear()
        self.account_bio_edit.blockSignals(False)
        self.account_phone_edit.clear()
        self.account_username_edit.clear()
        self.account_session_label.setText('-')
        self.account_status_combo.setCurrentText('未检查')
        self.set_status_label_style(self.account_status_badge, '未检查')
        self.account_enabled_check.setChecked(True)
        self.account_last_check.setText('-')
        self.account_last_result.setText('-')
        self.account_last_error.setText('-')
        self.account_groups_list.clear()
        self.account_groups_search.clear()
        self.refresh_account_selection_status()

    def populate_account_groups(self, groups):
        self.account_groups_list.blockSignals(True)
        self.account_groups_list.clear()
        for group in groups or []:
            title = group.get('title') or '-'
            username = f"@{group.get('username')}" if group.get('username') else ''
            suffix = f"  {username}" if username else ''
            item = QListWidgetItem(f"{title}{suffix}")
            item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
            item.setCheckState(Qt.Checked if group.get('selected') else Qt.Unchecked)
            item.setData(Qt.UserRole, group)
            self.account_groups_list.addItem(item)
        self.account_groups_list.blockSignals(False)
        self.filter_account_groups(self.account_groups_search.text().strip())
        self.account_selected_groups_label.setText(
            f"已选群：{len([g for g in (groups or []) if g.get('selected')])}"
        )

    def filter_account_groups(self, text=''):
        keyword = (text or '').strip().lower()
        for i in range(self.account_groups_list.count()):
            item = self.account_groups_list.item(i)
            group = item.data(Qt.UserRole) or {}
            haystack = ' '.join([
                str(group.get('title', '') or ''),
                str(group.get('username', '') or ''),
                str(group.get('id', '') or ''),
            ]).lower()
            item.setHidden(bool(keyword) and keyword not in haystack)

    def collect_account_groups(self):
        groups = []
        for i in range(self.account_groups_list.count()):
            item = self.account_groups_list.item(i)
            group = dict(item.data(Qt.UserRole) or {})
            group['selected'] = item.checkState() == Qt.Checked
            groups.append(group)
        self.account_selected_groups_label.setText(
            f"已选群：{len([g for g in groups if g.get('selected')])}"
        )
        return groups

    def selected_group_titles(self, groups):
        titles = [g.get('title') or (f"@{g.get('username')}" if g.get('username') else '') for g in groups if g.get('selected')]
        titles = [t for t in titles if t]
        return ' | '.join(titles)

    def schedule_account_profile_autosave(self):
        if not self.current_account_id:
            return
        self.account_profile_autosave_timer.start(500)

    def auto_save_account_profile(self):
        if not self.current_account_id:
            return
        self.save_current_account(silent=True)

    def new_account(self):
        self.clear_account_form()
        self.account_name_edit.setText('新账号')

    def save_current_account(self, silent: bool = False):
        joined_groups = self.collect_account_groups()
        payload = {
            'id': int(self.current_account_id) if self.current_account_id else None,
            'display_name': self.account_name_edit.text().strip() or '未命名账号',
            'phone': self.account_phone_edit.text().strip(),
            'username': self.account_username_edit.text().strip().lstrip('@'),
            'bio': self.account_bio_edit.toPlainText().strip(),
            'session_name': self.account_session_label.text().strip() if self.current_account_id else 'manual.session',
            'session_path': '',
            'status': self.account_status_combo.currentText(),
            'last_check_at': self.account_last_check.text().strip() if self.account_last_check.text() != '-' else '',
            'last_check_result': self.account_last_result.text().strip() if self.account_last_result.text() != '-' else '',
            'last_error': self.account_last_error.text().strip() if self.account_last_error.text() != '-' else '',
            'joined_groups': joined_groups,
            'target_chat': self.selected_group_titles(joined_groups),
            'enabled': self.account_enabled_check.isChecked(),
        }
        if self.current_account_id:
            existing = self.store.get_account(self.current_account_id)
            if existing:
                payload['session_name'] = existing['session_name']
                payload['session_path'] = existing['session_path']
        account_id = self.store.save_account(payload)
        self.current_account_id = account_id
        self.refresh_accounts()
        self.refresh_material_account_choices()
        self.refresh_preview_account_choices()
        self.refresh_rules()
        self.set_status_label_style(self.account_status_badge, self.account_status_combo.currentText())
        if not silent:
            QMessageBox.information(self, '已保存', '账号信息已保存。')

    def import_sessions(self):
        paths, _ = QFileDialog.getOpenFileNames(self, '选择 session 文件', str(BASE_DIR), 'Session Files (*.session)')
        if not paths:
            return
        result = self.store.import_session_files(paths)
        self.refresh_all()
        imported_count = result['imported_count']
        skipped_count = result['skipped_count']
        renamed_count = result['renamed_count']
        self.account_check_summary_label.setText(
            f"最近一次导入：成功 {imported_count} 个 · 跳过 {skipped_count} 个 · 重命名 {renamed_count} 个"
        )
        QMessageBox.information(self, '导入完成', f'已导入 {imported_count} 个 session。\n跳过 {skipped_count} 个无效文件。\n重命名 {renamed_count} 个重名 session。')

    def check_selected_accounts(self):
        account_ids = self.selected_account_ids()
        if not account_ids:
            account_id = self.selected_account_id_from_table()
            if account_id:
                account_ids = [account_id]
        if not account_ids:
            QMessageBox.warning(self, '提示', '先选中一个或多个账号。')
            return
        self.run_account_status_checks(account_ids, '选中账号')

    def check_current_account(self):
        if not self.current_account_id:
            QMessageBox.warning(self, '提示', '先在右侧载入一个账号。')
            return
        self.run_account_status_checks([self.current_account_id], '当前账号')

    def check_all_accounts(self):
        rows = self.store.list_accounts()
        if not rows:
            QMessageBox.warning(self, '提示', '当前还没有账号。')
            return
        self.run_account_status_checks([row['id'] for row in rows], '全部账号')

    def run_account_status_checks(self, account_ids, scope_text: str):
        progress = QProgressDialog(f'正在检查{scope_text}状态...', '取消', 0, len(account_ids), self)
        progress.setWindowTitle('检查账号状态')
        progress.setWindowModality(Qt.WindowModal)
        progress.setMinimumDuration(0)
        progress.setValue(0)

        results = []
        try:
            for index, account_id in enumerate(account_ids, start=1):
                if progress.wasCanceled():
                    break
                account = self.store.get_account(account_id)
                display_name = account['display_name'] if account else f'账号#{account_id}'
                progress.setLabelText(f'正在检查 {display_name} ({index}/{len(account_ids)}) ...')
                QApplication.processEvents()
                result = self.store.check_account_status(account_id)
                results.append(result)
                progress.setValue(index)
                QApplication.processEvents()
        except Exception as exc:
            progress.close()
            QMessageBox.critical(self, '检查失败', str(exc))
            self.refresh_all()
            return

        progress.close()
        self.refresh_all()
        summary_text = self.format_check_summary(results)
        self.account_check_summary_label.setText(f"最近一次检查（{scope_text}）：{summary_text}")
        if progress.wasCanceled():
            self.show_check_results_dialog(scope_text, results, canceled=True)
            return
        self.show_check_results_dialog(scope_text, results, canceled=False)

    def delete_selected_accounts(self):
        account_ids = self.selected_account_ids()
        if not account_ids:
            account_id = self.selected_account_id_from_table()
            if account_id:
                account_ids = [account_id]
        if not account_ids:
            QMessageBox.warning(self, '提示', '先选中一个或多个账号。')
            return
        if QMessageBox.question(self, '确认删除', f'确定删除选中的 {len(account_ids)} 个账号吗？删除后规则、素材和预览也会一起删掉。') != QMessageBox.Yes:
            return
        self.store.delete_accounts(account_ids)
        self.clear_account_form()
        self.refresh_all()

    def set_selected_accounts_enabled(self, enabled: bool):
        account_ids = self.selected_account_ids()
        if not account_ids:
            account_id = self.selected_account_id_from_table()
            if account_id:
                account_ids = [account_id]
        if not account_ids:
            QMessageBox.warning(self, '提示', '先选中一个或多个账号。')
            return
        self.store.set_accounts_enabled(account_ids, enabled)
        self.refresh_all()
        QMessageBox.information(self, '操作完成', f"已{'启用' if enabled else '停用'} {len(account_ids)} 个账号。")

    def refresh_material_account_choices(self):
        current = self.material_account_combo.currentData()
        self.material_account_combo.blockSignals(True)
        self.material_account_combo.clear()
        for account_id, name in self.store.account_choices():
            self.material_account_combo.addItem(name, account_id)
        self.material_account_combo.blockSignals(False)
        if self.material_account_combo.count() == 0:
            self.clear_material_forms()
            return
        index = max(0, self.material_account_combo.findData(current))
        self.material_account_combo.setCurrentIndex(index)
        self.refresh_materials()

    def on_material_account_changed(self):
        self.refresh_materials()
        self.refresh_rule_image_choices()

    def material_account_id(self):
        return self.material_account_combo.currentData()

    def refresh_materials(self):
        account_id = self.material_account_id()
        self.text_materials_list.clear()
        self.image_materials_list.clear()
        self.current_text_material_id = None
        self.current_image_material_id = None
        self.clear_text_form()
        self.clear_image_form()
        if not account_id:
            return
        for material in self.store.list_materials(account_id, 'text'):
            item = QListWidgetItem(material['title'])
            item.setData(Qt.UserRole, material['id'])
            self.text_materials_list.addItem(item)
        for material in self.store.list_materials(account_id, 'image'):
            label = material['title'] or Path(material['image_path']).name
            item = QListWidgetItem(label)
            item.setData(Qt.UserRole, material['id'])
            self.image_materials_list.addItem(item)
        self.refresh_dashboard()
        self.refresh_rules()

    def clear_material_forms(self):
        self.clear_text_form()
        self.clear_image_form()

    def clear_text_form(self):
        self.current_text_material_id = None
        self.text_title_edit.clear()
        self.text_content_edit.clear()
        self.text_enabled_check.setChecked(True)

    def clear_image_form(self):
        self.current_image_material_id = None
        self.image_title_edit.clear()
        self.image_path_edit.clear()
        self.image_caption_edit.clear()
        self.image_enabled_check.setChecked(True)

    def new_text_material(self):
        self.clear_text_form()
        self.text_title_edit.setFocus()

    def on_text_material_selected(self, current, previous):
        if not current:
            return
        material_id = current.data(Qt.UserRole)
        material = self.store.get_material(material_id)
        if not material:
            return
        self.current_text_material_id = material_id
        self.text_title_edit.setText(material['title'])
        self.text_content_edit.setPlainText(material['text_content'])
        self.text_enabled_check.setChecked(bool(material['enabled']))

    def save_text_material(self):
        account_id = self.material_account_id()
        if not account_id:
            QMessageBox.warning(self, '提示', '先导入账号，再配置素材。')
            return
        payload = {
            'id': self.current_text_material_id,
            'account_id': account_id,
            'kind': 'text',
            'title': self.text_title_edit.text().strip() or '未命名文案',
            'text_content': self.text_content_edit.toPlainText().strip(),
            'enabled': self.text_enabled_check.isChecked(),
        }
        self.store.save_material(payload)
        self.refresh_materials()
        QMessageBox.information(self, '已保存', '文案素材已保存。')

    def delete_current_text_material(self):
        if not self.current_text_material_id:
            QMessageBox.warning(self, '提示', '先选中一条文案。')
            return
        self.store.delete_material(self.current_text_material_id)
        self.refresh_materials()

    def upload_image_material(self):
        account_id = self.material_account_id()
        if not account_id:
            QMessageBox.warning(self, '提示', '先导入账号，再上传图片。')
            return
        path, _ = QFileDialog.getOpenFileName(self, '选择图片', str(BASE_DIR), 'Images (*.png *.jpg *.jpeg *.webp *.gif)')
        if not path:
            return
        saved = self.store.import_image(path)
        self.clear_image_form()
        self.image_title_edit.setText(Path(saved).stem)
        self.image_path_edit.setText(saved)

    def on_image_material_selected(self, current, previous):
        if not current:
            return
        material_id = current.data(Qt.UserRole)
        material = self.store.get_material(material_id)
        if not material:
            return
        self.current_image_material_id = material_id
        self.image_title_edit.setText(material['title'])
        self.image_path_edit.setText(material['image_path'])
        self.image_caption_edit.setPlainText(material['caption'])
        self.image_enabled_check.setChecked(bool(material['enabled']))

    def save_image_material(self):
        account_id = self.material_account_id()
        if not account_id:
            QMessageBox.warning(self, '提示', '先导入账号，再上传图片。')
            return
        if not self.image_path_edit.text().strip():
            QMessageBox.warning(self, '提示', '先选择一张图片。')
            return
        payload = {
            'id': self.current_image_material_id,
            'account_id': account_id,
            'kind': 'image',
            'title': self.image_title_edit.text().strip() or Path(self.image_path_edit.text().strip()).stem,
            'image_path': self.image_path_edit.text().strip(),
            'caption': self.image_caption_edit.toPlainText().strip(),
            'enabled': self.image_enabled_check.isChecked(),
        }
        self.store.save_material(payload)
        self.refresh_materials()
        QMessageBox.information(self, '已保存', '图片素材已保存。')

    def delete_current_image_material(self):
        if not self.current_image_material_id:
            QMessageBox.warning(self, '提示', '先选中一张图片。')
            return
        self.store.delete_material(self.current_image_material_id)
        self.refresh_materials()

    def refresh_rules(self):
        rows = self.store.list_rules()
        self.rules_table.setRowCount(len(rows))
        for r, row in enumerate(rows):
            values = [
                row['id'], row['name'], row['account_name'], row['target_chat'],
                f"{row['start_time']} - {row['end_time']}", f"{row['interval_minutes']} 分钟", row['daily_limit'],
                '启用' if row['enabled'] else '停用'
            ]
            for c, value in enumerate(values):
                item = QTableWidgetItem(str(value))
                if c == 0:
                    item.setData(Qt.UserRole, row['id'])
                self.rules_table.setItem(r, c, item)
        self.refresh_rule_account_choices()
        self.refresh_dashboard()

    def refresh_rule_account_choices(self):
        current = self.rule_account_combo.currentData()
        self.rule_account_combo.blockSignals(True)
        self.rule_account_combo.clear()
        for account_id, name in self.store.account_choices():
            self.rule_account_combo.addItem(name, account_id)
        self.rule_account_combo.blockSignals(False)
        if self.rule_account_combo.count():
            index = max(0, self.rule_account_combo.findData(current))
            self.rule_account_combo.setCurrentIndex(index)
        self.refresh_rule_image_choices()

    def refresh_rule_image_choices(self):
        account_id = self.rule_account_combo.currentData() or self.material_account_id()
        current = self.rule_fixed_image_combo.currentData()
        self.rule_fixed_image_combo.blockSignals(True)
        self.rule_fixed_image_combo.clear()
        self.rule_fixed_image_combo.addItem('不指定', None)
        if account_id:
            for image_id, name in self.store.image_material_choices(account_id):
                self.rule_fixed_image_combo.addItem(name, image_id)
        self.rule_fixed_image_combo.blockSignals(False)
        idx = self.rule_fixed_image_combo.findData(current)
        self.rule_fixed_image_combo.setCurrentIndex(max(0, idx))

    def on_rule_row_clicked(self, row, column):
        item = self.rules_table.item(row, 0)
        if item:
            self.load_rule_detail(item.data(Qt.UserRole))

    def load_rule_detail(self, rule_id: int):
        rule = self.store.get_rule(rule_id)
        if not rule:
            return
        self.current_rule_id = rule_id
        self.rule_id_label.setText(str(rule_id))
        self.rule_name_edit.setText(rule['name'])
        self.rule_account_combo.setCurrentIndex(max(0, self.rule_account_combo.findData(rule['account_id'])))
        self.rule_target_edit.setText(rule['target_chat'])
        self.rule_start_edit.setText(rule['start_time'])
        self.rule_end_edit.setText(rule['end_time'])
        self.rule_interval_edit.setText(str(rule['interval_minutes']))
        self.rule_daily_limit_edit.setText(str(rule['daily_limit']))
        self.rule_text_mode_combo.setCurrentText('随机抽取' if rule['text_mode'] == 'random' else '顺序轮播')
        image_mode_map = {'none': '不带图', 'fixed': '固定图片', 'random': '随机图片'}
        self.rule_image_mode_combo.setCurrentText(image_mode_map.get(rule['image_mode'], '不带图'))
        self.refresh_rule_image_choices()
        idx = self.rule_fixed_image_combo.findData(rule['fixed_image_id'])
        self.rule_fixed_image_combo.setCurrentIndex(max(0, idx))
        self.rule_enabled_check.setChecked(bool(rule['enabled']))

    def clear_rule_form(self):
        self.current_rule_id = None
        self.rule_id_label.setText('-')
        self.rule_name_edit.clear()
        self.rule_target_edit.clear()
        self.rule_start_edit.setText('09:00')
        self.rule_end_edit.setText('21:00')
        self.rule_interval_edit.setText('10')
        self.rule_daily_limit_edit.setText('30')
        self.rule_text_mode_combo.setCurrentText('顺序轮播')
        self.rule_image_mode_combo.setCurrentText('不带图')
        self.rule_enabled_check.setChecked(True)
        self.refresh_rule_image_choices()

    def new_rule(self):
        self.clear_rule_form()
        self.rule_name_edit.setFocus()

    def save_rule(self):
        account_id = self.rule_account_combo.currentData()
        if not account_id:
            QMessageBox.warning(self, '提示', '先导入账号，再创建规则。')
            return
        payload = {
            'id': self.current_rule_id,
            'account_id': account_id,
            'name': self.rule_name_edit.text().strip() or '未命名规则',
            'target_chat': self.rule_target_edit.text().strip(),
            'start_time': self.rule_start_edit.text().strip() or '09:00',
            'end_time': self.rule_end_edit.text().strip() or '21:00',
            'interval_minutes': int(self.rule_interval_edit.text().strip() or '10'),
            'daily_limit': int(self.rule_daily_limit_edit.text().strip() or '30'),
            'text_mode': 'random' if self.rule_text_mode_combo.currentText() == '随机抽取' else 'rotate',
            'image_mode': {'不带图': 'none', '固定图片': 'fixed', '随机图片': 'random'}[self.rule_image_mode_combo.currentText()],
            'fixed_image_id': self.rule_fixed_image_combo.currentData(),
            'enabled': self.rule_enabled_check.isChecked(),
        }
        self.store.save_rule(payload)
        self.refresh_rules()
        self.refresh_preview_account_choices()
        QMessageBox.information(self, '已保存', '规则已保存。')

    def delete_current_rule(self):
        if not self.current_rule_id:
            QMessageBox.warning(self, '提示', '先选中一条规则。')
            return
        self.store.delete_rule(self.current_rule_id)
        self.clear_rule_form()
        self.refresh_rules()
        self.refresh_preview()

    def preview_run_date(self):
        return (date.today() + timedelta(days=1)).isoformat() if self.preview_date_combo.currentText() == '明天' else date.today().isoformat()

    def refresh_preview_account_choices(self):
        current = self.preview_account_combo.currentData()
        self.preview_account_combo.blockSignals(True)
        self.preview_account_combo.clear()
        self.preview_account_combo.addItem('全部账号', 0)
        for account_id, name in self.store.account_choices():
            self.preview_account_combo.addItem(name, account_id)
        self.preview_account_combo.blockSignals(False)
        idx = self.preview_account_combo.findData(current)
        self.preview_account_combo.setCurrentIndex(max(0, idx))

    def generate_preview(self):
        run_date = self.preview_run_date()
        account_id = self.preview_account_combo.currentData() or 0
        try:
            self.store.generate_preview_jobs(run_date, account_id)
        except Exception as exc:
            QMessageBox.critical(self, '生成失败', str(exc))
            return
        self.refresh_preview()
        self.refresh_logs()
        QMessageBox.information(self, '已生成', f'已生成 {run_date} 的任务预览。')

    def clear_preview(self):
        self.store.clear_preview_jobs(self.preview_run_date())
        self.refresh_preview()
        self.refresh_logs()

    def refresh_preview(self):
        rows = self.store.list_preview_jobs(self.preview_run_date(), self.preview_account_combo.currentData() or 0)
        self.preview_table.setRowCount(len(rows))
        for r, row in enumerate(rows):
            values = [row['run_at'], row['account_name'], row['target_chat'], row['text_summary'], row['image_summary'] or '-', row['status']]
            for c, value in enumerate(values):
                self.preview_table.setItem(r, c, QTableWidgetItem(str(value)))
        self.refresh_dashboard()

    def refresh_logs(self):
        rows = self.store.list_logs()
        self.logs_table.setRowCount(len(rows))
        for r, row in enumerate(rows):
            values = [row['created_at'], row['account_name'], row['action'], row['result'], row['detail']]
            for c, value in enumerate(values):
                self.logs_table.setItem(r, c, QTableWidgetItem(str(value)))
        self.refresh_dashboard()

    def load_settings(self):
        settings = self.store.get_settings()
        self.setting_data_dir.setText(settings.get('data_dir', str(BASE_DIR / 'data')))
        self.setting_sessions_dir.setText(settings.get('sessions_dir', str(BASE_DIR / 'sessions')))
        self.setting_images_dir.setText(settings.get('images_dir', str(BASE_DIR / 'images')))
        self.setting_logs_dir.setText(settings.get('logs_dir', str(BASE_DIR / 'logs')))
        self.setting_api_id.setText(settings.get('api_id', ''))
        self.setting_api_hash.setText(settings.get('api_hash', ''))
        self.setting_theme_combo.setCurrentText(settings.get('theme', '深色 · 默认'))
        self.setting_density_combo.setCurrentText(settings.get('density', '舒适'))

    def save_settings(self):
        payload = {
            'data_dir': self.setting_data_dir.text().strip(),
            'sessions_dir': self.setting_sessions_dir.text().strip(),
            'images_dir': self.setting_images_dir.text().strip(),
            'logs_dir': self.setting_logs_dir.text().strip(),
            'api_id': self.setting_api_id.text().strip(),
            'api_hash': self.setting_api_hash.text().strip(),
            'theme': self.setting_theme_combo.currentText(),
            'density': self.setting_density_combo.currentText(),
        }
        self.store.save_settings(payload)
        self.refresh_logs()
        QMessageBox.information(self, '已保存', '设置已保存到本地数据库。')

    def jump_to_materials(self, account_id):
        if not account_id:
            return
        idx = self.material_account_combo.findData(account_id)
        if idx >= 0:
            self.material_account_combo.setCurrentIndex(idx)
        self._set_page(2)

    def jump_to_rules(self, account_id):
        if not account_id:
            return
        idx = self.rule_account_combo.findData(account_id)
        if idx >= 0:
            self.rule_account_combo.setCurrentIndex(idx)
        self._set_page(3)


def main():
    app = QApplication(sys.argv)
    app.setStyleSheet(APP_STYLE)
    window = SenderStudioV1()
    window.show()
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
