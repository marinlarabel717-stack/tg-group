import { memo, useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { useSettingsStore } from '../../stores/settingsstore'
import { useAccountStore } from '../../stores/accountstore'
import { useProxyPoolStore } from '../../stores/proxypoolstore'
import { useLicenseStore } from '../../stores/licensestore'
import { formatDateTimeFull } from '../../lib/ui-text'

function normalizeConcurrency(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 3
  return Math.min(20, Math.max(1, Math.trunc(parsed)))
}

function normalizeGraceDays(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 3
  return Math.min(30, Math.max(0, Math.trunc(parsed)))
}

export default memo(function SettingsView() {
  const init = useSettingsStore((state) => state.init)
  const settings = useSettingsStore((state) => state.settings)
  const loading = useSettingsStore((state) => state.loading)
  const saving = useSettingsStore((state) => state.saving)
  const errorMessage = useSettingsStore((state) => state.errorMessage)
  const lastActionMessage = useSettingsStore((state) => state.lastActionMessage)
  const saveCheckConcurrency = useSettingsStore((state) => state.saveCheckConcurrency)
  const saveLicenseConfig = useSettingsStore((state) => state.saveLicenseConfig)
  const runtimeConcurrency = useAccountStore((state) => state.checkState.concurrency)
  const initProxyPool = useProxyPoolStore((state) => state.init)
  const proxyPoolLoading = useProxyPoolStore((state) => state.loading)
  const proxyPoolSaving = useProxyPoolStore((state) => state.saving)
  const proxyPoolState = useProxyPoolStore((state) => state.state)
  const proxyPoolErrorMessage = useProxyPoolStore((state) => state.errorMessage)
  const proxyPoolActionMessage = useProxyPoolStore((state) => state.lastActionMessage)
  const updateProxySettings = useProxyPoolStore((state) => state.updateSettings)
  const initLicense = useLicenseStore((state) => state.init)
  const validateLicense = useLicenseStore((state) => state.validate)
  const licenseState = useLicenseStore((state) => state.state)
  const licenseValidating = useLicenseStore((state) => state.validating)

  const [concurrencyInput, setConcurrencyInput] = useState(String(settings.checkConcurrency))
  const [licenseApiBaseUrlInput, setLicenseApiBaseUrlInput] = useState(settings.licenseApiBaseUrl)
  const [licenseOfflineGraceDaysInput, setLicenseOfflineGraceDaysInput] = useState(String(settings.licenseOfflineGraceDays))

  useEffect(() => {
    void init()
    void initProxyPool()
    void initLicense()
  }, [init, initProxyPool, initLicense])

  useEffect(() => {
    setConcurrencyInput(String(settings.checkConcurrency))
  }, [settings.checkConcurrency])

  useEffect(() => {
    setLicenseApiBaseUrlInput(settings.licenseApiBaseUrl)
    setLicenseOfflineGraceDaysInput(String(settings.licenseOfflineGraceDays))
  }, [settings.licenseApiBaseUrl, settings.licenseOfflineGraceDays])

  const normalizedValue = normalizeConcurrency(concurrencyInput)
  const normalizedGraceDays = normalizeGraceDays(licenseOfflineGraceDaysInput)

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

          <div className="rounded-[16px] bg-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white">授权服务</div>
                <div className="mt-2 text-sm leading-6 text-textMuted">
                  这里配置卡密服务端地址与离线宽限天数。打包正式版后，建议写入真实服务地址，客户端启动时会先做授权校验。
                </div>
              </div>
              {loading ? <Loader2 className="mt-1 animate-spin text-textMuted" size={18} /> : null}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
              <label className="flex flex-col gap-2 text-sm text-textMuted">
                <span>授权服务地址</span>
                <input
                  value={licenseApiBaseUrlInput}
                  onChange={(event) => setLicenseApiBaseUrlInput(event.target.value)}
                  placeholder="https://license.example.com"
                  className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-textMuted">
                <span>离线宽限天数</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={1}
                  value={licenseOfflineGraceDaysInput}
                  onChange={(event) => setLicenseOfflineGraceDaysInput(event.target.value)}
                  className="h-11 rounded-[12px] border border-white/10 bg-slate-950/45 px-3 text-white outline-none transition focus:border-sky-400/50"
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveLicenseConfig({ licenseApiBaseUrl: licenseApiBaseUrlInput.trim(), licenseOfflineGraceDays: normalizedGraceDays })}
                  className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-sky-500 px-4 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  保存授权配置
                </button>
                <button
                  type="button"
                  disabled={licenseValidating}
                  onClick={() => void validateLicense()}
                  className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-hover disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {licenseValidating ? <Loader2 size={16} className="animate-spin" /> : null}
                  立即校验授权
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-[14px] border border-white/6 bg-slate-950/35 px-4 py-4 text-sm text-textMuted">
                <div>当前状态：<span className="font-semibold text-white">{licenseState.status === 'valid' ? '授权有效' : licenseState.status === 'grace' ? '离线宽限' : licenseState.status === 'expired' ? '授权过期' : licenseState.status === 'invalid' ? '授权无效' : '未激活'}</span></div>
                <div className="mt-2">已绑卡密：{licenseState.cardKeyMasked || '—'}</div>
                <div className="mt-2">到期时间：{formatDateTimeFull(licenseState.expireAt)}</div>
              </div>
              <div className="rounded-[14px] border border-white/6 bg-slate-950/35 px-4 py-4 text-sm text-textMuted">
                <div>最近校验：{formatDateTimeFull(licenseState.lastValidatedAt)}</div>
                <div className="mt-2">离线宽限：{formatDateTimeFull(licenseState.offlineGraceUntil)}</div>
                <div className="mt-2">设备指纹：<span className="font-mono text-[12px] text-slate-300">{licenseState.machineId || '—'}</span></div>
              </div>
            </div>
          </div>

          <div className="rounded-[16px] bg-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white">全局代理开关</div>
                <div className="mt-2 text-sm leading-6 text-textMuted">
                  关闭后，整个软件都走 <span className="font-semibold text-white">直连本地</span>。
                  <br />
                  打开后，账号检测和 WEB 都会按代理池规则全局走代理。
                </div>
              </div>
              {proxyPoolLoading ? <Loader2 className="mt-1 animate-spin text-textMuted" size={18} /> : null}
            </div>

            <div className="mt-5 flex items-center justify-between rounded-[14px] border border-white/6 bg-slate-950/35 px-4 py-4">
              <div>
                <div className="text-sm font-medium text-white">当前状态</div>
                <div className="mt-1 text-xs text-textMuted">{proxyPoolState.settings.enabled ? '已开启全局代理池' : '当前全局直连'}</div>
              </div>
              <button
                type="button"
                disabled={proxyPoolSaving}
                onClick={() => void updateProxySettings({ enabled: !proxyPoolState.settings.enabled })}
                className={`inline-flex h-9 w-16 items-center rounded-full px-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${proxyPoolState.settings.enabled ? 'bg-sky-500/80' : 'bg-white/10'}`}
              >
                <span className={`h-7 w-7 rounded-full bg-white shadow transition ${proxyPoolState.settings.enabled ? 'translate-x-7' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {lastActionMessage ? <div className="rounded-[12px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{lastActionMessage}</div> : null}
          {proxyPoolActionMessage ? <div className="rounded-[12px] border border-sky-400/15 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">{proxyPoolActionMessage}</div> : null}
          {errorMessage ? <div className="rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
          {proxyPoolErrorMessage ? <div className="rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{proxyPoolErrorMessage}</div> : null}
        </div>
      </GlassPanel>
    </div>
  )
})
