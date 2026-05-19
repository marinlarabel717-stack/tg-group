import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { BrandLogo } from '../common/brandlogo'
import { useLicenseStore } from '../../stores/licensestore'

export const LicenseGate = memo(function LicenseGate({ children }: { children: React.ReactNode }) {
  const dragRegionStyle = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDragRegionStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties
  const init = useLicenseStore((state) => state.init)
  const activate = useLicenseStore((state) => state.activate)
  const state = useLicenseStore((store) => store.state)
  const loading = useLicenseStore((store) => store.loading)
  const activating = useLicenseStore((store) => store.activating)
  const validating = useLicenseStore((store) => store.validating)
  const initialized = useLicenseStore((store) => store.initialized)
  const errorMessage = useLicenseStore((store) => store.errorMessage)
  const devBypass = useLicenseStore((store) => store.devBypass)
  const [cardKey, setCardKey] = useState('')

  useEffect(() => {
    void window.desktopWindow?.setMode('license')
    void init()
  }, [init])

  useEffect(() => {
    setCardKey(state.rememberedCardKey || '')
  }, [state.rememberedCardKey])

  const canEnter = state.canEnter || devBypass

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
    if (!normalized) {
      const result = await activate('')
      if (result?.ok) {
        return
      }
      return
    }

    const result = await activate(normalized)
    if (result?.ok) {
      return
    }
  }

  if (canEnter) {
    return <>{children}</>
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent p-[6px] text-white">
      <div
        className="relative flex h-full w-full flex-col overflow-hidden rounded-[30px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(10,16,30,0.74)_0%,rgba(7,12,24,0.88)_100%)] px-6 py-4 backdrop-blur-[28px]"
        style={dragRegionStyle}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.022),transparent_24%)]" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(186,230,253,0.16),transparent)]" />
        <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-cyan-300/8 blur-3xl" />

        <button
          type="button"
          onClick={() => void window.desktopWindow?.close()}
          className="absolute right-6 top-5 z-20 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/[0.08] bg-slate-950/28 text-lg leading-none text-white/80 transition hover:border-cyan-300/22 hover:bg-cyan-300/8 hover:text-white active:scale-[0.97]"
          style={{ ...noDragRegionStyle, pointerEvents: 'auto' }}
          aria-label="关闭"
        >
          ×
        </button>

        <div className="relative z-10 mt-0.5 flex flex-col items-center text-center">
          <BrandLogo
            size={80}
            title="TG-Matrix"
            className="flex-col gap-3"
            textClassName="text-center"
            titleClassName="bg-[linear-gradient(180deg,#ffffff_0%,#dbeafe_100%)] bg-clip-text text-[29px] font-semibold tracking-[0.01em] text-transparent"
          />
        </div>

        <div className="relative z-10 mt-5 rounded-[22px] bg-[rgba(6,11,22,0.18)] p-0">
          <input
            value={cardKey}
            onChange={(event) => setCardKey(event.target.value)}
            style={noDragRegionStyle}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !activating && !validating && initialized) {
                event.preventDefault()
                void submitLicense()
              }
            }}
            placeholder="请输入卡密"
            spellCheck={false}
            autoComplete="off"
            className="h-12 w-full rounded-[16px] border border-cyan-200/[0.10] bg-[rgba(5,10,22,0.46)] px-4 text-white placeholder:text-white/26 outline-none backdrop-blur-xl transition focus:border-cyan-300/28 focus:bg-[rgba(7,14,28,0.68)] focus:shadow-[0_0_0_1px_rgba(103,232,249,0.06)]"
          />

          <button
            type="button"
            disabled={activating || validating || (loading && !initialized)}
            onClick={() => void submitLicense()}
            style={noDragRegionStyle}
            className="mt-3.5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-cyan-300/[0.14] bg-[linear-gradient(180deg,rgba(19,31,55,0.92)_0%,rgba(9,17,34,0.98)_100%)] px-6 text-sm font-medium text-cyan-50 transition hover:border-cyan-300/24 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {activating || validating || (loading && !initialized) ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} className="text-cyan-300" />}
            激活卡密
          </button>
        </div>

        {statusMessage ? <div className="relative z-10 mt-3 rounded-[14px] border border-white/[0.06] bg-white/[0.04] px-4 py-2.5 text-sm text-slate-100 backdrop-blur-xl">{statusMessage}</div> : null}
        {errorMessage ? <div className="relative z-10 mt-3 rounded-[14px] border border-rose-300/[0.14] bg-rose-400/[0.08] px-4 py-2.5 text-sm text-rose-100 backdrop-blur-xl">{errorMessage}</div> : null}
        {!state.apiConfigured ? <div className="relative z-10 mt-3 rounded-[14px] border border-amber-300/[0.16] bg-amber-300/[0.08] px-4 py-2.5 text-sm text-amber-50 backdrop-blur-xl">授权服务暂未配置完成，请联系技术处理。</div> : null}

        <div className="relative z-10 mt-auto pt-6" style={noDragRegionStyle}>
          <div className="rounded-[16px] border border-white/[0.05] bg-white/[0.03] px-4 py-3 text-center text-[12px] leading-6 text-white/45 backdrop-blur-xl">
            <div>⚠️ 本软件仅供学习测试，请遵守当地法律法规。</div>
            <div>⚠️ 禁止用于任何非法用途，后果由使用者自行承担。</div>
          </div>
        </div>
      </div>
    </div>
  )
})
