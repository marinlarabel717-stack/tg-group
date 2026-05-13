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
  const validate = useLicenseStore((state) => state.validate)
  const clear = useLicenseStore((state) => state.clear)
  const enterDevMode = useLicenseStore((state) => state.enterDevMode)
  const state = useLicenseStore((store) => store.state)
  const loading = useLicenseStore((store) => store.loading)
  const activating = useLicenseStore((store) => store.activating)
  const validating = useLicenseStore((store) => store.validating)
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
        <div>
          <div className="text-xs tracking-[0.24em] text-sky-300/80">LICENSE</div>
          <div className="mt-2 text-2xl font-semibold">{title} 授权验证</div>
          <div className="mt-2 text-sm leading-6 text-textMuted">
            软件启动前先验证授权。后面接入卡密服务端后，这里会直接完成激活、有效期检查与更新放行。
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

            <button
              type="button"
              disabled={validating || !state.cardKeyMasked || !state.apiConfigured}
              onClick={() => void validate()}
              className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-white transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {validating ? <Loader2 size={16} className="animate-spin" /> : null}
              重新校验授权
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

        <div className="mt-5 rounded-[16px] border border-white/8 bg-slate-950/25 px-4 py-4 text-sm text-textMuted">
          <div>当前状态：<span className="font-semibold text-white">{statusLabel(state.status)}</span></div>
          <div className="mt-2">已绑卡密：{state.cardKeyMasked || '—'}</div>
          <div className="mt-2">卡密到期时间：{formatDateTimeFull(state.expireAt)}</div>
          <div className="mt-2">设备指纹：<span className="break-all font-mono text-[12px] text-slate-300">{state.machineId || '生成中...'}</span></div>
        </div>

        {lastActionMessage ? <div className="mt-5 rounded-[12px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{lastActionMessage}</div> : null}
        {errorMessage ? <div className="mt-5 rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
      </div>
    </div>
  )
})
