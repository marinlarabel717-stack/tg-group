import { CheckCircle2, Image as ImageIcon, PlusSquare, Search, SquareTerminal, StopCircle, Type, X } from 'lucide-react'
import { memo, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { GlassPanel } from '../common/glasspanel'
import { ConfigRow, FoldSection, NumberRangeField, SOFT_INPUT_CLASS, SOFT_TAB_CLASS } from '../common/settings-ui'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from '../accounts/resultdialog'
import { AccountPickerDialog } from '../accounts/accountpickerdialog'
import { useAccountStore } from '../../stores/accountstore'
import { getAccountTaskMeta, useAccountTaskStatusMap } from '../../lib/account-task-status'
import { formatAccountStatus } from '../../lib/ui-text'
import { useBatchCreateStore } from '../../stores/batchcreatestore'

function PostTypeTabs({ value, onChange }: { value: 'none' | 'text' | 'photo'; onChange: (value: 'none' | 'text' | 'photo') => void }) {
  const items = [
    { value: 'none' as const, label: '不发首帖', icon: SquareTerminal },
    { value: 'text' as const, label: '纯文字', icon: Type },
    { value: 'photo' as const, label: '图文', icon: ImageIcon }
  ]

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const Icon = item.icon
        const active = value === item.value
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`inline-flex h-10 items-center gap-2 rounded-[12px] px-4 text-sm ${SOFT_TAB_CLASS} ${active ? 'border-white/[0.12] bg-violet-400/10 text-violet-200' : 'bg-card text-slate-200 hover:border-white/[0.09] hover:bg-white/[0.03]'}`}
          >
            <Icon size={15} />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}


function readAccountLabel(account: { id: number; username?: string; phone?: string; userId?: string; profile?: Record<string, unknown> }) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (account.username?.trim()) return account.username.trim()
  if (account.phone?.trim()) return account.phone.trim()
  if (account.userId?.trim()) return account.userId.trim()
  return `账号#${account.id}`
}

