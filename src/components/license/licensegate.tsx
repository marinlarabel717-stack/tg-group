import { memo, useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useLicenseStore } from '../../stores/licensestore'

export const LicenseGate = memo(function LicenseGate({ children }: { children: React.ReactNode }) {
  const init = useLicenseStore((state) => state.init)
  const activate = useLicenseStore((state) => state.activate)
  const clear = useLicenseStore((state) => state.clear)
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
  const version = state.appVersion || '0.0.0'

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
      <div className="relative w-full max-w-[460px] rounded-[24px] border border-white/10 bg-card/95 p-8 shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
        <button
          type="button"
          onClick={() => void window.desktopWindow?.close()}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg leading-none text-white/80 transition hover:bg-white/[0.08] hover:text-white"
          aria-label="关闭"
        >
          ×
        </button>
        <div className="text-center">
          <div className="text-3xl font-semibold tracking-[0.04em] text-white">TGMatrix</div>
        </div>

        <div className="mt-8">
          <input
            value={cardKey}
            onChange={(event) => setCardKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !activating) {
                event.preventDefault()
                void activate(cardKey)
              }
            }}
            placeholder="请输入卡密"
            className="h-12 w-full rounded-[14px] border border-white/10 bg-slate-950/45 px-4 text-white outline-none transition focus:border-sky-400/50"
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={activating}
              onClick={() => void activate(cardKey)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-sky-500 px-5 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {activating ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              激活卡密
            </button>

            <button
              type="button"
              onClick={() => void clear()}
              className="inline-flex h-11 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-white transition hover:bg-hover"
            >
              重置卡密授权
            </button>
          </div>
        </div>

        {lastActionMessage ? <div className="mt-4 rounded-[12px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{lastActionMessage}</div> : null}
        {errorMessage ? <div className="mt-4 rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
        {!state.apiConfigured ? <div className="mt-4 rounded-[12px] border border-amber-400/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">授权服务地址还没配好，当前默认会先连本机 127.0.0.1:8787。</div> : null}
        <div className="mt-8 text-center text-xs text-textMuted">v{version}</div>
      </div>
    </div>
  )
})
