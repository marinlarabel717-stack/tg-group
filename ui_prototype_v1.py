import sys
from PySide6.QtCore import Qt, QSize
from PySide6.QtGui import QAction, QColor, QFont
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QStackedWidget,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QToolButton,
    QVBoxLayout,
    QWidget,
    QComboBox,
    QCheckBox,
    QFormLayout,
    QHeaderView,
)

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
QPushButton:pressed {
    background: #334155;
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
"""


class MetricCard(QFrame):
    def __init__(self, title: str, value: str, subtitle: str, accent: str = '#22c55e'):
        super().__init__()
        self.setObjectName('Card')
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 18, 18, 18)
        dot = QLabel('●')
        dot.setStyleSheet(f'color: {accent}; font-size: 18px;')
        title_label = QLabel(title)
        title_label.setStyleSheet('color:#94a3b8;font-size:13px;')
        value_label = QLabel(value)
        value_label.setStyleSheet('font-size:28px;font-weight:700;color:white;')
        sub_label = QLabel(subtitle)
        sub_label.setStyleSheet('color:#9ca3af;font-size:12px;')
        layout.addWidget(dot)
        layout.addWidget(title_label)
        layout.addWidget(value_label)
        layout.addWidget(sub_label)
        layout.addStretch()


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


class SenderUIDemo(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('TG Sender Studio · v1 UI Preview')
        self.resize(1560, 980)
        self.nav_buttons = []
        self._build_ui()

    def _build_ui(self):
        root = QWidget()
        self.setCentralWidget(root)
        shell = QHBoxLayout(root)
        shell.setContentsMargins(0, 0, 0, 0)
        shell.setSpacing(0)

        sidebar = self._build_sidebar()
        shell.addWidget(sidebar)

        content_wrap = QVBoxLayout()
        content_wrap.setContentsMargins(0, 0, 0, 0)
        content_wrap.setSpacing(0)
        content_wrap.addWidget(self._build_topbar())

        self.stack = QStackedWidget()
        self.stack.addWidget(self._wrap_page(self._build_dashboard_page()))
        self.stack.addWidget(self._wrap_page(self._build_accounts_page()))
        self.stack.addWidget(self._wrap_page(self._build_materials_page()))
        self.stack.addWidget(self._wrap_page(self._build_rules_page()))
        self.stack.addWidget(self._wrap_page(self._build_preview_page()))
        self.stack.addWidget(self._wrap_page(self._build_logs_page()))
        self.stack.addWidget(self._wrap_page(self._build_settings_page()))
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
        logo = QLabel('TG')
        logo.setFixedSize(54, 54)
        logo.setAlignment(Qt.AlignCenter)
        logo.setStyleSheet('background: rgba(255,255,255,0.16); border-radius: 16px; font-size:22px; font-weight:800; color:white;')
        title = QLabel('Sender Studio')
        title.setStyleSheet('font-size:22px;font-weight:800;color:white;')
        sub = QLabel('v1 界面原型 · 先看布局和质感')
        sub.setStyleSheet('color:rgba(255,255,255,0.8);font-size:13px;')
        brand_layout.addWidget(logo, 0, Qt.AlignLeft)
        brand_layout.addSpacing(8)
        brand_layout.addWidget(title)
        brand_layout.addWidget(sub)
        layout.addWidget(brand)

        nav_items = ['总览', '账号管理', '素材配置', '定时规则', '任务预览', '日志中心', '设置']
        for idx, text in enumerate(nav_items):
            btn = QToolButton()
            btn.setText(text)
            btn.setToolButtonStyle(Qt.ToolButtonTextOnly)
            btn.setProperty('nav', True)
            btn.clicked.connect(lambda checked=False, i=idx: self._set_page(i))
            btn.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
            btn.setMinimumHeight(46)
            layout.addWidget(btn)
            self.nav_buttons.append(btn)

        layout.addStretch()
        footer = QLabel('设计关键词\n• 深色面板\n• 真软件感\n• 适合后续接后台逻辑')
        footer.setStyleSheet('color:#94a3b8; line-height:1.6; padding:12px 4px;')
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
        page_title = QLabel('第一版 UI 软件预览')
        page_title.setStyleSheet('font-size:24px;font-weight:800;color:white;')
        page_sub = QLabel('先把布局、层级、质感做好，后面再逐步接功能')
        page_sub.setStyleSheet('color:#94a3b8;font-size:13px;')
        title_wrap.addWidget(page_title)
        title_wrap.addWidget(page_sub)
        layout.addLayout(title_wrap)
        layout.addStretch()

        search = QLineEdit()
        search.setPlaceholderText('搜索账号 / 规则 / 群 / 文案...')
        search.setFixedWidth(320)
        layout.addWidget(search)

        preview_btn = QPushButton('原型模式')
        preview_btn.setProperty('role', 'primary')
        layout.addWidget(preview_btn)
        return bar

    def _wrap_page(self, widget: QWidget):
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.addWidget(widget)
        layout.addStretch()
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
        title = QLabel('Telegram Sender Studio')
        title.setStyleSheet('font-size:30px;font-weight:800;color:white;')
        text = QLabel('这一版先做成像真的桌面软件，重点看模块分层、信息密度、视觉风格。\n后续再把账号状态、素材配置、任务生成一层层接上。')
        text.setStyleSheet('font-size:14px;color:rgba(255,255,255,0.88);line-height:1.7;')
        btns = QHBoxLayout()
        btn1 = QPushButton('查看账号页')
        btn1.setProperty('role', 'primary')
        btn1.clicked.connect(lambda: self._set_page(1))
        btn2 = QPushButton('查看任务预览')
        btn2.setProperty('role', 'ghost')
        btn2.clicked.connect(lambda: self._set_page(4))
        btns.addWidget(btn1)
        btns.addWidget(btn2)
        btns.addStretch()
        left.addWidget(title)
        left.addWidget(text)
        left.addSpacing(10)
        left.addLayout(btns)
        hero_layout.addLayout(left, 1)

        right = Panel('v1 范围', '只做软件外观与页面结构')
        for line in ['账号管理', '素材配置', '定时规则', '任务预览', '日志中心', '设置页面']:
            label = QLabel('• ' + line)
            label.setStyleSheet('color:white;font-size:14px;')
            right.body.addWidget(label)
        hero_layout.addWidget(right, 0)
        layout.addWidget(hero)

        metrics = QGridLayout()
        metrics.setHorizontalSpacing(16)
        metrics.setVerticalSpacing(16)
        metrics.addWidget(MetricCard('导入账号', '128', 'session 文件待管理', '#22c55e'), 0, 0)
        metrics.addWidget(MetricCard('活跃规则', '36', '今日可生成计划', '#38bdf8'), 0, 1)
        metrics.addWidget(MetricCard('素材总数', '524', '文案 + 图片池', '#f59e0b'), 0, 2)
        metrics.addWidget(MetricCard('异常账号', '12', '需要关注 / 重登', '#ef4444'), 0, 3)
        layout.addLayout(metrics)

        lower = QHBoxLayout()
        lower.setSpacing(18)
        recent = Panel('近期动作', '给你看软件的真实感排版')
        actions = [
            ('21:41', '导入 session 批次 #A017', '完成 24 / 24'),
            ('21:33', '更新 账号A 素材池', '新增 3 条文案，2 张图片'),
            ('21:28', '生成 今日预览任务', '总计 144 条'),
            ('21:10', '检查 账号B 状态', '结果：受限'),
        ]
        for t, a, s in actions:
            item = QFrame()
            item.setObjectName('Card')
            li = QVBoxLayout(item)
            li.setContentsMargins(14, 14, 14, 14)
            li.addWidget(QLabel(f'{t} · {a}'))
            sub = QLabel(s)
            sub.setStyleSheet('color:#94a3b8;font-size:12px;')
            li.addWidget(sub)
            recent.body.addWidget(item)
        lower.addWidget(recent, 1)

        architecture = Panel('模块结构', '后续接功能就按这个骨架扩展')
        arch_text = QTextEdit()
        arch_text.setReadOnly(True)
        arch_text.setPlainText('Account Center\n ├─ Session Import\n ├─ Status Review\n\nContent Studio\n ├─ Text Pool\n ├─ Image Pool\n\nSchedule Lab\n ├─ Rules\n ├─ Daily Preview\n\nSystem\n ├─ Logs\n └─ Settings')
        arch_text.setMinimumHeight(240)
        architecture.body.addWidget(arch_text)
        lower.addWidget(architecture, 1)
        layout.addLayout(lower)
        return page

    def _styled_table(self, columns, rows):
        table = QTableWidget(len(rows), len(columns))
        table.setHorizontalHeaderLabels(columns)
        table.verticalHeader().setVisible(False)
        table.setAlternatingRowColors(False)
        table.setShowGrid(False)
        table.setSelectionBehavior(QTableWidget.SelectRows)
        table.setEditTriggers(QTableWidget.NoEditTriggers)
        table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        table.horizontalHeader().setDefaultAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        table.setMinimumHeight(320)
        for r, row in enumerate(rows):
            for c, value in enumerate(row):
                item = QTableWidgetItem(str(value))
                table.setItem(r, c, item)
        return table

    def _toolbar(self, *buttons):
        bar = QHBoxLayout()
        bar.setSpacing(10)
        for idx, text in enumerate(buttons):
            btn = QPushButton(text)
            if idx == 0:
                btn.setProperty('role', 'primary')
            bar.addWidget(btn)
        bar.addStretch()
        return bar

    def _build_accounts_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(18)

        header = Panel('账号管理', '批量导入、筛选、查看状态和编辑账号备注')
        top = QHBoxLayout()
        top.addLayout(self._toolbar('导入 Session', '批量导入', '检查状态', '启用', '停用', '删除'))
        header.body.addLayout(top)
        filter_row = QHBoxLayout()
        search = QLineEdit(); search.setPlaceholderText('搜索备注名 / 手机号 / session 文件名')
        status = QComboBox(); status.addItems(['全部状态', '正常', '受限', '失效', '需重新登录'])
        filter_row.addWidget(search, 1)
        filter_row.addWidget(status)
        header.body.addLayout(filter_row)
        layout.addWidget(header)

        content = QHBoxLayout()
        content.setSpacing(18)
        rows = [
            ['海棠-A', '+86 138****1201', 'a_01.session', '正常', '今天 21:30'],
            ['海棠-B', '+1 202****4455', 'b_02.session', '受限', '今天 21:25'],
            ['海棠-C', '+81 90****5521', 'c_03.session', '需重新登录', '今天 21:11'],
            ['海棠-D', '+44 77****8123', 'd_04.session', '正常', '今天 20:58'],
        ]
        table_panel = Panel('账号列表')
        table_panel.body.addWidget(self._styled_table(['备注名', '手机号', 'Session', '状态', '最近检查'], rows))
        content.addWidget(table_panel, 2)

        detail = Panel('账号详情', '右侧预览做成信息卡片风格')
        form = QFormLayout()
        form.setLabelAlignment(Qt.AlignLeft)
        form.setFormAlignment(Qt.AlignTop)
        detail_name = QLineEdit('海棠-A')
        phone = QLineEdit('+86 138****1201')
        session = QLineEdit('sessions/a_01.session')
        target = QLineEdit('@example_group')
        for w in [detail_name, phone, session, target]:
            w.setMinimumHeight(42)
        form.addRow('备注名', detail_name)
        form.addRow('手机号', phone)
        form.addRow('Session 路径', session)
        form.addRow('默认目标群', target)
        detail.body.addLayout(form)
        status_card = QFrame(); status_card.setObjectName('Card')
        sc = QVBoxLayout(status_card); sc.setContentsMargins(14, 14, 14, 14)
        sc.addWidget(QLabel('当前状态：正常'))
        note = QLabel('最近结果：可正常发送消息\n最近错误：-\n最近检查：今天 21:30')
        note.setStyleSheet('color:#94a3b8;line-height:1.7;')
        sc.addWidget(note)
        detail.body.addWidget(status_card)
        btn_row = QHBoxLayout()
        save = QPushButton('保存账号信息'); save.setProperty('role', 'primary')
        btn_row.addWidget(save)
        btn_row.addWidget(QPushButton('进入素材配置'))
        btn_row.addWidget(QPushButton('进入定时规则'))
        detail.body.addLayout(btn_row)
        detail.body.addStretch()
        content.addWidget(detail, 1)
        layout.addLayout(content)
        return page

    def _build_materials_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(18)
        top = Panel('素材配置', '每个账号可以独立维护文案池、图片池和内容模式')
        row = QHBoxLayout()
        account = QComboBox(); account.addItems(['海棠-A', '海棠-B', '海棠-C'])
        row.addWidget(QLabel('当前账号'))
        row.addWidget(account)
        row.addStretch()
        row.addLayout(self._toolbar('保存素材配置', '导入文案', '上传图片'))
        top.body.addLayout(row)
        layout.addWidget(top)

        split = QHBoxLayout(); split.setSpacing(18)
        left = Panel('文案池', '支持单条编辑、轮播和随机策略')
        left.body.addWidget(self._styled_table(['序号', '文案摘要', '状态'], [
            ['1', '早安，今日内容已更新，欢迎查看。', '启用'],
            ['2', '今晚 20:00 有新的动态，记得关注。', '启用'],
            ['3', '欢迎加入讨论区，获取更多实时消息。', '停用'],
        ]))
        editor = QTextEdit()
        editor.setPlaceholderText('在这里编辑当前文案内容...')
        editor.setMinimumHeight(180)
        left.body.addWidget(editor)
        mode_row = QHBoxLayout()
        mode_row.addWidget(QLabel('文案模式'))
        mode = QComboBox(); mode.addItems(['顺序轮播', '随机抽取'])
        mode_row.addWidget(mode)
        mode_row.addStretch()
        left.body.addLayout(mode_row)
        split.addWidget(left, 2)

        right = Panel('图片池', '图片和 caption 独立管理，后续可接素材库')
        thumbs = QListWidget()
        for text in ['cover_01.jpg · 默认封面', 'promo_02.png · 晚间海报', 'info_03.jpg · 活动图']:
            QListWidgetItem(text, thumbs)
        thumbs.setMinimumHeight(220)
        right.body.addWidget(thumbs)
        cap = QTextEdit(); cap.setPlaceholderText('这里是图片 caption / 附带描述文案...'); cap.setMinimumHeight(140)
        right.body.addWidget(cap)
        form = QFormLayout()
        img_mode = QComboBox(); img_mode.addItems(['不带图', '固定图片', '随机图片'])
        cover = QComboBox(); cover.addItems(['cover_01.jpg', 'promo_02.png', 'info_03.jpg'])
        form.addRow('图片模式', img_mode)
        form.addRow('默认图片', cover)
        right.body.addLayout(form)
        split.addWidget(right, 1)
        layout.addLayout(split)
        return page

    def _build_rules_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(18)

        header = Panel('定时规则', '把账号、目标群、时间段、条数和素材策略整合到同一页')
        header.body.addLayout(self._toolbar('新增规则', '复制规则', '删除规则', '生成预览'))
        layout.addWidget(header)

        body = QHBoxLayout(); body.setSpacing(18)
        rules_list = Panel('规则列表')
        rules_list.body.addWidget(self._styled_table(['规则名', '账号', '目标群', '时间范围', '状态'], [
            ['早间轮播', '海棠-A', '@alpha_group', '09:00 - 12:00', '启用'],
            ['午间轻推', '海棠-B', '@beta_group', '13:00 - 17:00', '启用'],
            ['晚间图片流', '海棠-A', '@alpha_group', '19:00 - 23:00', '停用'],
        ]))
        body.addWidget(rules_list, 2)

        editor = Panel('规则编辑')
        form = QFormLayout()
        rule_name = QLineEdit('早间轮播')
        acc = QComboBox(); acc.addItems(['海棠-A', '海棠-B'])
        target = QLineEdit('@alpha_group')
        start = QLineEdit('09:00')
        end = QLineEdit('21:00')
        interval = QLineEdit('10')
        daily = QLineEdit('30')
        text_mode = QComboBox(); text_mode.addItems(['顺序轮播', '随机抽取'])
        image_mode = QComboBox(); image_mode.addItems(['不带图', '固定图片', '随机图片'])
        enabled = QCheckBox('启用这条规则'); enabled.setChecked(True)
        for widget in [rule_name, target, start, end, interval, daily]:
            widget.setMinimumHeight(42)
        form.addRow('规则名', rule_name)
        form.addRow('账号', acc)
        form.addRow('目标群 / 频道', target)
        form.addRow('开始时间', start)
        form.addRow('结束时间', end)
        form.addRow('间隔分钟', interval)
        form.addRow('每天条数', daily)
        form.addRow('文案模式', text_mode)
        form.addRow('图片模式', image_mode)
        editor.body.addLayout(form)
        editor.body.addWidget(enabled)
        btns = QHBoxLayout()
        save = QPushButton('保存规则'); save.setProperty('role', 'primary')
        btns.addWidget(save)
        btns.addWidget(QPushButton('清空表单'))
        btns.addStretch()
        editor.body.addLayout(btns)
        body.addWidget(editor, 1)
        layout.addLayout(body)
        return page

    def _build_preview_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(18)
        header = Panel('任务预览', '先生成“今天准备做什么”，后面再决定如何接执行层')
        filter_row = QHBoxLayout()
        for label_text, options in [
            ('日期', ['今天', '明天', '自定义']),
            ('账号', ['全部账号', '海棠-A', '海棠-B']),
            ('状态', ['全部状态', '待生成', '已生成'])
        ]:
            box = QComboBox(); box.addItems(options)
            filter_row.addWidget(QLabel(label_text))
            filter_row.addWidget(box)
        filter_row.addStretch()
        filter_row.addLayout(self._toolbar('生成今日任务', '清空任务', '导出预览'))
        header.body.addLayout(filter_row)
        layout.addWidget(header)

        table = self._styled_table(['时间', '账号', '目标群', '文案摘要', '图片', '状态'], [
            ['09:00', '海棠-A', '@alpha_group', '早安，今日内容已更新...', 'cover_01.jpg', '待生成'],
            ['09:10', '海棠-A', '@alpha_group', '欢迎查看今天的重点...', 'cover_01.jpg', '待生成'],
            ['09:20', '海棠-B', '@beta_group', '中午更新已安排，请关注...', '-', '待生成'],
            ['10:00', '海棠-A', '@alpha_group', '新图片素材准备投放...', 'promo_02.png', '待生成'],
        ])
        panel = Panel('今日任务清单')
        panel.body.addWidget(table)
        layout.addWidget(panel)
        return page

    def _build_logs_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(18)
        panel = Panel('日志中心', '把导入、检查、生成预览等行为统一留痕，后续排障很方便')
        filter_row = QHBoxLayout()
        for label_text, options in [('类型', ['全部类型', '导入', '检查', '规则', '预览']), ('账号', ['全部账号', '海棠-A', '海棠-B'])]:
            combo = QComboBox(); combo.addItems(options)
            filter_row.addWidget(QLabel(label_text))
            filter_row.addWidget(combo)
        filter_row.addStretch()
        filter_row.addLayout(self._toolbar('刷新', '导出日志'))
        panel.body.addLayout(filter_row)
        panel.body.addWidget(self._styled_table(['时间', '账号', '类型', '结果', '详情'], [
            ['2026-05-07 21:30', '海棠-A', '导入', '成功', '导入 a_01.session'],
            ['2026-05-07 21:31', '海棠-A', '检查', '成功', '状态：正常'],
            ['2026-05-07 21:35', '海棠-B', '检查', '失败', '需要重新登录'],
            ['2026-05-07 21:40', '海棠-A', '预览', '成功', '生成 30 条任务'],
        ]))
        layout.addWidget(panel)
        return page

    def _build_settings_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(18)
        settings = Panel('设置', '目录、主题、显示密度这些放这里，做成真正软件的尾部配置区')
        form = QFormLayout()
        paths = {
            '数据目录': 'C:/tg-sender-studio/data',
            'Session 目录': 'C:/tg-sender-studio/sessions',
            '日志目录': 'C:/tg-sender-studio/logs',
            '图片目录': 'C:/tg-sender-studio/images',
        }
        for key, value in paths.items():
            row = QHBoxLayout()
            edit = QLineEdit(value)
            browse = QPushButton('浏览')
            browse.setMaximumWidth(90)
            row.addWidget(edit)
            row.addWidget(browse)
            form.addRow(key, row)
        theme = QComboBox(); theme.addItems(['深色 · 默认', '浅色 · 后续'])
        density = QComboBox(); density.addItems(['舒适', '紧凑'])
        form.addRow('界面主题', theme)
        form.addRow('显示密度', density)
        settings.body.addLayout(form)
        btn = QPushButton('保存设置'); btn.setProperty('role', 'primary')
        settings.body.addWidget(btn, 0, Qt.AlignLeft)
        layout.addWidget(settings)
        return page

    def _set_page(self, index: int):
        self.stack.setCurrentIndex(index)
        for idx, btn in enumerate(self.nav_buttons):
            btn.setProperty('active', idx == index)
            btn.style().unpolish(btn)
            btn.style().polish(btn)


def main():
    app = QApplication(sys.argv)
    app.setStyleSheet(APP_STYLE)
    window = SenderUIDemo()
    window.show()
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
