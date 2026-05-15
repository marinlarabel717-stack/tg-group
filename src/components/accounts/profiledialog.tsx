import { memo, useEffect, useMemo, useState } from 'react'
import { ImagePlus, Loader2, Sparkles, Trash2, Type, UserRoundPen } from 'lucide-react'
import type { AccountRecord, ProfileOperationAction, ProfileOperationPayload } from '../../types'
import { ResultDialogShell, ResultHero } from './resultdialog'

function readActionLabel(action: ProfileOperationAction | null) {
  switch (action) {
    case 'random-avatar': return '随机生成头像'
    case 'random-nickname': return '随机生成昵称'
    case 'random-username': return '随机生成用户名'
    case 'random-bio': return '随机生成简介'
    case 'custom-avatar': return '自定义头像'
    case 'custom-nickname': return '自定义昵称'
    case 'custom-username': return '自定义用户名'
    case 'custom-bio': return '自定义简介'
    case 'remove-username': return '删除用户名'
    case 'remove-bio': return '删除简介'
    case 'clear-all-profile': return '一键删除资料'
    default: return '个人资料'
  }
}

function readActionIcon(action: ProfileOperationAction | null) {
  if (!action) return <UserRoundPen size={18} />
  if (action.includes('avatar')) return <ImagePlus size={18} />
  if (action.startsWith('remove') || action === 'clear-all-profile') return <Trash2 size={18} />
  if (action.startsWith('random')) return <Sparkles size={18} />
  return <Type size={18} />
}

function readActionTone(action: ProfileOperationAction | null) {
  if (!action) return 'info' as const
  if (action.startsWith('random')) return 'info' as const
  if (action.startsWith('custom')) return 'violet' as const
  if (action.startsWith('remove') || action === 'clear-all-profile') return 'warning' as const
  return 'info' as const
}

function needsTextInput(action: ProfileOperationAction | null) {
  return action === 'custom-nickname' || action === 'custom-username' || action === 'custom-bio'
}

function isTextareaAction(action: ProfileOperationAction | null) {
  return action === 'custom-bio'
}

function needsAvatarInput(action: ProfileOperationAction | null) {
  return action === 'custom-avatar'
}

function readPlaceholder(action: ProfileOperationAction | null) {
  if (action === 'custom-nickname') return '批量改成这个昵称'
  if (action === 'custom-username') return '批量改成这个用户名，不用带 @'
  if (action === 'custom-bio') return '批量改成这个简介'
  return ''
}

function readHint(action: ProfileOperationAction | null) {
  switch (action) {
    case 'random-avatar':
      return '会为每个账号生成一张新的随机色块头像，再直接上传到 Telegram。'
    case 'random-nickname':
      return '会按账号分别生成随机昵称，并在任务完成后统一回写到列表。'
    case 'random-username':
      return '会按账号分别生成新的用户名；如果 Telegram 拒绝，会在日志里写明原因。'
    case 'random-bio':
      return '会为每个账号生成随机简介。'
    case 'custom-avatar':
      return '会把你选中的这张图片批量设为所选账号头像。'
    case 'custom-nickname':
      return '会把所有选中账号的昵称统一改成同一个值。'
    case 'custom-username':
      return '会把所有选中账号的用户名统一改成同一个值。'
    case 'custom-bio':
      return '会把所有选中账号的简介统一改成同一个值。'
    case 'remove-username':
      return '会批量清空所选账号的用户名。'
    case 'remove-bio':
      return '会批量清空所选账号的简介。'
    case 'clear-all-profile':
      return '会批量清空用户名、简介和头像；昵称不会动。'
    default:
      return ''
  }
}

