import { memo, useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { GlassPanel } from '../common/glasspanel'
import { ConfigRow, FoldSection, SOFT_INPUT_CLASS } from '../common/settings-ui'
import { formatDateTimeFull } from '../../lib/ui-text'
import { useSettingsStore } from '../../stores/settingsstore'
import { useAccountStore } from '../../stores/accountstore'
import { useProxyPoolStore } from '../../stores/proxypoolstore'
import { useLicenseStore } from '../../stores/licensestore'

function normalizeConcurrency(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 3
  return Math.max(1, Math.trunc(parsed))
}

function formatLicenseStatus(status: 'missing' | 'valid' | 'expired' | 'invalid' | 'grace') {
  if (status === 'valid') return '已激活'
  if (status === 'grace') return '宽限期内'
  if (status === 'expired') return '已过期'
  if (status === 'invalid') return '无效'
  return '未激活'
}

function formatLicenseExpireAt(cardKeyMasked: string | null, expireAt: string | null) {
  if (!cardKeyMasked) return '未激活'
  if (!expireAt) return '长期有效'
  return formatDateTimeFull(expireAt)
}

export default memo(function SettingsView() {
  const init = useSettingsStore((state) => state.init)
  const settings = useSettingsStore((state) => state.settings)
  const saving = useSettingsStore((state) => state.saving)
  const errorMessage = useSettingsStore((state) => state.errorMessage)
  const lastActionMessage = useSettingsStore((state) => state.lastActionMessage)
  const saveCheckConcurrency = useSettingsStore((state) => state.saveCheckConcurrency)
  const runtimeConcurrency = useAccountStore((state) => state.checkState.concurrency)
  const initProxyPool = useProxyPoolStore((state) => state.init)
  const proxyPoolSaving = useProxyPoolStore((state) => state.saving)
  const proxyPoolState = useProxyPoolStore((state) => state.state)
  const proxyPoolErrorMessage = useProxyPoolStore((state) => state.errorMessage)
  const proxyPoolActionMessage = useProxyPoolStore((state) => state.lastActionMessage)
  const updateProxySettings = useProxyPoolStore((state) => state.updateSettings)
  const initLicense = useLicenseStore((state) => state.init)
  const licenseState = useLicenseStore((state) => state.state)

  const [concurrencyInput, setConcurrencyInput] = useState(String(settings.checkConcurrency))

  useEffect(() => {
    void init()
    void initProxyPool()
    void initLicense()
  }, [init, initLicense, initProxyPool])

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
          <FoldSection title="授权信息" hint="这里显示当前卡密和授权到期时间。" defaultOpen>
            <ConfigRow label="当前状态" hint={licenseState.message}>
              <div className="flex min-h-11 items-center rounded-[12px] border border-white/[0.06] bg-black/[0.08] px-3 text-sm text-white">
                {formatLicenseStatus(licenseState.status)}
              </div>
            </ConfigRow>
            <ConfigRow label="当前卡密" hint="这里只展示脱敏后的卡密。" wide>
              <div className="flex min-h-11 items-center rounded-[12px] border border-white/[0.06] bg-black/[0.08] px-3 text-sm text-white/90">
                {licenseState.cardKeyMasked || '未激活'}
              </div>
            </ConfigRow>
            <ConfigRow label="有效期至" hint={licenseState.lastValidatedAt ? `最近校验：${formatDateTimeFull(licenseState.lastValidatedAt)}` : '当前显示的是授权记录里的到期时间。'} wide>
              <div className="flex min-h-11 items-center rounded-[12px] border border-white/[0.06] bg-black/[0.08] px-3 text-sm text-white/90">
                {formatLicenseExpireAt(licenseState.cardKeyMasked, licenseState.expireAt)}
              </div>
            </ConfigRow>
          </FoldSection>

          <FoldSection title="检测设置" hint="统一走设置页风格，常用参数一行一个。" defaultOpen>
            <ConfigRow label="检测并发线程" hint={`当前默认 ${runtimeConcurrency} 线程；改完后，新任务会按新的并发数继续调度。`}>
              <input
                type="number"
                min={1}
                step={1}
                value={concurrencyInput}
                onChange={(event) => setConcurrencyInput(event.target.value)}
                className={`h-11 w-full rounded-[12px] px-3 ${SOFT_INPUT_CLASS}`}
              />
            </ConfigRow>
            <ConfigRow label="保存设置" hint="这里不设上限，能开多少取决于本地性能。">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveCheckConcurrency(normalizedValue)}
                className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-sky-500 px-4 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                保存设置
              </button>
            </ConfigRow>
          </FoldSection>

          <FoldSection title="全局代理" hint="整个软件统一按这里控制是否全局走代理。" defaultOpen>
            <ConfigRow label="当前状态" hint={proxyPoolState.settings.enabled ? '打开后，所有功能模块都按代理池规则走代理。' : '关闭后，所有功能模块都回到本地直连。'}>
              <div className="flex items-center justify-between gap-3 rounded-[12px] border border-white/[0.06] bg-black/[0.08] px-3 py-2.5">
                <div className="text-sm text-white">{proxyPoolState.settings.enabled ? '当前全局走代理' : '当前全局直连本地'}</div>
                <button
                  type="button"
                  disabled={proxyPoolSaving}
                  onClick={() => void updateProxySettings({ enabled: !proxyPoolState.settings.enabled })}
                  className={`inline-flex h-9 w-16 items-center rounded-full px-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${proxyPoolState.settings.enabled ? 'bg-sky-500/80' : 'bg-white/10'}`}
                >
                  <span className={`h-7 w-7 rounded-full bg-white shadow transition ${proxyPoolState.settings.enabled ? 'translate-x-7' : 'translate-x-0'}`} />
                </button>
              </div>
            </ConfigRow>
          </FoldSection>

          {lastActionMessage ? <div className="rounded-[12px] border border-emerald-400/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{lastActionMessage}</div> : null}
          {proxyPoolActionMessage ? <div className="rounded-[12px] border border-sky-400/15 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">{proxyPoolActionMessage}</div> : null}
          {errorMessage ? <div className="rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
          {proxyPoolErrorMessage ? <div className="rounded-[12px] border border-rose-400/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{proxyPoolErrorMessage}</div> : null}
        </div>
      </GlassPanel>
    </div>
  )
})
