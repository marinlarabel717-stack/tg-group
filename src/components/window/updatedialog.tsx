import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, RefreshCw, Rocket, TriangleAlert } from 'lucide-react'
import type { AppUpdaterState } from '../../types'
import { ResultDialogShell, ResultHero, ResultPrimaryButton, ResultStatCard } from '../accounts/resultdialog'

const defaultState: AppUpdaterState = {
  status: 'idle',
  currentVersion: window.desktopInfo?.version || '0.0.1',
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
  const percentText = `${Math.max(0, Math.min(100, state.progressPercent)).toFixed(state.progressPercent >= 10 ? 0 : 1)}%`

  const config = useMemo(() => {
    switch (state.status) {
      case 'available':
        return {
          title: '发现新版本',
          subtitle: '检测到更高版本，可直接自动更新',
          icon: <Rocket size={18} />,
          tone: 'info' as const,
          closable: true
        }
      case 'downloading':
        return {
          title: '正在自动更新',
          subtitle: '更新包下载中，请稍等',
          icon: <Loader2 size={18} className="animate-spin" />,
          tone: 'violet' as const,
          closable: true
        }
      case 'downloaded':
        return {
          title: '更新已下载',
          subtitle: '软件即将自动重启并安装新版本',
          icon: <Download size={18} />,
          tone: 'success' as const,
          closable: false
        }
      case 'error':
        return {
          title: '更新失败',
          subtitle: '检查更新时出了点问题，可直接重试',
          icon: <TriangleAlert size={18} />,
          tone: 'danger' as const,
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
    <ResultDialogShell
      open={open}
      onClose={handleClose}
      title={config.title}
      subtitle={config.subtitle}
      icon={config.icon}
      tone={config.tone}
      closable={config.closable}
      maxWidth="max-w-[460px]"
    >
      <ResultHero
        label={state.status === 'error' ? '错误信息' : '当前版本 → 新版本'}
        value={state.status === 'error'
          ? state.message
          : `${state.currentVersion} → ${state.availableVersion || state.currentVersion}`}
        tone={config.tone}
      />

      {state.status === 'downloading' ? (
        <>
          <div className="flex items-center justify-between rounded-[14px] bg-panel px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-white">
              <Loader2 size={16} className="animate-spin text-violet-300" />
              <span>{state.message}</span>
            </div>
            <div className="font-medium text-violet-300">{percentText}</div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-panel">
            <div className="h-full rounded-full bg-violet-300 transition-all duration-300" style={{ width: percentText }} />
          </div>
        </>
      ) : (
        <div className="rounded-[12px] border border-white/10 bg-panel px-4 py-3 text-sm text-slate-200">
          {state.message}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <ResultStatCard label="当前版本" value={state.currentVersion} tone="neutral" />
        <ResultStatCard label="新版本" value={state.availableVersion || '—'} tone={state.status === 'error' ? 'danger' : 'info'} />
        <ResultStatCard label="下载进度" value={state.status === 'downloading' || state.status === 'downloaded' ? percentText : '待开始'} tone={state.status === 'downloaded' ? 'success' : state.status === 'error' ? 'danger' : 'violet'} />
      </div>

      {state.status === 'downloading' ? (
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <ResultStatCard label="已下载" value={formatBytes(state.transferredBytes)} tone="info" />
          <ResultStatCard label="总大小" value={formatBytes(state.totalBytes)} tone="neutral" />
          <ResultStatCard label="速度" value={`${formatBytes(state.bytesPerSecond)}/s`} tone="violet" />
        </div>
      ) : null}

      {state.status === 'available' ? (
        <ResultPrimaryButton label="自动更新" onClick={handleDownload} tone="info" />
      ) : null}

      {state.status === 'error' ? (
        <button
          type="button"
          onClick={handleRetry}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-rose-300/18 bg-rose-400/10 text-sm font-medium text-rose-200 transition hover:bg-rose-400/14"
        >
          <RefreshCw size={15} />
          <span>重新检查更新</span>
        </button>
      ) : null}

      {state.status === 'downloaded' ? (
        <ResultPrimaryButton label="立即重启更新" onClick={handleInstall} tone="success" />
      ) : null}
    </ResultDialogShell>
  )
}
