import { useMemo, useState } from 'react'
import { Clock3, FolderSearch2, Hash, RadioTower, SearchCheck } from 'lucide-react'
import { GlassPanel } from '../components/common/glasspanel'
import { moduleLabelMap } from '../lib/ui-text'

type CollectorTabKey = 'groups' | 'channels' | 'keywords' | 'logs'

const tabs: Array<{ key: CollectorTabKey; label: string; icon: typeof SearchCheck }> = [
  { key: 'groups', label: '采集群组', icon: FolderSearch2 },
  { key: 'channels', label: '采集频道', icon: RadioTower },
  { key: 'keywords', label: '采集关键词', icon: Hash },
  { key: 'logs', label: '采集日志', icon: Clock3 }
]

export default function SessionManagerModule() {
  const [activeTab, setActiveTab] = useState<CollectorTabKey>('groups')

  const panel = useMemo(() => {
    if (activeTab === 'groups') {
      return {
        title: '采集群组',
        description: '按群链接、群 ID 或群用户名采集群成员。后面可以继续接群成员过滤、去重和导出。',
        hint: '适合从公开群、已加入群里批量采集用户。'
      }
    }

    if (activeTab === 'channels') {
      return {
        title: '采集频道',
        description: '按频道链接或频道用户名采集频道互动用户。后面可以继续接评论用户、转发互动用户等来源。',
        hint: '适合从频道评论区、互动区沉淀目标用户。'
      }
    }

    if (activeTab === 'keywords') {
      return {
        title: '采集关键词',
        description: '按关键词检索公开来源并收集相关用户。后面可以继续接关键词规则、排除词和来源限定。',
        hint: '适合做行业词、竞品词和需求词用户收集。'
      }
    }

    return {
      title: '采集日志',
      description: '统一查看采集任务进度、结果数量、失败原因和导出记录。后面可以继续接停止任务与清空日志。',
      hint: '适合回看本轮采集结果，确认任务是否完成。'
    }
  }, [activeTab])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = tab.key === activeTab
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 rounded-[14px] border px-4 py-3 text-sm transition ${active ? 'border-white/[0.12] bg-cyan-300/10 text-cyan-200' : 'border-white/[0.06] bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      <GlassPanel className="border border-white/[0.05] bg-panel/92 shadow-none">
        <div className="rounded-[18px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(10,16,30,0.66)_0%,rgba(7,12,24,0.82)_100%)] p-5">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-cyan-300/12 bg-cyan-300/8 text-cyan-200">
              <SearchCheck size={18} />
            </div>
            <div>
              <div className="text-[22px] font-bold text-white">{panel.title}</div>
              <div className="mt-2 max-w-[760px] text-sm leading-6 text-white/64">{panel.description}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[18px] border border-dashed border-white/[0.08] bg-white/[0.03] p-5">
              <div className="text-sm font-medium text-white/88">功能区预留</div>
              <div className="mt-2 text-sm leading-6 text-white/52">
                这里已经切成你要的 4 个顶部 Tab，后面采集群组 / 采集频道 / 采集关键词 / 采集日志 的具体表单和结果表，可以直接往当前页里接，不用再另开分散入口。
              </div>
            </div>

            <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.03] p-5">
              <div className="text-sm font-medium text-white/88">当前页说明</div>
              <div className="mt-2 text-sm leading-6 text-white/52">{panel.hint}</div>
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  )
}
