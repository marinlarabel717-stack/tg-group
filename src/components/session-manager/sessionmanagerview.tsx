import { useMemo, useState } from 'react'
import { AlertTriangle, MessageSquare, Trash2, UserMinus, LogOut, Play } from 'lucide-react'
import { AccountPickerDialog } from '../accounts/accountpickerdialog'
import { ConfigRow, FoldSection, SOFT_INPUT_CLASS } from '../common/settings-ui'
import { GlassPanel } from '../common/glasspanel'
import { useAccountStore } from '../../stores/accountstore'
import { getAccountTaskMeta, useAccountTaskStatusMap } from '../../lib/account-task-status'
import type { SessionManagerActionKind, SessionManagerActionResult } from '../../types'

const actions: Array<{ key: SessionManagerActionKind; label: string; icon: typeof Trash2; hint: string; targetHint: string }> = [
  {
    key: 'delete-messages',
    label: '删除消息',
    icon: MessageSquare,
    hint: '按消息 ID 删除指定消息。适合清理单条或多条消息。',
    targetHint: '目标支持 @username / t.me/xxx / 群链接 / 手机号。'
  },
  {
    key: 'delete-dialog',
    label: '删除对话',
    icon: Trash2,
    hint: '仅删除当前账号侧的会话入口，不强制撤回历史。',
    targetHint: '目标支持私聊、群组、频道。'
  },
  {
    key: 'clear-history',
    label: '删除聊天记录',
    icon: Trash2,
    hint: '尽量清空该会话聊天记录；Telegram 最终权限以服务端为准。',
    targetHint: '目标支持私聊、群组、频道。'
  },
  {
    key: 'delete-contact',
    label: '删除联系人',
    icon: UserMinus,
    hint: '从当前账号联系人里移除指定用户。',
    targetHint: '目标建议填 @username 或手机号。'
  },
  {
    key: 'leave-chat',
    label: '退出群组/频道',
    icon: LogOut,
    hint: '退出指定群组或频道。',
    targetHint: '目标建议填群/频道链接或 @username。'
  }
]

function readAccountLabel(account: { id: number; username?: string; phone?: string; profile?: Record<string, unknown> }) {
  const firstName = typeof account.profile?.first_name === 'string' ? account.profile.first_name.trim() : ''
  const lastName = typeof account.profile?.last_name === 'string' ? account.profile.last_name.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  if (fullName) return fullName
  if (typeof account.username === 'string' && account.username.trim()) return account.username.trim()
  if (typeof account.phone === 'string' && account.phone.trim()) return account.phone.trim()
  return `账号#${account.id}`
}

function tokenizeLines(input: string) {
  return input
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseMessageIds(input: string) {
  return Array.from(new Set(
    input
      .split(/\r?\n|,|，|;|；|\s+/)
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item > 0)
      .map((item) => Math.trunc(item))
  ))
}

function readActionTone(action: SessionManagerActionKind) {
  if (action === 'leave-chat') return 'border-amber-300/20 bg-amber-300/10 text-amber-200'
  if (action === 'delete-contact') return 'border-sky-300/20 bg-sky-400/10 text-sky-200'
  return 'border-rose-300/20 bg-rose-400/10 text-rose-200'
}

