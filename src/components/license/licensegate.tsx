import { memo, useEffect, useMemo, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { BrandLogo } from '../common/brandlogo'
import { useLicenseStore } from '../../stores/licensestore'

export const LicenseGate = memo(function LicenseGate({ children }: { children: React.ReactNode }) {
  const init = useLicenseStore((state) => state.init)
  const activate = useLicenseStore((state) => state.activate)
  const validate = useLicenseStore((state) => state.validate)
  const state = useLicenseStore((store) => store.state)
  const loading = useLicenseStore((store) => store.loading)
  const activating = useLicenseStore((store) => store.activating)
  const validating = useLicenseStore((store) => store.validating)
  const initialized = useLicenseStore((store) => store.initialized)
  const errorMessage = useLicenseStore((store) => store.errorMessage)
  const lastActionMessage = useLicenseStore((store) => store.lastActionMessage)
  const devBypass = useLicenseStore((store) => store.devBypass)
  const [cardKey, setCardKey] = useState('')
  const [sessionUnlocked, setSessionUnlocked] = useState(false)

  useEffect(() => {
    setSessionUnlocked(false)
    void window.desktopWindow?.setMode('license')
    void init()
  }, [init])

  const canEnter = sessionUnlocked && (state.canEnter || devBypass)

  useEffect(() => {
    void window.desktopWindow?.setMode(canEnter ? 'app' : 'license')
  }, [canEnter])
  const version = state.appVersion || '0.0.0'

  const statusMessage = useMemo(() => {
    if (loading && !initialized) {
      return '正在检查授权状态...'
    }
    if (activating) {
      return '正在验证卡密，请稍候...'
    }
    if (validating) {
      return '正在校验本机授权，请稍候...'
    }
    return ''
  }, [activating, initialized, loading, validating])

  const submitLicense = async () => {
    if (activating || validating || (loading && !initialized)) {
      return
    }

    const normalized = cardKey.trim()
    if (!normalized && state.cardKeyMasked) {
      const result = await validate()
      if (result?.ok) {
        setSessionUnlocked(true)
      }
      return
    }

    const result = await activate(cardKey)
    if (result?.ok) {
      setSessionUnlocked(true)
    }
  }

  if (canEnter) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen items-stretch justify-center bg-[#0f1726] p-3 text-white">
      <div className="relative flex h-full w-full items-center rounded-[24px] border border-white/10 bg-[#121c2d] px-7 py-6 shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
        <button
          type="button"
          onClick={() => void window.desktopWindow?.close()}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg leading-none text-white/80 transition hover:bg-white/[0.08] hover:text-white"
          aria-label="关闭"
        >
          ×
        </button>

        <div className="grid w-full grid-cols-[220px_minmax(0,1fr)] items-center gap-6">
          <div className="flex h-full flex-col justify-center border-r border-white/[0.06] pr-6">
            <BrandLogo
              size={76}
              subtitleClassName="text-white/40"
              titleClassName="text-[30px] text-white"
              taglineClassName="text-white/55"
            />
            <div className="mt-5 text-xs text-textMuted">v{version}</div>
          </div>

          <div className="flex flex-col justify-center">
            <div className="text-sm text-white/70">输入卡密后即可进入软件</div>
            <div className="mt-4 flex items-center gap-3">
              <input
                value={cardKey}
                onChange={(event) => setCardKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !activating && !validating && initialized) {
                    event.preventDefault()
                    void submitLicense()
                  }
                }}
                placeholder="请输入卡密"
                spellCheck={false}
                autoComplete="off"
                className="h-12 min-w-0 flex-1 rounded-[14px] border border-white/10 bg-[#0c1324] px-4 text-white outline-none transition focus:border-sky-400/50"
              />
              <button
                type="button"
                disabled={activating || validating || (loading && !initialized)}
                onClick={() => void submitLicense()}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-sky-500 px-6 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {activating || validating || (loading && !initialized) ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                激活卡密
              </button>
            </div>

            {statusMessage ? <div className="mt-4 rounded-[12px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">{statusMessage}</div> : null}
            {lastActionMessage ? <div className="mt-4 rounded-[12px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{lastActionMessage}</div> : null}
            {errorMessage ? <div className="mt-4 rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
            {!state.apiConfigured ? <div className="mt-4 rounded-[12px] border border-amber-400/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">授权服务地址还没配好，当前默认会先连本机 127.0.0.1:8787。</div> : null}
          </div>
        </div>
      </div>
    </div>
  )
})