const TasksWorkbench = memo(function TasksWorkbench() {
  const initAccounts = useAccountStore((state) => state.init)
  const accounts = useAccountStore((state) => state.accounts)
  const loading = useAccountStore((state) => state.loading)
  const accountTaskStatusMap = useAccountTaskStatusMap()

  const init = useBatchCreateStore((state) => state.init)
  const selectedAccountIds = useBatchCreateStore((state) => state.selectedAccountIds)
  const setSelectedAccountIds = useBatchCreateStore((state) => state.setSelectedAccountIds)
  const createMode = useBatchCreateStore((state) => state.createMode)
  const setCreateMode = useBatchCreateStore((state) => state.setCreateMode)
  const countPerAccount = useBatchCreateStore((state) => state.countPerAccount)
  const setCountPerAccount = useBatchCreateStore((state) => state.setCountPerAccount)
  const createIntervalMin = useBatchCreateStore((state) => state.createIntervalMin)
  const createIntervalMax = useBatchCreateStore((state) => state.createIntervalMax)
  const setCreateIntervalMin = useBatchCreateStore((state) => state.setCreateIntervalMin)
  const setCreateIntervalMax = useBatchCreateStore((state) => state.setCreateIntervalMax)
  const autoWaitOnFlood = useBatchCreateStore((state) => state.autoWaitOnFlood)
  const setAutoWaitOnFlood = useBatchCreateStore((state) => state.setAutoWaitOnFlood)
  const titleTemplate = useBatchCreateStore((state) => state.titleTemplate)
  const setTitleTemplate = useBatchCreateStore((state) => state.setTitleTemplate)
  const aboutTemplate = useBatchCreateStore((state) => state.aboutTemplate)
  const setAboutTemplate = useBatchCreateStore((state) => state.setAboutTemplate)
  const usernameTemplate = useBatchCreateStore((state) => state.usernameTemplate)
  const setUsernameTemplate = useBatchCreateStore((state) => state.setUsernameTemplate)
  const randomTitleEnabled = useBatchCreateStore((state) => state.randomTitleEnabled)
  const setRandomTitleEnabled = useBatchCreateStore((state) => state.setRandomTitleEnabled)
  const randomAboutEnabled = useBatchCreateStore((state) => state.randomAboutEnabled)
  const setRandomAboutEnabled = useBatchCreateStore((state) => state.setRandomAboutEnabled)
  const randomUsernameEnabled = useBatchCreateStore((state) => state.randomUsernameEnabled)
  const setRandomUsernameEnabled = useBatchCreateStore((state) => state.setRandomUsernameEnabled)
  const randomLength = useBatchCreateStore((state) => state.randomLength)
  const setRandomLength = useBatchCreateStore((state) => state.setRandomLength)
  const postType = useBatchCreateStore((state) => state.postType)
  const setPostType = useBatchCreateStore((state) => state.setPostType)
  const postText = useBatchCreateStore((state) => state.postText)
  const setPostText = useBatchCreateStore((state) => state.setPostText)
  const postImageData = useBatchCreateStore((state) => state.postImageData)
  const setPostImageData = useBatchCreateStore((state) => state.setPostImageData)
  const running = useBatchCreateStore((state) => state.running)
  const stopping = useBatchCreateStore((state) => state.stopping)
  const lastActionMessage = useBatchCreateStore((state) => state.lastActionMessage)
  const errorMessage = useBatchCreateStore((state) => state.errorMessage)
  const tasks = useBatchCreateStore((state) => state.tasks)
  const startTask = useBatchCreateStore((state) => state.startTask)
  const stopTask = useBatchCreateStore((state) => state.stopTask)

  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    void initAccounts()
    init()
  }, [initAccounts, init])

  const selectedAccounts = useMemo(() => accounts.filter((account) => selectedAccountIds.includes(account.id)), [accounts, selectedAccountIds])
  const totalWillCreate = selectedAccountIds.length * countPerAccount * (createMode === 'both' ? 2 : 1)

  const applyPicker = (ids: number[]) => {
    setSelectedAccountIds(ids.filter((id) => !getAccountTaskMeta(accountTaskStatusMap, id).occupied))
    setPickerOpen(false)
  }

  const handlePostImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setPostImageData(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <FoldSection title="基础配置" hint="每个参数一行，需要时再展开改，不再堆一屏按钮。">
              <ConfigRow label="选择账号" hint="点右侧按钮挑选要拿来创建的账号。">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-white">已选 {selectedAccountIds.length} 个账号</div>
                  <button type="button" disabled={running || stopping} onClick={() => setPickerOpen(true)} className="rounded-[12px] bg-white/[0.05] px-4 py-2 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60">选择账号</button>
                </div>
              </ConfigRow>

              <ConfigRow label="创建类型" hint="公开群组、公开频道，或两种都建。">
                <select value={createMode} onChange={(event) => setCreateMode(event.target.value as typeof createMode)} disabled={running || stopping} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}>
                  <option value="group" className="bg-white text-slate-950">公开群组</option>
                  <option value="channel" className="bg-white text-slate-950">公开频道</option>
                  <option value="both" className="bg-white text-slate-950">两种都建</option>
                </select>
              </ConfigRow>

              <ConfigRow label="单号创建数量" hint="每个账号本轮要创建多少个公开目标。">
                <input type="number" min={1} max={50} value={countPerAccount} onChange={(event) => setCountPerAccount(Number(event.target.value) || 1)} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
              </ConfigRow>

              <NumberRangeField label="每次创建间隔" minValue={createIntervalMin} maxValue={createIntervalMax} onMinChange={setCreateIntervalMin} onMaxChange={setCreateIntervalMax} min={0} max={600} />

              <ConfigRow label="创建频繁自动等待" hint="Telegram 明确要求等多久，就按它要求的时间继续。">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{autoWaitOnFlood ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={autoWaitOnFlood} onChange={(event) => setAutoWaitOnFlood(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="预计创建" hint="按当前账号数和类型算出来的总量。">
                <div className="text-sm font-medium text-white">{totalWillCreate} 个</div>
              </ConfigRow>
            </FoldSection>

            <div className="mt-4" />

            <FoldSection title="自定义数据" hint="关闭随机后，就按你填写的数据创建；支持一行一个顺序取用，不会偷偷给自定义值补 accountId 或 index。" defaultOpen>
              <ConfigRow label="群名 / 频道名" hint="支持多行输入，一行一个。创建时会按顺序依次取用；占位符可选，不强制。" wide>
                <textarea
                  value={titleTemplate}
                  onChange={(event) => setTitleTemplate(event.target.value)}
                  rows={4}
                  placeholder={`例如：品牌交流群1\n品牌交流群2\n品牌交流群3`}
                  className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`}
                />
              </ConfigRow>

              <ConfigRow label="公开链接" hint="支持多行输入，一行一个。创建时会按顺序依次取用；不够时再回退到默认规则。" wide>
                <textarea
                  value={usernameTemplate}
                  onChange={(event) => setUsernameTemplate(event.target.value)}
                  rows={4}
                  placeholder={`例如：brandgroup01\nbrandgroup02\nbrandgroup03`}
                  className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`}
                />
              </ConfigRow>

              <ConfigRow label="简介" hint="不勾随机时，默认直接用这里的简介。" wide>
                <textarea value={aboutTemplate} onChange={(event) => setAboutTemplate(event.target.value)} rows={4} placeholder="例如：欢迎加入品牌交流群" className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`} />
              </ConfigRow>

              <ConfigRow label="随机群名 / 频道名">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{randomTitleEnabled ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={randomTitleEnabled} onChange={(event) => setRandomTitleEnabled(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="随机公开链接">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{randomUsernameEnabled ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={randomUsernameEnabled} onChange={(event) => setRandomUsernameEnabled(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="随机简介">
                <label className="flex items-center justify-end gap-3 text-sm text-slate-200">
                  <span>{randomAboutEnabled ? '已开启' : '已关闭'}</span>
                  <input type="checkbox" checked={randomAboutEnabled} onChange={(event) => setRandomAboutEnabled(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                </label>
              </ConfigRow>

              <ConfigRow label="随机位数" hint="只有启用随机群名或随机公开链接时才会用到。">
                <input type="number" min={4} max={24} value={randomLength} onChange={(event) => setRandomLength(Number(event.target.value) || 8)} className={`h-10 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`} />
              </ConfigRow>

              <div className="rounded-[14px] bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                支持公开群组 / 公开频道。群名和公开链接现在都支持一行一个顺序取用；若公开链接撞名，系统只会在重试时补随机后缀，不会在第一次创建时私自改你的自定义值。
              </div>
            </FoldSection>

            <div className="mt-4" />

            <FoldSection title="创建频道后自动发首帖" hint="只对新建频道生效；群组不会自动发这条首帖。" defaultOpen>
              <ConfigRow label="post 类型" hint="可以不发、发纯文字，或发图文首帖。">
                <PostTypeTabs value={postType} onChange={setPostType} />
              </ConfigRow>

              {postType !== 'none' ? (
                <>
                  <ConfigRow label="发送文案" hint="创建频道成功后，马上把这段内容发出去。" wide>
                    <textarea
                      value={postText}
                      onChange={(event) => setPostText(event.target.value)}
                      rows={5}
                      placeholder="例如：欢迎来到频道，这里是首条公告。"
                      className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`}
                    />
                  </ConfigRow>

                  {postType === 'photo' ? (
                    <ConfigRow label="首帖图片" hint="上传本地图片；创建频道后会按图文消息发出去。" wide>
                      <div className="space-y-3">
                        <label className="inline-flex h-10 cursor-pointer items-center rounded-[12px] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.08]">
                          选择图片
                          <input type="file" accept="image/*" className="hidden" onChange={handlePostImageUpload} />
                        </label>
                        <div className="flex items-center justify-between rounded-[12px] bg-black/10 px-4 py-3 text-xs text-textMuted">
                          <span>{postImageData ? '已选择首帖图片' : '暂未选择图片'}</span>
                          {postImageData ? <button type="button" onClick={() => setPostImageData('')} className="text-white transition hover:text-rose-200">删除</button> : null}
                        </div>
                        {postImageData ? <img src={postImageData} alt="首帖预览" className="max-h-[220px] rounded-[14px] border border-white/8 object-contain" /> : null}
                      </div>
                    </ConfigRow>
                  ) : null}
                </>
              ) : null}
            </FoldSection>
          </GlassPanel>
        </div>

        <div className="space-y-5">
          <GlassPanel className="bg-card">
            <div className="text-base font-semibold text-white">任务操作</div>
            <div className="mt-3 space-y-3 text-sm text-textMuted">
              <div className="rounded-[14px] bg-panel/70 px-4 py-3">当前会创建 <span className="text-white">公开</span> 群/频道，不走私密链接。</div>
              <div className="rounded-[14px] bg-panel/70 px-4 py-3">若公开链接撞名，系统会自动换几次随机后缀再试。</div>
            </div>

            <div className="mt-4 grid gap-3">
              <button type="button" disabled={running || stopping || selectedAccountIds.length === 0} onClick={() => void startTask()} className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-violet-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                <PlusSquare size={16} />
                开始批量创建
              </button>
              <button type="button" disabled={!running || stopping} onClick={() => void stopTask()} className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-rose-400/12 px-4 py-3 text-sm font-medium text-rose-200 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-60">
                <StopCircle size={16} />
                {stopping ? '正在停止' : '停止任务'}
              </button>
            </div>

            <div className="mt-4 rounded-[16px] bg-panel/70 px-4 py-4 text-sm">
              <div className="text-xs tracking-[0.18em] text-textMuted">当前状态</div>
              <div className="mt-2 text-white">{lastActionMessage || '这里会显示最新执行状态。'}</div>
              {errorMessage ? <div className="mt-3 rounded-[12px] bg-rose-400/10 px-3 py-3 text-rose-200">{errorMessage}</div> : null}
            </div>

          </GlassPanel>

          <GlassPanel className="bg-card">
            <div className="text-base font-semibold text-white">已选账号</div>
            <div className="mt-3 space-y-2">
              {selectedAccounts.length === 0 ? <div className="rounded-[14px] bg-panel/70 px-4 py-4 text-sm text-textMuted">还没选账号。</div> : selectedAccounts.map((account) => (
                <div key={account.id} className="rounded-[14px] bg-panel/70 px-4 py-3">
                  <div className="text-sm text-white">{readAccountLabel(account)}</div>
                  <div className="mt-1 text-xs text-textMuted">{formatAccountStatus(account.status, account.profile?.check_error as string | undefined, account.profile?.check_mode as 'account-status' | 'account-survival' | null | undefined)}</div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
      </div>

      <AccountPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={accounts}
        loading={loading}
        selectedIds={selectedAccountIds}
        title="选择创建账号"
        subtitle="直接按群组成员邀请那套表格来选，筛完后在顶部确认。"
        confirmText="确认选择账号"
        onConfirm={applyPicker}
        resolveBusyMeta={(account) => {
          const taskMeta = getAccountTaskMeta(accountTaskStatusMap, account.id)
          return { busy: taskMeta.occupied, label: taskMeta.label, tone: taskMeta.tone }
        }}
      />
    </>
  )
})

