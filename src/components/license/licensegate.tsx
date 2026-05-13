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

    const nextBackground = canEnter ? '#08111f' : 'transparent'
    document.body.style.background = nextBackground
    const root = document.getElementById('root')
    if (root) root.style.background = nextBackground

    return () => {
      document.body.style.background = '#08111f'
      if (root) root.style.background = '#08111f'
    }
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
    <div className="relative h-screen w-screen overflow-hidden bg-transparent text-white">
      <div className="pointer-events-none absolute -left-12 top-[-20px] h-44 w-44 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-28px] right-[-18px] h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />

      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[32px] border border-white/15 bg-[linear-gradient(180deg,rgba(30,41,82,0.68)_0%,rgba(13,20,42,0.78)_100%)] px-6 py-7 shadow-[0_24px_80px_rgba(6,10,24,0.52),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-[22px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(129,140,248,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.15),transparent_32%)]" />

        <button
          type="button"
          onClick={() => void window.desktopWindow?.close()}
          className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-lg leading-none text-white/75 transition hover:bg-white/[0.12] hover:text-white"
          aria-label="关闭"
        >
          ×
        </button>

        <div className="relative z-10 mt-2 flex flex-col items-center text-center">
          <BrandLogo
            size={92}
            title="TG-Matrix"
            className="flex-col gap-4"
            textClassName="text-center"
            titleClassName="bg-[linear-gradient(180deg,#ffffff_0%,#dbeafe_100%)] bg-clip-text text-[32px] font-semibold text-transparent"
          />
        </div>

        <div className="relative z-10 mt-10">
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
            className="h-12 w-full rounded-[16px] border border-white/12 bg-[rgba(10,14,30,0.55)] px-4 text-white placeholder:text-white/34 outline-none backdrop-blur-xl transition focus:border-cyan-300/40 focus:bg-[rgba(10,14,30,0.68)]"
          />

          <button
            type="button"
            disabled={activating || validating || (loading && !initialized)}
            onClick={() => void submitLicense()}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-white/10 bg-[linear-gradient(135deg,#7c3aed_0%,#2563eb_48%,#06b6d4_100%)] px-6 text-sm font-medium text-white shadow-[0_12px_32px_rgba(59,130,246,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {activating || validating || (loading && !initialized) ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            激活卡密
          </button>
        </div>

        {statusMessage ? <div className="relative z-10 mt-4 rounded-[14px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-slate-100 backdrop-blur-xl">{statusMessage}</div> : null}
        {errorMessage ? <div className="relative z-10 mt-4 rounded-[14px] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100 backdrop-blur-xl">{errorMessage}</div> : null}
        {!state.apiConfigured ? <div className="relative z-10 mt-4 rounded-[14px] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50 backdrop-blur-xl">授权服务地址还没配好，当前默认会先连本机 127.0.0.1:8787。</div> : null}
      </div>
    </div>
  )
})
