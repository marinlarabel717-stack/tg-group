import { Minus, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

type DesktopWindowApi = {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
}

function getDesktopWindow() {
  return (window as Window & { desktopWindow?: DesktopWindowApi }).desktopWindow
}

function controlClass(kind: 'default' | 'danger' = 'default') {
  return `flex h-10 w-10 items-center justify-center rounded-xl border transition ${
    kind === 'danger'
      ? 'border-rose-400/15 bg-rose-500/10 text-rose-200 hover:border-rose-400/40 hover:bg-rose-500/20'
      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-neon/25 hover:bg-neon/8 hover:text-white'
  }`
}

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)
  const desktopWindow = getDesktopWindow()

  useEffect(() => {
    desktopWindow?.isMaximized().then(setMaximized).catch(() => {})
  }, [desktopWindow])

  return (
    <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
      <button title="最小化" onClick={() => desktopWindow?.minimize()} className={controlClass()} aria-label="最小化">
        <Minus size={16} />
      </button>
      <button
        title={maximized ? '还原窗口' : '最大化'}
        onClick={async () => {
          const next = await desktopWindow?.toggleMaximize()
          setMaximized(Boolean(next))
        }}
        className={controlClass()}
        aria-label={maximized ? '还原窗口' : '最大化'}
      >
        <Square size={14} className={maximized ? 'scale-90' : ''} />
      </button>
      <button title="关闭" onClick={() => desktopWindow?.close()} className={controlClass('danger')} aria-label="关闭">
        <X size={16} />
      </button>
    </div>
  )
}
