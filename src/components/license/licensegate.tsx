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
    <div className="flex h-screen items-center justify-center bg-[#0f1726] p-4 text-white">
      <div className="relative w-full max-w-[420px] rounded-[28px] border border-white/10 bg-[#121c2d] px-6 py-7 shadow-[0_28px_80px_rgba(0,0,0,0.38)]">
        <button
          type="button"
          onClick={() => void window.desktopWindow?.close()}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg leading-none text-white/80 transition hover:bg-white/[0.08] hover:text-white"
          aria-label="关闭"
        >
          ×
        </button>

        <div className="flex flex-col items-center text-center">
          <BrandLogo
            size={92}
            title="TG-Matrix"
            className="flex-col gap-4"
            textClassName="text-center"
            titleClassName="text-[32px] font-semibold text-white"
          />
        </div>

        <div className="mt-8">
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
            className="h-12 w-full rounded-[16px] border border-white/10 bg-[#0c1324] px-4 text-white outline-none transition focus:border-sky-400/50"
          />

          <button
            type="button"
            disabled={activating || validating || (loading && !initialized)}
            onClick={() => void submitLicense()}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-sky-500 px-6 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {activating || validating || (loading && !initialized) ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            激活卡密
          </button>
        </div>

        {statusMessage ? <div className="mt-4 rounded-[14px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">{statusMessage}</div> : null}
        {errorMessage ? <div className="mt-4 rounded-[14px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
        {!state.apiConfigured ? <div className="mt-4 rounded-[14px] border border-amber-400/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">授权服务地址还没配好，当前默认会先连本机 127.0.0.1:8787。</div> : null}
      </div>
    </div>
  )
})