export function SessionManagerView() {
  const accounts = useAccountStore((state) => state.accounts)
  const loading = useAccountStore((state) => state.loading)
  const accountTaskStatusMap = useAccountTaskStatusMap()

  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [targetInput, setTargetInput] = useState('')
  const [messageIdsInput, setMessageIdsInput] = useState('')
  const [activeAction, setActiveAction] = useState<SessionManagerActionKind>('delete-messages')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SessionManagerActionResult | null>(null)
  const [lastMessage, setLastMessage] = useState('先选账号，再填会话目标。')

  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selectedAccountIds.includes(account.id)),
    [accounts, selectedAccountIds]
  )

  const currentAction = actions.find((item) => item.key === activeAction) || actions[0]
  const parsedTargets = useMemo(() => tokenizeLines(targetInput), [targetInput])
  const parsedMessageIds = useMemo(() => parseMessageIds(messageIdsInput), [messageIdsInput])

  const runAction = async () => {
    if (!window.desktopSessionManager?.runAction) {
      setLastMessage('当前运行环境没有接入会话管理能力。')
      return
    }
    if (selectedAccountIds.length === 0) {
      setLastMessage('请先选择至少一个账号。')
      return
    }
    if (parsedTargets.length === 0) {
      setLastMessage('请先填写至少一个会话/联系人目标。')
      return
    }
    if (activeAction === 'delete-messages' && parsedMessageIds.length === 0) {
      setLastMessage('删除消息前请先填写消息 ID。')
      return
    }

    setSubmitting(true)
    setResult(null)
    setLastMessage('正在执行会话管理操作，请稍候...')
    try {
      const nextResult = await window.desktopSessionManager.runAction({
        action: activeAction,
        accountIds: selectedAccountIds,
        targetRefs: parsedTargets,
        messageIds: activeAction === 'delete-messages' ? parsedMessageIds : []
      })
      setResult(nextResult)
      setLastMessage(nextResult.message)
    } catch (error) {
      setLastMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <GlassPanel className="bg-card">
        <div className="space-y-4">
          <FoldSection title="会话 / 消息管理" hint="集中处理删消息、删对话、删聊天记录、删联系人、退群退频道。">
            <ConfigRow label="选择账号" hint="这些动作都会真实作用到 Telegram，会直接按所选账号执行。">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={submitting}
                className="h-11 w-full rounded-[12px] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                已选 {selectedAccountIds.length} 个账号
              </button>
            </ConfigRow>

            {selectedAccounts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedAccounts.slice(0, 14).map((account) => (
                  <span key={account.id} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
                    {account.phone || readAccountLabel(account)}
                  </span>
                ))}
                {selectedAccounts.length > 14 ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">还有 {selectedAccounts.length - 14} 个</span> : null}
              </div>
            ) : null}

            <ConfigRow label="动作类型" hint="选中后，下方输入说明会跟着变。" wide>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {actions.map((item) => {
                  const Icon = item.icon
                  const active = item.key === activeAction
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveAction(item.key)}
                      className={`rounded-[14px] border px-4 py-3 text-left transition ${active ? readActionTone(item.key) : 'border-white/[0.06] bg-black/10 text-slate-200 hover:border-white/[0.12] hover:bg-white/[0.03]'}`}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Icon size={15} />
                        {item.label}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-textMuted">{item.hint}</div>
                    </button>
                  )
                })}
              </div>
            </ConfigRow>

            <ConfigRow label="目标列表" hint={currentAction.targetHint} wide>
              <textarea
                rows={8}
                value={targetInput}
                onChange={(event) => setTargetInput(event.target.value)}
                placeholder="一行一个，例如：@username\nhttps://t.me/xxx\nhttps://t.me/+inviteHash"
                className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`}
              />
            </ConfigRow>

            {activeAction === 'delete-messages' ? (
              <ConfigRow label="消息 ID" hint="支持逗号、空格、换行分隔。" wide>
                <textarea
                  rows={4}
                  value={messageIdsInput}
                  onChange={(event) => setMessageIdsInput(event.target.value)}
                  placeholder="例如：12345,12346"
                  className={`w-full rounded-[12px] px-3 py-3 ${SOFT_INPUT_CLASS}`}
                />
              </ConfigRow>
            ) : null}

            <div className="rounded-[14px] border border-amber-300/12 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  这些都是直接操作真实 Telegram 会话的动作，执行后不会自动回滚。删对话 / 删聊天记录 / 退群前先确认目标没填错。
                </div>
              </div>
            </div>

            <ConfigRow label="开始执行">
              <button
                type="button"
                onClick={() => void runAction()}
                disabled={submitting}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-violet-300 px-4 text-sm font-medium text-slate-950 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play size={15} />
                {submitting ? '执行中...' : `开始${currentAction.label}`}
              </button>
            </ConfigRow>
          </FoldSection>
        </div>
      </GlassPanel>

      <GlassPanel className="bg-card">
        <div className="space-y-4">
          <div>
            <div className="text-base font-semibold text-white">执行结果</div>
            <div className="mt-2 rounded-[14px] bg-white/[0.04] px-4 py-3 text-sm text-textMuted">{lastMessage}</div>
          </div>

          {result ? (
            <>
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-[14px] bg-panel/80 px-4 py-4">
                  <div className="text-xs tracking-[0.16em] text-textMuted">总操作</div>
                  <div className="mt-2 text-xl font-semibold text-white">{result.total}</div>
                </div>
                <div className="rounded-[14px] bg-panel/80 px-4 py-4">
                  <div className="text-xs tracking-[0.16em] text-textMuted">成功</div>
                  <div className="mt-2 text-xl font-semibold text-emerald-300">{result.successCount}</div>
                </div>
                <div className="rounded-[14px] bg-panel/80 px-4 py-4">
                  <div className="text-xs tracking-[0.16em] text-textMuted">失败</div>
                  <div className="mt-2 text-xl font-semibold text-rose-300">{result.failedCount}</div>
                </div>
              </div>

              <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
                {result.items.map((item, index) => (
                  <div key={`${item.accountId}-${item.targetRef}-${index}`} className={`rounded-[14px] border px-4 py-3 text-sm ${item.success ? 'border-emerald-400/14 bg-emerald-400/8 text-emerald-100' : 'border-rose-400/14 bg-rose-400/8 text-rose-100'}`}>
                    <div className="font-medium">[{item.accountLabel}] → {item.targetRef}</div>
                    <div className="mt-1 text-xs leading-5 opacity-90">{item.message}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-[14px] bg-panel/80 px-4 py-6 text-sm text-textMuted">还没有执行结果。</div>
          )}
        </div>
      </GlassPanel>

      <AccountPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={accounts}
        loading={loading}
        selectedIds={selectedAccountIds}
        title="选择执行账号"
        subtitle="这些动作会直接作用到所选账号的真实会话。"
        confirmText="确认选择账号"
        onConfirm={(ids) => {
          setSelectedAccountIds(ids)
          setPickerOpen(false)
        }}
        resolveBusyMeta={(account) => {
          const taskMeta = getAccountTaskMeta(accountTaskStatusMap, account.id)
          return { busy: taskMeta.occupied, label: taskMeta.label, tone: taskMeta.tone }
        }}
      />
    </div>
  )
}
