import { memo, useEffect, useMemo, useState } from 'react'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useLicenseStore } from '../../stores/licensestore'
import { formatDateTimeFull } from '../../lib/ui-text'
import type { DesktopLicenseState } from '../../types'

function statusLabel(status: DesktopLicenseState['status']) {
  if (status === 'valid') return '授权有效'
  if (status === 'grace') return '离线宽限'
  if (status === 'expired') return '授权过期'
  if (status === 'invalid') return '授权无效'
  return '未激活'
}

export const LicenseGate = memo(function LicenseGate({ children }: { children: React.ReactNode }) {
  const init = useLicenseStore((state) => state.init)
  const activate = useLicenseStore((state) => state.activate)
  const clear = useLicenseStore((state) => state.clear)
  const enterDevMode = useLicenseStore((state) => state.enterDevMode)
  const state = useLicenseStore((store) => store.state)
  const loading = useLicenseStore((store) => store.loading)
  const activating = useLicenseStore((store) => store.activating)
  const initialized = useLicenseStore((store) => store.initialized)
  const errorMessage = useLicenseStore((store) => store.errorMessage)
  const lastActionMessage = useLicenseStore((store) => store.lastActionMessage)
  const devBypass = useLicenseStore((store) => store.devBypass)
  const [cardKey, setCardKey] = useState('')

  useEffect(() => {
    void init()
  }, [init])

  const canEnter = state.canEnter || devBypass
  const title = useMemo(() => window.desktopInfo?.appName || 'TG Group', [])

  if (loading && !initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08101d] text-white">
        <div className="flex items-center gap-3 rounded-[16px] border border-white/10 bg-white/5 px-5 py-4">
          <Loader2 className="animate-spin" size={18} />
          正在检查授权状态...
        </div>
      </div>
    )
  }

  if (canEnter) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_34%),#08101d] px-5 py-10 text-white">
      <div className="w-full max-w-[560px] rounded-[24px] border border-white/10 bg-card/95 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.24em] text-sky-300/80">LICENSE</div>
            <div className="mt-2 text-2xl font-semibold">{title} 授权验证</div>
            <div className="mt-2 text-sm leading-6 text-textMuted">
              软件启动前先验证授权。后面接入卡密服务端后，这里会直接完成激活、有效期检查与更新放行。
            </div>
          </div>
          <div className="rounded-[16px] border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-right">
            <div className="text-xs text-textMuted">当前版本</div>
            <div className="mt-1 text-sm font-semibold text-sky-200">v{state.appVersion}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-[16px] bg-panel px-4 py-4">
            <div className="text-xs text-textMuted">授权状态</div>
            <div className="mt-2 text-base font-semibold text-white">{statusLabel(state.status)}</div>
            <div className="mt-2 text-xs text-textMuted">{state.message}</div>
          </div>
          <div className="rounded-[16px] bg-panel px-4 py-4">
            <div className="text-xs text-textMuted">设备标识</div>
            <div className="mt-2 break-all font-mono text-sm text-slate-200">{state.machineId || '生成中...'}</div>
          </div>
        </div>

        <div className="mt-5 rounded-[18px] bg-panel p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <KeyRound size={16} /> 输入卡密
          </div>
          <input
            value={cardKey}
            onChange={(event) => setCardKey(event.target.value)}
            placeholder="请输入卡密，例如 XXXX-XXXX-XXXX"
            className="mt-4 h-12 w-full rounded-[14px] border border-white/10 bg-slate-950/45 px-4 text-white outline-none transition focus:border-sky-400/50"
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={activating}
              onClick={() => void activate(cardKey)}
              className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-sky-500 px-5 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {activating ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              激活授权
            </button>

            <button
              type="button"
              onClick={() => void clear()}
              className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-white transition hover:bg-hover"
            >
              清空本地授权
            </button>

            {state.devBypassAvailable ? (
              <button
                type="button"
                onClick={() => enterDevMode()}
                className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-amber-400/20 bg-amber-400/10 px-5 text-sm font-medium text-amber-200 transition hover:bg-amber-400/20"
              >
                开发模式临时进入
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-[16px] border border-white/8 bg-slate-950/25 px-4 py-4 text-sm text-textMuted">
            <div>已绑定卡密：{state.cardKeyMasked || '—'}</div>
            <div className="mt-2">授权到期：{formatDateTimeFull(state.expireAt)}</div>
            <div className="mt-2">最近校验：{formatDateTimeFull(state.lastValidatedAt)}</div>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-slate-950/25 px-4 py-4 text-sm text-textMuted">
            <div>授权服务：{state.apiConfigured ? '已配置' : '未配置'}</div>
            <div className="mt-2">激活时间：{formatDateTimeFull(state.activatedAt)}</div>
            <div className="mt-2">离线宽限：{formatDateTimeFull(state.offlineGraceUntil)}</div>
          </div>
        </div>

        {lastActionMessage ? <div className="mt-5 rounded-[12px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{lastActionMessage}</div> : null}
        {errorMessage ? <div className="mt-5 rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
      </div>
    </div>
  )
})
