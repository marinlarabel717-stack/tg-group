window.TG_MATRIX_FEATURES = [
  {
    slug: 'accounts',
    title: '账号管理',
    shortTitle: '账号',
    summary: '集中导入、筛选、状态处理，把账号相关操作收敛到同一工作台。',
    tagline: '先把账号底座理顺，后续所有任务才会顺。',
    preview: './assets/features/accounts.svg',
    badges: ['导入导出', '状态筛选', '批量操作'],
    highlights: [
      '支持统一导入账号并集中查看状态',
      '适合先筛掉冻结、封禁、多 IP 等异常账号',
      '方便后续把健康账号直接分配给群发、私信、采集等模块'
    ],
    tutorial: [
      { title: '导入账号', body: '先把需要处理的账号批量导入到系统里，统一形成基础列表。' },
      { title: '按状态筛选', body: '利用状态筛选把冻结、封禁、双向、超时等账号快速分层。' },
      { title: '执行批量动作', body: '按选中结果做导出、删除、整理或后续任务分配。' }
    ],
    scenarios: ['账号池整理', '批量筛号', '执行前预检']
  },
  {
    slug: 'automation',
    title: '定时群发',
    shortTitle: '定时群发',
    summary: '把固定时间要发送的消息排成计划任务，避免人工盯点。',
    tagline: '适合每天、每周重复执行的发送安排。',
    preview: './assets/features/automation.svg',
    badges: ['计划任务', '固定时点', '结果追踪'],
    highlights: [
      '可集中管理多个发送计划',
      '适合日更通知、活动提醒、固定播报等场景',
      '结合结果记录，方便回看是否按预期执行'
    ],
    tutorial: [
      { title: '新建计划', body: '先设定发送时间、发送目标和任务名称。' },
      { title: '配置内容', body: '填写文案、图片或按钮等素材，确认最终发送内容。' },
      { title: '观察执行结果', body: '任务到点后在结果区查看成功、失败和排队状态。' }
    ],
    scenarios: ['固定通知', '日常播报', '定时活动提醒']
  },
  {
    slug: 'bot-center',
    title: '机器人中心',
    shortTitle: '机器人',
    summary: '把 Bot 配置、菜单入口、连接状态放到统一页面集中管理。',
    tagline: '一个页面看清 Bot 在不在线、菜单配得对不对。',
    preview: './assets/features/bot-center.svg',
    badges: ['Bot 列表', 'Webhook', '菜单配置'],
    highlights: [
      '统一查看多个 Bot 的运行状态',
      '适合维护欢迎语、按钮菜单、连接方式等配置',
      '减少 Bot 配置分散导致的维护成本'
    ],
    tutorial: [
      { title: '查看 Bot 列表', body: '先确认当前有哪些 Bot 已接入、哪些在线、哪些需要维护。' },
      { title: '调整配置', body: '进入对应 Bot 的配置区，更新菜单、欢迎语或连接方式。' },
      { title: '验证可用性', body: '调整后观察状态反馈，确保 Bot 正常对外服务。' }
    ],
    scenarios: ['Bot 运营', '菜单维护', '连接状态巡检']
  },
  {
    slug: 'auto-join',
    title: '极速群发',
    shortTitle: '极速群发',
    summary: '把加群与发送链路统一到一个工作台，支持三种执行模式。',
    tagline: '只加群 / 边加边发 / 加完再发，都在一个入口里完成。',
    preview: './assets/features/auto-join.svg',
    badges: ['模式切换', '内容配置', '结果拆分'],
    highlights: [
      '统一入口处理加群与发送，不再分散配置',
      '支持只加群、边加边发、加完再发三种模式',
      '加群结果与发送结果可以拆开看，更容易复盘'
    ],
    tutorial: [
      { title: '选择执行模式', body: '先决定是只加群、边加边发，还是加完再集中发送。' },
      { title: '配置发送内容', body: '填入文案、本地图片、按钮等内容，确认发送素材。' },
      { title: '查看双结果统计', body: '执行后分别看加群结果和发送结果，方便定位问题。' }
    ],
    scenarios: ['社群扩量', '边加边发转化', '加群后统一触达']
  },
  {
    slug: 'direct-message',
    title: '私信用户',
    shortTitle: '私信',
    summary: '面向点对点消息场景，把用户包、消息模板和发送队列放在一起。',
    tagline: '适合做私聊触达、活动通知和分层消息发送。',
    preview: './assets/features/direct-message.svg',
    badges: ['用户包', '消息模板', '送达统计'],
    highlights: [
      '按用户包组织发送对象，逻辑更清楚',
      '模板化管理消息内容，减少重复录入',
      '送达结果集中回看，便于继续筛选'
    ],
    tutorial: [
      { title: '准备目标用户', body: '先选择或导入要发送的用户包，确认范围。' },
      { title: '选择私信模板', body: '选好文案、图片和按钮内容，保证发送版本一致。' },
      { title: '执行与复盘', body: '发送后查看送达率、失败原因与待重试名单。' }
    ],
    scenarios: ['活动通知', '用户触达', '高意向用户跟进']
  },
  {
    slug: 'proxy-pool',
    title: '代理池',
    shortTitle: '代理池',
    summary: '代理资源集中维护，谁在线、谁超时、谁正在占用都一眼可见。',
    tagline: '资源先理顺，任务执行才稳。',
    preview: './assets/features/proxy-pool.svg',
    badges: ['节点检测', '地区筛选', '占用追踪'],
    highlights: [
      '集中维护代理节点，便于和任务模块联动',
      '可快速识别在线、超时、待检测状态',
      '查看占用情况，避免资源冲突'
    ],
    tutorial: [
      { title: '导入代理', body: '先把代理节点接入列表，按地区或类型做好基础分类。' },
      { title: '做可用性检测', body: '运行检测任务，确认哪些节点在线、哪些需要剔除。' },
      { title: '分配给任务', body: '把稳定节点分配到群发、采集或私信等场景里使用。' }
    ],
    scenarios: ['代理整理', '节点巡检', '任务资源分配']
  },
  {
    slug: 'session-manager',
    title: '采集用户',
    shortTitle: '采集',
    summary: '把采集来源、筛选条件和导出结果放到统一流程里处理。',
    tagline: '先拿到干净数据，后面私信和筛选会轻松很多。',
    preview: './assets/features/session-manager.svg',
    badges: ['来源管理', '筛选规则', '导出结果'],
    highlights: [
      '可针对不同来源创建采集任务',
      '采集后可继续做筛选和导出',
      '适合给后续触达和运营提供基础数据'
    ],
    tutorial: [
      { title: '选择采集来源', body: '确定从群组、频道或搜索结果中获取目标数据。' },
      { title: '设定筛选规则', body: '按你的业务需求定义过滤条件，减少无效数据。' },
      { title: '导出给后续流程', body: '把采集结果导出，继续用于私信、分层或运营任务。' }
    ],
    scenarios: ['用户沉淀', '群组成员采集', '后续营销筛选']
  },
  {
    slug: 'logs',
    title: '日志中心',
    shortTitle: '日志',
    summary: '所有执行结果和异常信息集中回看，方便排障和复盘。',
    tagline: '不是只知道“执行了”，而是看清楚“到底发生了什么”。',
    preview: './assets/features/logs.svg',
    badges: ['成功/警告/错误', '模块筛选', '结果回看'],
    highlights: [
      '把不同模块的日志汇总到一起',
      '按成功、警告、错误快速筛选问题',
      '方便排查执行中断、超时、失败等情况'
    ],
    tutorial: [
      { title: '先看错误级别', body: '优先筛出错误和警告，快速定位关键异常。' },
      { title: '对照模块回查', body: '根据日志里的模块和时间，定位是哪个流程出了问题。' },
      { title: '复盘后继续优化', body: '把高频问题沉淀下来，逐步减少重复故障。' }
    ],
    scenarios: ['排障', '结果复盘', '任务追踪']
  }
]

window.getFeatureBySlug = function getFeatureBySlug(slug) {
  return window.TG_MATRIX_FEATURES.find((item) => item.slug === slug)
}