export const ProfileManageDialog = memo(function ProfileManageDialog({
  open,
  action,
  accounts,
  submitting,
  onClose,
  onSubmit
}: {
  open: boolean
  action: ProfileOperationAction | null
  accounts: AccountRecord[]
  submitting: boolean
  onClose: () => void
  onSubmit: (payload: ProfileOperationPayload) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [avatarPath, setAvatarPath] = useState('')
  const [error, setError] = useState('')
  const [pickingAvatar, setPickingAvatar] = useState(false)

  useEffect(() => {
    if (!open) return
    setValue('')
    setAvatarPath('')
    setError('')
    setPickingAvatar(false)
  }, [open, action, accounts])

  const accountPreview = useMemo(() => accounts.slice(0, 4).map((account) => account.phone).filter(Boolean), [accounts])

  if (!open || !action) return null

  const submit = async () => {
    setError('')
    if (needsTextInput(action) && !value.trim()) {
      setError('请先填写要批量更新的内容。')
      return
    }
    if (needsAvatarInput(action) && !avatarPath.trim()) {
      setError('请先选择要上传的头像图片。')
      return
    }

    await onSubmit({
      action,
      accountIds: accounts.map((account) => account.id),
      value: value.trim(),
      avatarPath: avatarPath.trim()
    })
  }

  const pickAvatar = async () => {
    if (!window.desktopAccounts?.pickProfileAvatar) {
      setError('当前环境没有注入头像选择能力。')
      return
    }
    setPickingAvatar(true)
    try {
      const filePath = await window.desktopAccounts.pickProfileAvatar()
      if (filePath) {
        setAvatarPath(filePath)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '选择头像失败，请稍后再试。')
    } finally {
      setPickingAvatar(false)
    }
  }

  return (
    <ResultDialogShell
      open={open}
      onClose={submitting ? () => {} : onClose}
      title={readActionLabel(action)}
      subtitle={`本次会批量处理 ${accounts.length} 个账号`}
      icon={readActionIcon(action)}
      tone={readActionTone(action)}
      maxWidth="max-w-[560px]"
      closable={!submitting}
    >
      <ResultHero label="处理范围" value={`已选 ${accounts.length} 个账号`} tone={readActionTone(action)} />

      <div className="rounded-[14px] bg-panel px-4 py-3 text-sm text-textMuted">
        <div className="text-white">优先处理账号</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {accountPreview.map((phone) => (
            <span key={phone} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">{phone}</span>
          ))}
          {accounts.length > accountPreview.length ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">还有 {accounts.length - accountPreview.length} 个</span>
          ) : null}
        </div>
      </div>

      <div className="rounded-[14px] bg-panel px-4 py-3 text-sm text-textMuted">{readHint(action)}</div>

      {needsTextInput(action) ? (
        <div>
          <div className="mb-2 text-sm text-textMuted">要写入的内容</div>
          {isTextareaAction(action) ? (
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={readPlaceholder(action)}
              className="min-h-[120px] w-full rounded-[12px] border border-white/[0.06] bg-panel px-4 py-3 text-sm text-white outline-none transition focus:border-white/[0.12] focus:bg-hover"
            />
          ) : (
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={readPlaceholder(action)}
              className="h-11 w-full rounded-[12px] border border-white/[0.06] bg-panel px-4 text-sm text-white outline-none transition focus:border-white/[0.12] focus:bg-hover"
            />
          )}
        </div>
      ) : null}

      {needsAvatarInput(action) ? (
        <div className="space-y-3">
          <div className="mb-2 text-sm text-textMuted">头像图片</div>
          <div className="rounded-[14px] border border-white/[0.06] bg-panel px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm text-slate-200">
                <div className="font-medium text-white">{avatarPath ? '已选择图片' : '还没选择图片'}</div>
                <div className="mt-1 truncate text-textMuted">{avatarPath || '支持 png / jpg / jpeg / webp'}</div>
              </div>
              <button
                type="button"
                onClick={() => void pickAvatar()}
                disabled={pickingAvatar}
                className="h-11 rounded-[12px] bg-white/[0.06] px-4 text-sm text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pickingAvatar ? '选择中...' : '选择头像'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[14px] border border-rose-400/18 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={submitting} className="h-11 rounded-[12px] bg-white/[0.05] px-4 text-sm text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40">
          取消
        </button>
        <button type="button" onClick={() => void submit()} disabled={submitting || pickingAvatar} className="flex h-11 items-center justify-center gap-2 rounded-[12px] bg-sky-300 px-4 text-sm font-medium text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
          <span>{submitting ? '提交中...' : '跳转日志中心执行'}</span>
        </button>
      </div>
    </ResultDialogShell>
  )
})
