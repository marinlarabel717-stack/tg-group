import sys
from datetime import date, timedelta
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QBrush
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
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
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 10px 12px;
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
    background: transparent;
    border: none;
    gridline-color: #1f2937;
    border-radius: 12px;
}
QHeaderView::section {
    background: #0f172a;
    color: #94a3b8;
    border: none;
    border-bottom: 1px solid #1f2937;
    padding: 12px;
    font-weight: 600;
}
QTableWidget::item {
    border-bottom: 1px solid #182233;
    padding: 10px;
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
        title_label = QLabel(title)
        title_label.setStyleSheet('color:#94a3b8;font-size:13px;')
        value_label = QLabel(value)
        value_label.setStyleSheet('font-size:28px;font-weight:700;color:white;')
        subtitle_label = QLabel(subtitle)
        subtitle_label.setStyleSheet('color:#9ca3af;font-size:12px;')
        layout.addWidget(dot)
        layout.addWidget(title_label)
        layout.addWidget(value_label)
        layout.addWidget(subtitle_label)
        layout.addStretch()


class SenderStudioV1(QMainWindow):
    def __init__(self):
        super().__init__()
        self.store = StudioStore(str(BASE_DIR))
        self.nav_buttons = []
        self.current_account_id = None
        self.current_text_material_id = None
        self.current_image_material_id = None
        self.current_rule_id = None
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

    def format_check_summary(self, results):
        summary = {key: 0 for key in STATUS_OPTIONS}
        for row in results:
            if not row:
                continue
            status = row.get('status') or '未检查'
            summary[status] = summary.get(status, 0) + 1
        parts = [f"{key} {value} 个" for key, value in summary.items() if value]
        return '，'.join(parts) if parts else '没有可汇总结果'

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
        layout.setSpacing(18)

        header = Panel('账号管理', '导入 session、维护备注和状态')
        toolbar = QHBoxLayout()
        self.btn_import_session = QPushButton('导入 Session')
        self.btn_import_session.setProperty('role', 'primary')
        self.btn_import_session.clicked.connect(self.import_sessions)
        self.btn_check_account = QPushButton('检查选中状态')
        self.btn_check_account.clicked.connect(self.check_selected_accounts)
        self.btn_check_all_accounts = QPushButton('检查全部状态')
        self.btn_check_all_accounts.clicked.connect(self.check_all_accounts)
        self.btn_delete_account = QPushButton('删除选中')
        self.btn_delete_account.clicked.connect(self.delete_selected_accounts)
        self.btn_new_account = QPushButton('新增空白账号')
        self.btn_new_account.clicked.connect(self.new_account)
        for btn in [self.btn_import_session, self.btn_check_account, self.btn_check_all_accounts, self.btn_delete_account, self.btn_new_account]:
            toolbar.addWidget(btn)
        toolbar.addStretch()
        header.body.addLayout(toolbar)

        filter_row = QHBoxLayout()
        self.account_search = QLineEdit()
        self.account_search.setPlaceholderText('搜索备注名 / session / 目标群')
        self.account_search.returnPressed.connect(self.refresh_accounts)
        self.account_status_filter = QComboBox()
        self.account_status_filter.addItems(['全部状态'] + STATUS_OPTIONS)
        self.account_status_filter.currentIndexChanged.connect(self.refresh_accounts)
        filter_row.addWidget(self.account_search, 1)
        filter_row.addWidget(self.account_status_filter)
        header.body.addLayout(filter_row)
        layout.addWidget(header)

        splitter = QSplitter(Qt.Horizontal)
        table_panel = Panel('账号列表')
        self.accounts_table = self._create_table(['ID', '备注名', '手机号', 'Session', '状态', '目标群', '最近检查'])
        self.accounts_table.setSelectionMode(QTableWidget.ExtendedSelection)
        self.accounts_table.cellClicked.connect(self.on_account_row_clicked)
        table_panel.body.addWidget(self.accounts_table)
        splitter.addWidget(table_panel)

        detail = Panel('账号详情', '编辑当前账号的基础信息')
        form = QFormLayout()
        self.account_id_label = QLabel('-')
        self.account_name_edit = QLineEdit()
        self.account_phone_edit = QLineEdit()
        self.account_session_label = QLabel('-')
        self.account_status_combo = QComboBox(); self.account_status_combo.addItems(STATUS_OPTIONS)
        self.account_status_badge = QLabel('未检查')
        self.account_target_edit = QLineEdit()
        self.account_enabled_check = QCheckBox('启用这个账号')
        self.account_enabled_check.setChecked(True)
        self.account_last_result = QLabel('-')
        self.account_last_error = QLabel('-')
        self.account_last_check = QLabel('-')
        form.addRow('账号ID', self.account_id_label)
        form.addRow('备注名', self.account_name_edit)
        form.addRow('手机号', self.account_phone_edit)
        form.addRow('Session', self.account_session_label)
        form.addRow('状态', self.account_status_combo)
        form.addRow('状态标签', self.account_status_badge)
        form.addRow('默认目标群', self.account_target_edit)
        form.addRow('', self.account_enabled_check)
        form.addRow('最近检查', self.account_last_check)
        form.addRow('最近结果', self.account_last_result)
        form.addRow('最近错误', self.account_last_error)
        detail.body.addLayout(form)
        self.set_status_label_style(self.account_status_badge, '未检查')
        btns = QHBoxLayout()
        save = QPushButton('保存账号')
        save.setProperty('role', 'primary')
        save.clicked.connect(self.save_current_account)
        go_materials = QPushButton('去素材配置')
        go_materials.clicked.connect(lambda: self.jump_to_materials(self.current_account_id))
        go_rules = QPushButton('去定时规则')
        go_rules.clicked.connect(lambda: self.jump_to_rules(self.current_account_id))
        btns.addWidget(save)
        btns.addWidget(go_materials)
        btns.addWidget(go_rules)
        detail.body.addLayout(btns)
        detail.body.addStretch()
        splitter.addWidget(detail)
        splitter.setSizes([980, 520])
        layout.addWidget(splitter)
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
        table.verticalHeader().setVisible(False)
        table.setSelectionBehavior(QTableWidget.SelectRows)
        table.setSelectionMode(QTableWidget.SingleSelection)
        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.setShowGrid(False)
        table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        table.horizontalHeader().setDefaultAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        table.setMinimumHeight(320)
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
        self.metric_accounts.findChildren(QLabel)[2].setText(str(data['account_total']))
        self.metric_rules.findChildren(QLabel)[2].setText(str(data['enabled_rules']))
        self.metric_materials.findChildren(QLabel)[2].setText(str(data['material_total']))
        self.metric_abnormal.findChildren(QLabel)[2].setText(str(data['abnormal_accounts']))
        self.dashboard_recent_list.clear()
        for row in data['recent_logs']:
            item = QListWidgetItem(f"{row['created_at']} · {row['action']} · {row['result']}\n{row['detail']}")
            self.dashboard_recent_list.addItem(item)

    def refresh_accounts(self):
        rows = self.store.list_accounts(self.account_status_filter.currentText(), self.account_search.text().strip())
        self.accounts_table.setRowCount(len(rows))
        for r, row in enumerate(rows):
            values = [row['id'], row['display_name'], row['phone'], row['session_name'], row['status'], row['target_chat'], row['last_check_at'] or '-']
            for c, value in enumerate(values):
                item = QTableWidgetItem(str(value))
                if c == 0:
                    item.setData(Qt.UserRole, row['id'])
                if c == 4:
                    self.paint_status_item(item, row['status'])
                self.accounts_table.setItem(r, c, item)
        self.accounts_table.resizeRowsToContents()
        self.refresh_dashboard()
        if rows and self.current_account_id is None:
            self.load_account_detail(rows[0]['id'])
        elif self.current_account_id and not any(row['id'] == self.current_account_id for row in rows):
            self.clear_account_form()

    def selected_account_id_from_table(self):
        row = self.accounts_table.currentRow()
        if row < 0:
            return None
        item = self.accounts_table.item(row, 0)
        return item.data(Qt.UserRole) if item else None

    def selected_account_ids(self):
        rows = self.accounts_table.selectionModel().selectedRows(0)
        ids = []
        for model_index in rows:
            item = self.accounts_table.item(model_index.row(), 0)
            if item:
                ids.append(item.data(Qt.UserRole))
        return ids

    def on_account_row_clicked(self, row, column):
        account_id = self.selected_account_id_from_table()
        if account_id:
            self.load_account_detail(account_id)

    def load_account_detail(self, account_id: int):
        data = self.store.get_account(account_id)
        if not data:
            return
        self.current_account_id = account_id
        self.account_id_label.setText(str(data['id']))
        self.account_name_edit.setText(data['display_name'])
        self.account_phone_edit.setText(data['phone'])
        self.account_session_label.setText(data['session_name'])
        self.account_status_combo.setCurrentText(data['status'])
        self.set_status_label_style(self.account_status_badge, data['status'])
        self.account_target_edit.setText(data['target_chat'])
        self.account_enabled_check.setChecked(bool(data['enabled']))
        self.account_last_check.setText(data['last_check_at'] or '-')
        self.account_last_result.setText(data['last_check_result'] or '-')
        self.account_last_error.setText(data['last_error'] or '-')

    def clear_account_form(self):
        self.current_account_id = None
        self.account_id_label.setText('-')
        self.account_name_edit.clear()
        self.account_phone_edit.clear()
        self.account_session_label.setText('-')
        self.account_status_combo.setCurrentText('未检查')
        self.set_status_label_style(self.account_status_badge, '未检查')
        self.account_target_edit.clear()
        self.account_enabled_check.setChecked(True)
        self.account_last_check.setText('-')
        self.account_last_result.setText('-')
        self.account_last_error.setText('-')

    def new_account(self):
        self.clear_account_form()
        self.account_name_edit.setText('新账号')

    def save_current_account(self):
        payload = {
            'id': int(self.current_account_id) if self.current_account_id else None,
            'display_name': self.account_name_edit.text().strip() or '未命名账号',
            'phone': self.account_phone_edit.text().strip(),
            'session_name': self.account_session_label.text().strip() if self.current_account_id else 'manual.session',
            'session_path': '',
            'status': self.account_status_combo.currentText(),
            'last_check_at': self.account_last_check.text().strip() if self.account_last_check.text() != '-' else '',
            'last_check_result': self.account_last_result.text().strip() if self.account_last_result.text() != '-' else '',
            'last_error': self.account_last_error.text().strip() if self.account_last_error.text() != '-' else '',
            'target_chat': self.account_target_edit.text().strip(),
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
        QMessageBox.information(self, '已保存', '账号信息已保存。')

    def import_sessions(self):
        paths, _ = QFileDialog.getOpenFileNames(self, '选择 session 文件', str(BASE_DIR), 'Session Files (*.session)')
        if not paths:
            return
        imported = self.store.import_session_files(paths)
        self.refresh_all()
        QMessageBox.information(self, '导入完成', f'已导入 {len(imported)} 个 session。')

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
        if progress.wasCanceled():
            QMessageBox.information(self, '已取消', f'已检查 {len(results)} 个账号。\n\n结果：{summary_text}')
            return
        QMessageBox.information(self, '检查完成', f'已检查 {len(results)} 个账号。\n\n结果：{summary_text}')

    def delete_selected_accounts(self):
        account_id = self.selected_account_id_from_table()
        if not account_id:
            QMessageBox.warning(self, '提示', '先选中一个账号。')
            return
        if QMessageBox.question(self, '确认删除', '删除账号后，规则、素材和预览也会一起删掉。确定继续吗？') != QMessageBox.Yes:
            return
        self.store.delete_accounts([account_id])
        self.clear_account_form()
        self.refresh_all()

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
