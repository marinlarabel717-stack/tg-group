window.TG_MATRIX_FEATURES = [
  {
    slug: 'accounts',
    title: '账号管理',
    shortTitle: '账号',
    summary: '账号导入、状态筛选、批量处理集中在同一页面。',
    tagline: '统一管理账号底座，提高后续任务可用性。',
    preview: './assets/features-real/accounts.png',
    badges: ['真实截图', '状态筛选', '批量处理'],
    highlights: [
      '顶部展示账号统计与状态分布。',
      '中部承载筛选与批量操作入口。',
      '底部表格用于结果查看与执行管理。'
    ],
    tutorial: [
      {
        title: '查看状态概览',
        body: '先确认账号总量、冻结、封禁、超时等关键状态。',
        image: './assets/features-real/crops/accounts-step1.png',
        points: ['先判断可用账号规模。', '异常账号先行隔离。']
      },
      {
        title: '执行筛选与批量操作',
        body: '通过顶部工具区完成筛选、选择、导入导出等动作。',
        image: './assets/features-real/crops/accounts-step2.png',
        points: ['先筛选，再执行。', '常用动作集中在同一区域。']
      },
      {
        title: '核对结果列表',
        body: '在结果表格中查看账号明细，并继续执行后续处理。',
        image: './assets/features-real/crops/accounts-step3.png',
        points: ['结果集中展示。', '适合后续分配到其他模块。']
      }
    ],
    scenarios: ['账号整理', '执行前预检', '异常账号清洗']
  },
  {
    slug: 'automation',
    title: '定时群发',
    shortTitle: '定时群发',
    summary: '面向固定时点任务的计划发送页面。',
    tagline: '按计划执行，减少人工重复操作。',
    preview: './assets/features-real/automation.png',
    badges: ['真实截图', '计划任务', '时间调度'],
    highlights: [
      '页面围绕任务计划与内容配置展开。',
      '适合固定时间通知、播报、提醒场景。',
      '结果区用于查看任务执行反馈。'
    ],
    tutorial: [
      {
        title: '建立发送计划',
        body: '先定义任务名称、执行时间和目标范围。',
        image: './assets/features-real/crops/automation-step1.png',
        points: ['明确任务时间。', '明确任务目标。']
      },
      {
        title: '配置发送内容',
        body: '在主操作区填写文案、素材与参数。',
        image: './assets/features-real/crops/automation-step2.png',
        points: ['内容配置集中处理。', '适合标准化任务。']
      },
      {
        title: '查看执行反馈',
        body: '任务执行后，在结果区查看成功、失败与排队状态。',
        image: './assets/features-real/crops/automation-step3.png',
        points: ['支持复盘。', '便于后续补发。']
      }
    ],
    scenarios: ['固定通知', '日常播报', '活动提醒']
  },
  {
    slug: 'bot-center',
    title: '机器人中心',
    shortTitle: '机器人',
    summary: '集中管理 Bot 配置、连接状态与入口。',
    tagline: '将 Bot 维护收敛到统一工作区。',
    preview: './assets/features-real/bot-center.png',
    badges: ['真实截图', 'Bot 管理', '集中配置'],
    highlights: [
      '适合统一维护多个 Bot。',
      '页面承载连接、菜单与基础配置。',
      '便于持续运维与状态核对。'
    ],
    tutorial: [
      {
        title: '进入 Bot 工作区',
        body: '先查看 Bot 列表与当前接入状态。',
        image: './assets/features-real/crops/bot-center-step1.png',
        points: ['入口独立。', '结构清晰。']
      },
      {
        title: '调整核心配置',
        body: '在主区域更新连接方式、菜单或基础参数。',
        image: './assets/features-real/crops/bot-center-step2.png',
        points: ['配置集中。', '便于统一维护。']
      },
      {
        title: '核对结果与状态',
        body: '在页面下部继续检查结果或细项配置。',
        image: './assets/features-real/crops/bot-center-step3.png',
        points: ['适合回看。', '减少配置遗漏。']
      }
    ],
    scenarios: ['Bot 运维', '菜单维护', '欢迎语配置']
  },
  {
    slug: 'auto-join',
    title: '极速群发',
    shortTitle: '极速群发',
    summary: '加群与发送链路整合在同一工作台。',
    tagline: '支持只加群、边加边发、加完再发。',
    preview: './assets/features-real/auto-join.png',
    badges: ['真实截图', '三种模式', '统一工作台'],
    highlights: [
      '顶部用于模式切换。',
      '中部用于内容与参数配置。',
      '下部用于区分加群结果与发送结果。'
    ],
    tutorial: [
      {
        title: '选择执行模式',
        body: '根据业务流程选择只加群、边加边发或加完再发。',
        image: './assets/features-real/crops/auto-join-step1.png',
        points: ['入口统一。', '模式清晰。']
      },
      {
        title: '配置内容与参数',
        body: '在主区域设置文案、图片、按钮和执行参数。',
        image: './assets/features-real/crops/auto-join-step2.png',
        points: ['内容配置集中。', '适合标准化执行。']
      },
      {
        title: '查看双结果反馈',
        body: '执行后分别查看加群结果与发送结果。',
        image: './assets/features-real/crops/auto-join-step3.png',
        points: ['结果拆分展示。', '便于复盘定位。']
      }
    ],
    scenarios: ['社群扩量', '边加边发转化', '加群后统一触达']
  },
  {
    slug: 'direct-message',
    title: '私信用户',
    shortTitle: '私信',
    summary: '围绕用户包、消息模板和发送队列构建的触达页面。',
    tagline: '适合点对点消息触达与跟进。',
    preview: './assets/features-real/direct-message.png',
    badges: ['真实截图', '用户包', '模板发送'],
    highlights: [
      '入口独立，场景边界明确。',
      '中部负责用户与模板配置。',
      '下部负责送达与失败反馈。'
    ],
    tutorial: [
      {
        title: '确定发送对象',
        body: '先选择目标用户包，确认触达范围。',
        image: './assets/features-real/crops/direct-message-step1.png',
        points: ['先定人群。', '再定内容。']
      },
      {
        title: '选择消息模板',
        body: '配置文案、图片、按钮等发送内容。',
        image: './assets/features-real/crops/direct-message-step2.png',
        points: ['模板化处理。', '减少重复录入。']
      },
      {
        title: '查看送达结果',
        body: '在结果区查看送达率、失败原因和后续处理项。',
        image: './assets/features-real/crops/direct-message-step3.png',
        points: ['结果可追踪。', '便于二次筛选。']
      }
    ],
    scenarios: ['活动通知', '用户触达', '高意向跟进']
  },
  {
    slug: 'proxy-pool',
    title: '代理池',
    shortTitle: '代理池',
    summary: '代理资源统一接入、检测与分配。',
    tagline: '为任务执行提供稳定资源基础。',
    preview: './assets/features-real/proxy-pool.png',
    badges: ['真实截图', '节点状态', '资源管理'],
    highlights: [
      '适合统一维护代理节点。',
      '便于查看状态、地区与占用情况。',
      '可与其他执行模块联动使用。'
    ],
    tutorial: [
      {
        title: '进入代理管理页',
        body: '先查看当前节点列表与基础分类。',
        image: './assets/features-real/crops/proxy-pool-step1.png',
        points: ['入口独立。', '资源结构清晰。']
      },
      {
        title: '执行筛选与检测',
        body: '在主区域查看节点状态并执行检测。',
        image: './assets/features-real/crops/proxy-pool-step2.png',
        points: ['在线状态直观。', '便于筛掉异常节点。']
      },
      {
        title: '查看结果与分配',
        body: '根据结果区反馈继续做资源分配和复查。',
        image: './assets/features-real/crops/proxy-pool-step3.png',
        points: ['适合执行前巡检。', '便于任务资源调度。']
      }
    ],
    scenarios: ['节点巡检', '代理整理', '资源分配']
  },
  {
    slug: 'session-manager',
    title: '采集用户',
    shortTitle: '采集',
    summary: '围绕采集来源、规则与结果构建的数据准备页面。',
    tagline: '为后续私信和运营提供可复用数据。',
    preview: './assets/features-real/session-manager.png',
    badges: ['真实截图', '数据采集', '结果沉淀'],
    highlights: [
      '顶部页签区分不同采集来源。',
      '中部用于规则与任务配置。',
      '下部用于结果查看与导出。'
    ],
    tutorial: [
      {
        title: '选择采集入口',
        body: '先确认是从群组、频道还是关键词开始采集。',
        image: './assets/features-real/crops/session-manager-step1.png',
        points: ['来源先行。', '流程清晰。']
      },
      {
        title: '配置采集规则',
        body: '在主区域设置来源条件、过滤规则和执行方式。',
        image: './assets/features-real/crops/session-manager-step2.png',
        points: ['规则集中配置。', '便于标准化执行。']
      },
      {
        title: '输出采集结果',
        body: '在结果区回看记录并继续导出给后续流程使用。',
        image: './assets/features-real/crops/session-manager-step3.png',
        points: ['结果可复用。', '便于后续触达。']
      }
    ],
    scenarios: ['用户沉淀', '成员采集', '营销筛选']
  },
  {
    slug: 'logs',
    title: '日志中心',
    shortTitle: '日志',
    summary: '集中查看任务结果、异常信息与执行记录。',
    tagline: '结果可回看，问题可定位。',
    preview: './assets/features-real/logs.png',
    badges: ['真实截图', '结果追踪', '异常回看'],
    highlights: [
      '日志页集中承接执行反馈。',
      '适合按模块或状态回看结果。',
      '可用于复盘和排障。'
    ],
    tutorial: [
      {
        title: '进入日志中心',
        body: '先进入日志页，确认所有任务反馈都在此集中查看。',
        image: './assets/features-real/crops/logs-step1.png',
        points: ['入口清晰。', '结构统一。']
      },
      {
        title: '查看筛选结构',
        body: '通过上方筛选区按模块或状态定位目标记录。',
        image: './assets/features-real/crops/logs-step2.png',
        points: ['定位更快。', '适合问题回查。']
      },
      {
        title: '核对执行记录',
        body: '在结果区查看具体执行结果和异常提示。',
        image: './assets/features-real/crops/logs-step3.png',
        points: ['便于复盘。', '支持后续处理。']
      }
    ],
    scenarios: ['排障', '结果复盘', '任务追踪']
  }
]

window.getFeatureBySlug = function getFeatureBySlug(slug) {
  return window.TG_MATRIX_FEATURES.find((item) => item.slug === slug)
}
