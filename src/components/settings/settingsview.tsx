import { memo, useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useSettingsStore } from '../../stores/settingsstore'
import { useAccountStore } from '../../stores/accountstore'

function normalizeConcurrency(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 3
  return Math.min(20, Math.max(1, Math.trunc(parsed)))
}

export default memo(function SettingsView() {
  const init = useSettingsStore((state) => state.init)
  const settings = useSettingsStore((state) => state.settings)
  const loading = useSettingsStore((state) => state.loading)
  const saving = useSettingsStore((state) => state.saving)
  const errorMessage = useSettingsStore((state) => state.errorMessage)
  const lastActionMessage = useSettingsStore((state) => state.lastActionMessage)
  const saveCheckConcurrency = useSettingsStore((state) => state.saveCheckConcurrency)
  const runtimeConcurrency = useAccountStore((state) => state.checkState.concurrency)

  const [concurrencyInput, setConcurrencyInput] = useState(String(settings.checkConcurrency))

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    setConcurrencyInput(String(settings.checkConcurrency))
  }, [settings.checkConcurrency])

  const normalizedValue = normalizeConcurrency(concurrencyInput)

  return (
    <div className="contain-layout">
      <GlassPanel className="min-h-[720px] bg-card p-0">
        <div className="border-b border-white/5 px-5 py-4">
          <div className="text-sm font-medium text-white">设置</div>
          <div className="mt-1 text-xs text-textMuted">这里先放系统设置入口，后续其他配置继续往这里加。</div>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="rounded-[16px] bg-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white">检测并发线程</div>
                <div className="mt-2 text-sm leading-6 text-textMuted">
                  当前默认是 <span className="font-semibold text-white">{runtimeConcurrency}</span> 线程。
                  <br />
                  建议先控制在 1 - 10 之间；改完后，新任务会按新的并发数继续调度。
                </div>
              </div>
              {loading ? <Loader2 className="mt-1 animate-spin text-textMuted" size={18} /> : null}
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-3">
              <label className="flex min-w-[220px] flex-col gap-2 text-sm text-textMuted">
                <span>并发线程数</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={concurrencyInput}
                  onChange={(event) => setConcurrencyInput(event.target.value)}
                  className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50"
                />
              </label>

              <button
                type="button"
                disabled={saving}
                onClick={() => void saveCheckConcurrency(normalizedValue)}
                className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-sky-500 px-4 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                保存设置
              </button>
            </div>
          </div>

          {lastActionMessage ? <div className="rounded-[12px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{lastActionMessage}</div> : null}
          {errorMessage ? <div className="rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
        </div>
      </GlassPanel>
    </div>
  )
})
