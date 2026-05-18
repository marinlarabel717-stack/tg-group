window.TG_MATRIX_FEATURES = [
  {
    slug: 'accounts',
    title: '账号管理',
    shortTitle: '账号',
    summary: '真实软件页面截图已接入，官网里可以直接看到账号管理主页面的实际布局。',
    tagline: '先把账号池整理干净，再做群发、私信和采集，后面的执行才稳。',
    preview: './assets/features-real/accounts.png',
    badges: ['真实页面截图', '状态筛选', '批量操作'],
    highlights: [
      '左侧是模块导航，右侧是账号统计、筛选和列表区。',
      '上方先看数量与状态分布，再进入列表做筛选和批量处理。',
      '即使当前没有数据，页面结构也已经完整可见，适合直接给客户演示。'
    ],
    tutorial: [
      {
        title: '先从左侧进入账号管理',
        body: '打开软件后先点左侧「账号管理」，页面顶部会先显示统计卡片和筛选状态，适合快速判断当前账号池是否健康。',
        image: './assets/features-real/crops/accounts-step1.png',
        points: ['先看总数、冻结、封禁、超时这些关键状态。', '如果要执行群发或私信，先在这里把异常账号排掉。']
      },
      {
        title: '再看顶部筛选和工具栏',
        body: '页面中上部是账号筛选与工具区，后续真实数据接入后，常用动作基本都会从这里发起。',
        image: './assets/features-real/crops/accounts-step2.png',
        points: ['这里适合做状态筛选、批量选择、导入导出。', '官网里用真实截图展示后，别人一眼就能理解软件不是空壳。']
      },
      {
        title: '最后看账号列表结果区',
        body: '下方大表格就是账号结果区，真实使用时会承载账号行、状态标签、地区和后续批量动作。',
        image: './assets/features-real/crops/accounts-step3.png',
        points: ['筛选后的结果最终都在这里落地。', '如果当前为空，也能直观看到页面信息结构。']
      }
    ],
    scenarios: ['账号池整理', '执行前预检', '异常号清洗']
  },
  {
    slug: 'automation',
    title: '定时群发',
    shortTitle: '定时群发',
    summary: '官网已接入定时群发真实页面截图，可以直接展示计划任务界面的实际样子。',
    tagline: '适合固定时间重复发送的业务场景，不用人工盯着发。',
    preview: './assets/features-real/automation.png',
    badges: ['真实页面截图', '计划任务', '时间安排'],
    highlights: [
      '页面核心是计划任务配置区和结果反馈区。',
      '用户能从真实截图中直接理解：这是一个按时间排任务的工作台。',
      '非常适合放在官网里解释“自动执行”能力。'
    ],
    tutorial: [
      {
        title: '先进入定时群发页面',
        body: '点左侧「定时群发」后，先确认当前页面的任务结构和顶部标签，知道这是做“定时任务”而不是即时发送。',
        image: './assets/features-real/crops/automation-step1.png',
        points: ['第一页先讲清入口位置。', '客户看到这里就能知道这是固定时点任务模块。']
      },
      {
        title: '中间区域是任务与内容配置核心',
        body: '中上区域通常用来配置任务名称、执行时间、发送目标和发送内容，是整个模块的主操作区。',
        image: './assets/features-real/crops/automation-step2.png',
        points: ['先定时间，再定内容，再定目标。', '官网可以把这张图配合文案解释成“3步完成计划任务”。']
      },
      {
        title: '底部区域看执行结果和排队情况',
        body: '任务创建后，结果区会承载后续执行反馈，适合回看哪些任务成功、哪些需要补发。',
        image: './assets/features-real/crops/automation-step3.png',
        points: ['适合强调“不是只会发，还能回看结果”。', '更容易建立产品可靠感。']
      }
    ],
    scenarios: ['固定通知', '日常播报', '活动提醒']
  },
  {
    slug: 'bot-center',
    title: '机器人中心',
    shortTitle: '机器人',
    summary: '机器人中心也已换成真实页面截图，适合官网展示 Bot 管理能力。',
    tagline: '把多个 Bot 的配置和运行入口收在一起，维护更省心。',
    preview: './assets/features-real/bot-center.png',
    badges: ['真实页面截图', 'Bot 管理', '集中配置'],
    highlights: [
      '从真实界面能看出：这是一个集中管理 Bot 的独立工作区。',
      '适合解释菜单、欢迎语、连接配置等维护动作。',
      '官网里可以把它定位成“机器人管理中台”。'
    ],
    tutorial: [
      {
        title: '先进入机器人中心',
        body: '从左侧点击「机器人中心」，先让用户看到这是单独的 Bot 管理页面，不和其他任务混在一起。',
        image: './assets/features-real/crops/bot-center-step1.png',
        points: ['入口清晰是官网讲产品的重要一步。', '用户能快速知道 Bot 相关能力集中在哪。']
      },
      {
        title: '中上区域看机器人配置布局',
        body: '页面中上部更适合放机器人列表、连接方式、配置项和快捷操作，是日常维护最常看的区域。',
        image: './assets/features-real/crops/bot-center-step2.png',
        points: ['适合配文解释 Bot 接入和配置逻辑。', '也适合后续补“欢迎语 / 按钮菜单”说明。']
      },
      {
        title: '下方区域承接结果或细项配置',
        body: '页面下部可以继续承接更细的配置、结果反馈或日志，让整个 Bot 管理形成完整闭环。',
        image: './assets/features-real/crops/bot-center-step3.png',
        points: ['官网里这样写，显得产品更完整。', '比只放一句“支持 Bot 管理”更有说服力。']
      }
    ],
    scenarios: ['Bot 运营', '菜单维护', '欢迎语配置']
  },
  {
    slug: 'auto-join',
    title: '极速群发',
    shortTitle: '极速群发',
    summary: '极速群发页面已换成真实软件截图，官网可以直接展示真实工作台。',
    tagline: '只加群 / 边加边发 / 加完再发，统一在一个页面里完成。',
    preview: './assets/features-real/auto-join.png',
    badges: ['真实页面截图', '三种模式', '统一工作台'],
    highlights: [
      '这是 TG-Matrix 当前最有辨识度的核心模块之一。',
      '真实截图能直接体现“顶部页签 + 参数区 + 结果区”的产品结构。',
      '非常适合放在官网里做主打展示。'
    ],
    tutorial: [
      {
        title: '先看极速群发入口和页签',
        body: '进入「极速群发」后，先看顶部结构，理解这是一个围绕加群与发送链路设计的单独工作台。',
        image: './assets/features-real/crops/auto-join-step1.png',
        points: ['先讲清模块定位：不是普通群发，而是加群 + 发送一体化。', '这是官网文案里的核心卖点。']
      },
      {
        title: '中间区域配置模式和内容',
        body: '中间区域适合配置执行模式、文案、本地图片、按钮等内容，是实际操作的主区域。',
        image: './assets/features-real/crops/auto-join-step2.png',
        points: ['先选模式，再配内容。', '后续如果补真实业务数据，这里会更有冲击力。']
      },
      {
        title: '下方区域回看加群和发送结果',
        body: '执行后重点看下方结果区，分别回看加群结果与发送结果，更利于复盘和排障。',
        image: './assets/features-real/crops/auto-join-step3.png',
        points: ['这是官网里解释“结果拆分”的最好位置。', '比单纯写文字更容易让人理解。']
      }
    ],
    scenarios: ['社群扩量', '边加边发转化', '加群后统一触达']
  },
  {
    slug: 'direct-message',
    title: '私信用户',
    shortTitle: '私信',
    summary: '私信用户模块已接入真实软件截图，适合直接展示点对点触达界面。',
    tagline: '把用户包、消息模板和发送队列放到同一页面，更适合持续执行。',
    preview: './assets/features-real/direct-message.png',
    badges: ['真实页面截图', '用户包', '消息模板'],
    highlights: [
      '真实截图能让用户立刻明白这不是聊天窗口，而是批量私信工作台。',
      '适合展示模板化发送、用户包管理和结果追踪。',
      '官网里可以把它归纳成“高效触达模块”。'
    ],
    tutorial: [
      {
        title: '先确认私信用户入口',
        body: '点开「私信用户」后，先让用户知道这是单独处理点对点发送的功能，而不是混在群发页里。',
        image: './assets/features-real/crops/direct-message-step1.png',
        points: ['入口独立，逻辑更清楚。', '官网也更容易解释场景差异。']
      },
      {
        title: '中上区域配置发送对象和模板',
        body: '这里通常对应用户包选择、模板配置和发送参数，是执行前最关键的区域。',
        image: './assets/features-real/crops/direct-message-step2.png',
        points: ['先定人群，再定模板。', '官网可以配成“2步完成私信准备”。']
      },
      {
        title: '下方区域看送达与失败结果',
        body: '执行后结果区会承载送达率、失败原因和待补发名单，便于继续筛选和跟进。',
        image: './assets/features-real/crops/direct-message-step3.png',
        points: ['这部分最适合用来讲“可追踪”。', '不只是能发，还能看清楚发得怎么样。']
      }
    ],
    scenarios: ['活动通知', '用户触达', '高意向跟进']
  },
  {
    slug: 'proxy-pool',
    title: '代理池',
    shortTitle: '代理池',
    summary: '代理池模块已换成真实软件截图，官网可以直接展示代理资源管理界面。',
    tagline: '资源先理顺，后面所有任务执行才会更稳。',
    preview: './assets/features-real/proxy-pool.png',
    badges: ['真实页面截图', '节点状态', '资源管理'],
    highlights: [
      '真实界面很适合展示节点列表、状态检测和占用情况。',
      '官网里能很自然地解释“代理资源集中管理”的价值。',
      '这类页面放真实截图，会比示意图可信很多。'
    ],
    tutorial: [
      {
        title: '先从左侧进入代理池',
        body: '点击「代理池」后，先让用户看到这是一套独立的资源管理页面，不是杂项功能堆在一起。',
        image: './assets/features-real/crops/proxy-pool-step1.png',
        points: ['入口单独存在，说明它在整个产品里有独立价值。', '官网里适合强调“资源底座”。']
      },
      {
        title: '中上区域看代理列表和筛选',
        body: '这里适合展示节点列表、地区、状态和筛选逻辑，是日常维护代理最核心的区域。',
        image: './assets/features-real/crops/proxy-pool-step2.png',
        points: ['方便解释在线、超时、占用这些概念。', '客户也能更快理解软件不是单一功能。']
      },
      {
        title: '下方区域看检测结果和资源分配',
        body: '代理检测、占用情况和后续任务关联，最终都会在页面下部和结果区体现出来。',
        image: './assets/features-real/crops/proxy-pool-step3.png',
        points: ['这块适合讲“执行前先巡检资源”。', '可把代理池和群发/采集串起来说明。']
      }
    ],
    scenarios: ['节点巡检', '代理整理', '任务资源分配']
  },
  {
    slug: 'session-manager',
    title: '采集用户',
    shortTitle: '采集',
    summary: '采集用户模块已经用真实截图替换，适合在官网里展示数据准备能力。',
    tagline: '先把数据拿干净，后面私信、筛选、运营都会顺很多。',
    preview: './assets/features-real/session-manager.png',
    badges: ['真实页面截图', '数据采集', '后续筛选'],
    highlights: [
      '真实截图能看出这个模块是围绕“采集任务”设计的。',
      '适合解释从群组、频道或关键词拿数据的逻辑。',
      '在官网里它能补足“前置数据准备”这条产品线。'
    ],
    tutorial: [
      {
        title: '先看采集用户入口和页签',
        body: '进入「采集用户」后，先看顶部页签结构，理解这里可能按群组、频道、关键词等来源拆分。',
        image: './assets/features-real/crops/session-manager-step1.png',
        points: ['先讲来源，再讲结果。', '页签结构很适合拿来做官网说明。']
      },
      {
        title: '中上区域配置采集来源和规则',
        body: '采集任务真正开始前，重点在这里确定来源、过滤条件和执行方式。',
        image: './assets/features-real/crops/session-manager-step2.png',
        points: ['适合写成“选择来源 → 设定规则 → 开始采集”。', '用户会更容易理解上手流程。']
      },
      {
        title: '下方区域承接采集结果',
        body: '采集完成后，结果区会显示记录、导出结果和后续可复用的数据，便于给私信或运营继续使用。',
        image: './assets/features-real/crops/session-manager-step3.png',
        points: ['很适合解释“前置数据沉淀”的价值。', '也能把采集与私信串联起来。']
      }
    ],
    scenarios: ['用户沉淀', '群组成员采集', '后续营销筛选']
  },
  {
    slug: 'logs',
    title: '日志中心',
    shortTitle: '日志',
    summary: '日志中心也已经替换成真实软件页面截图，官网能直接展示结果追踪能力。',
    tagline: '不是只知道任务执行了，而是要看清楚到底成功了什么、失败了什么。',
    preview: './assets/features-real/logs.png',
    badges: ['真实页面截图', '结果追踪', '异常回看'],
    highlights: [
      '真实截图非常适合讲日志、排障和结果追踪。',
      '它能明显补强官网的“专业度”和“可靠感”。',
      '即使当前没有日志数据，页面结构依然足够说明用途。'
    ],
    tutorial: [
      {
        title: '先进入日志中心',
        body: '从左侧点开「日志中心」，先让用户理解所有任务执行后的结果最终都会回到这里。',
        image: './assets/features-real/crops/logs-step1.png',
        points: ['这个入口本身就能说明产品是可追踪的。', '官网里非常适合当“可靠性证明”。']
      },
      {
        title: '中上区域看筛选和分类结构',
        body: '日志页通常会在上方区分成功、警告、错误或模块来源，让排查路径更清晰。',
        image: './assets/features-real/crops/logs-step2.png',
        points: ['适合配文解释“按模块回看结果”。', '比单纯写一句“支持日志”更有实际感。']
      },
      {
        title: '下方区域回看具体执行结果',
        body: '具体的执行记录、异常提示和后续排查入口，最终都会落在底部结果区。',
        image: './assets/features-real/crops/logs-step3.png',
        points: ['特别适合强调问题可复盘。', '也是官网里体现工程感的好位置。']
      }
    ],
    scenarios: ['排障', '结果复盘', '任务追踪']
  }
]

window.getFeatureBySlug = function getFeatureBySlug(slug) {
  return window.TG_MATRIX_FEATURES.find((item) => item.slug === slug)
}
