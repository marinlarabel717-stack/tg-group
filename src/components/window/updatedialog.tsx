import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, Loader2, RefreshCw, Rocket, TriangleAlert, X } from 'lucide-react'
import type { AppUpdaterState } from '../../types'
import { BrandLogo } from '../common/brandlogo'

const defaultState: AppUpdaterState = {
  status: 'idle',
  currentVersion: window.desktopInfo?.version || '0.0.23',
  availableVersion: null,
  progressPercent: 0,
  transferredBytes: 0,
  totalBytes: 0,
  bytesPerSecond: 0,
  message: '准备检查更新。',
  releaseDate: null
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / (1024 ** index)
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function formatReleaseDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function UpdateDialog() {
  const [state, setState] = useState<AppUpdaterState>(defaultState)
  const [hiddenKey, setHiddenKey] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void window.desktopUpdater?.getState().then((next) => {
      if (active && next) {
        setState(next)
      }
    })

    const unsubscribe = window.desktopUpdater?.onState((next) => {
      setState(next)
    })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    const visibilityKey = `${state.status}:${state.availableVersion || ''}:${state.message}`
    setHiddenKey((current) => (current === visibilityKey ? current : null))
  }, [state.availableVersion, state.message, state.status])

  const visibilityKey = `${state.status}:${state.availableVersion || ''}:${state.message}`
  const open = ['available', 'downloading', 'downloaded', 'error'].includes(state.status) && hiddenKey !== visibilityKey
  const progressValue = Math.max(0, Math.min(100, state.progressPercent))
  const percentText = `${progressValue.toFixed(progressValue >= 10 ? 0 : 1)}%`

  const config = useMemo(() => {
    switch (state.status) {
      case 'available':
        return {
          title: '发现新版本',
          subtitle: '检测到更高版本，可直接在软件内完成更新。',
          icon: <Rocket size={18} />,
          badge: '自动更新',
          iconClassName: 'text-cyan-200',
          badgeClassName: 'border border-cyan-300/16 bg-cyan-300/10 text-cyan-100',
          accentClassName: 'from-cyan-300 via-sky-300 to-blue-400',
          statToneClassName: 'border-cyan-300/14 bg-cyan-300/8 text-cyan-50',
          closable: true
        }
      case 'downloading':
        return {
          title: '正在更新 TG-Matrix',
          subtitle: '更新包下载中，完成后会自动静默安装。',
          icon: <Loader2 size={18} className="animate-spin" />,
          badge: '下载中',
          iconClassName: 'text-sky-200',
          badgeClassName: 'border border-sky-300/16 bg-sky-300/10 text-sky-100',
          accentClassName: 'from-cyan-300 via-sky-300 to-indigo-400',
          statToneClassName: 'border-sky-300/14 bg-sky-300/8 text-sky-50',
          closable: true
        }
      case 'downloaded':
        return {
          title: '正在安装更新',
          subtitle: '更新包已下载完成，软件即将自动重启并安装。',
          icon: <CheckCircle2 size={18} />,
          badge: '即将安装',
          iconClassName: 'text-emerald-200',
          badgeClassName: 'border border-emerald-300/16 bg-emerald-300/10 text-emerald-100',
          accentClassName: 'from-emerald-300 via-cyan-300 to-sky-400',
          statToneClassName: 'border-emerald-300/14 bg-emerald-300/8 text-emerald-50',
          closable: false
        }
      case 'error':
        return {
          title: '更新失败',
          subtitle: '检查或下载更新时出了点问题，可以直接重试。',
          icon: <TriangleAlert size={18} />,
          badge: '需要处理',
          iconClassName: 'text-rose-200',
          badgeClassName: 'border border-rose-300/16 bg-rose-300/10 text-rose-100',
          accentClassName: 'from-rose-300 via-orange-300 to-amber-300',
          statToneClassName: 'border-rose-300/14 bg-rose-300/8 text-rose-50',
          closable: true
        }
      default:
        return null
    }
  }, [state.status])

  if (!config || !open) return null

  const handleClose = () => {
    setHiddenKey(visibilityKey)
  }

  const handleDownload = () => {
    void window.desktopUpdater?.downloadUpdate()
  }

  const handleRetry = () => {
    void window.desktopUpdater?.checkForUpdates()
  }

  const handleInstall = () => {
    void window.desktopUpdater?.quitAndInstall()
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-start justify-center px-5 pt-12 pb-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_44%),linear-gradient(180deg,rgba(2,6,23,0.06),rgba(2,6,23,0.32))]" />

      <div className="pointer-events-auto relative w-full max-w-[520px] rounded-[34px] p-[1px]">
        <div className="relative overflow-hidden rounded-[34px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(10,16,30,0.84)_0%,rgba(7,12,24,0.94)_100%)] px-6 py-5 text-white backdrop-blur-[30px]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_28%)]" />
          <div className={`pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r ${config.accentClassName} opacity-60`} />
          <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-cyan-300/8 blur-3xl" />

          {config.closable ? (
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-5 top-5 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/34 text-white/80 transition hover:border-cyan-300/24 hover:bg-cyan-300/10 hover:text-white"
              aria-label="关闭更新提示"
            >
              <X size={16} />
            </button>
          ) : null}

          <div className="relative z-10 flex items-start justify-between gap-4 pr-12">
            <div className="min-w-0">
              <BrandLogo
                size={44}
                title="TG-Matrix"
                className="items-center gap-3"
                textClassName="text-left"
                titleClassName="bg-[linear-gradient(180deg,#ffffff_0%,#dbeafe_100%)] bg-clip-text text-[24px] font-semibold tracking-[0.01em] text-transparent"
              />
              <div className="mt-4 flex items-center gap-2">
                <div className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/6 ${config.iconClassName}`}>
                  {config.icon}
                </div>
                <span className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-medium ${config.badgeClassName}`}>
                  {config.badge}
                </span>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-5">
            <div className="text-[24px] font-semibold tracking-[0.01em] text-white">{config.title}</div>
            <div className="mt-2 text-sm leading-6 text-white/64">{config.subtitle}</div>
          </div>

          <div className="relative z-10 mt-5 rounded-[24px] border border-white/[0.05] bg-[rgba(6,11,22,0.46)] p-4 backdrop-blur-xl">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/34">更新进度</div>
                <div className="mt-2 text-[30px] font-semibold leading-none text-white">{percentText}</div>
              </div>
              <div className="text-right text-sm text-white/52">
                <div>{state.currentVersion} → {state.availableVersion || state.currentVersion}</div>
                <div className="mt-1">发布时间：{formatReleaseDate(state.releaseDate)}</div>
              </div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${config.accentClassName} transition-all duration-300`}
                style={{ width: `${progressValue}%` }}
              />
            </div>

            <div className="mt-3 text-sm text-white/70">{state.message}</div>
          </div>

          <div className="relative z-10 mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.04] px-4 py-3">
              <div className="text-xs text-white/38">当前版本</div>
              <div className="mt-1 text-sm font-medium text-white">{state.currentVersion}</div>
            </div>
            <div className={`rounded-[18px] px-4 py-3 ${config.statToneClassName}`}>
              <div className="text-xs text-white/48">新版本</div>
              <div className="mt-1 text-sm font-medium text-white">{state.availableVersion || '—'}</div>
            </div>
            <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.04] px-4 py-3">
              <div className="text-xs text-white/38">已下载</div>
              <div className="mt-1 text-sm font-medium text-white">{formatBytes(state.transferredBytes)}</div>
            </div>
            <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.04] px-4 py-3">
              <div className="text-xs text-white/38">下载速度</div>
              <div className="mt-1 text-sm font-medium text-white">{`${formatBytes(state.bytesPerSecond)}/s`}</div>
            </div>
          </div>

          <div className="relative z-10 mt-5 flex flex-col gap-3">
            {state.status === 'available' ? (
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-cyan-300/16 bg-[linear-gradient(180deg,rgba(19,31,55,0.98)_0%,rgba(9,17,34,1)_100%)] text-sm font-medium text-cyan-50 transition hover:border-cyan-300/28"
              >
                <Download size={16} className="text-cyan-300" />
                自动更新
              </button>
            ) : null}

            {state.status === 'error' ? (
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-rose-300/16 bg-rose-300/10 text-sm font-medium text-rose-100 transition hover:border-rose-300/24 hover:bg-rose-300/14"
              >
                <RefreshCw size={16} />
                重新检查更新
              </button>
            ) : null}

            {state.status === 'downloaded' ? (
              <button
                type="button"
                onClick={handleInstall}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-emerald-300/16 bg-emerald-300/10 text-sm font-medium text-emerald-50 transition hover:border-emerald-300/24 hover:bg-emerald-300/14"
              >
                <Download size={16} />
                立即重启更新
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