export default function BatchCreateView() {
  const taskSnapshots = useBatchCreateStore((state) => state.taskSnapshots)
  const completionDialogTaskId = useBatchCreateStore((state) => state.completionDialogTaskId)
  const closeCompletionDialog = useBatchCreateStore((state) => state.closeCompletionDialog)

  const completionSnapshot = useMemo(() => taskSnapshots.find((item) => item.taskId === completionDialogTaskId) ?? null, [completionDialogTaskId, taskSnapshots])

  return (
    <>
      <TasksWorkbench />

      <ResultDialogShell
        open={Boolean(completionSnapshot)}
        onClose={closeCompletionDialog}
        title={completionSnapshot?.stopped ? '批量创建任务已停止' : '批量创建任务完成'}
        subtitle={completionSnapshot?.message || '这轮任务已经结束。'}
        icon={<CheckCircle2 size={18} />}
        tone={completionSnapshot?.stopped ? 'warning' : 'success'}
        maxWidth="max-w-[560px]"
      >
        <ResultHero label={completionSnapshot?.stopped ? '本轮已停止' : '本轮已完成'} value={`${completionSnapshot?.completed || 0} / ${completionSnapshot?.total || 0}`} tone={completionSnapshot?.stopped ? 'warning' : 'success'} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ResultStatCard label="成功" value={completionSnapshot?.successCount || 0} tone="success" />
          <ResultStatCard label="失败" value={completionSnapshot?.failedCount || 0} tone="danger" />
          <ResultStatCard label="公开群组" value={completionSnapshot?.groupCount || 0} tone="cyan" />
          <ResultStatCard label="公开频道" value={completionSnapshot?.channelCount || 0} tone="violet" />
        </div>
        <ResultPrimaryButton label="知道了" onClick={closeCompletionDialog} tone={completionSnapshot?.stopped ? 'warning' : 'success'} />
      </ResultDialogShell>
    </>
  )
}
