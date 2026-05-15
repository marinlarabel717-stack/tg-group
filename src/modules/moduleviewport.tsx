import { lazy, memo, Suspense, useEffect, useMemo, type ComponentType, type LazyExoticComponent } from 'react'
import { useUIStore } from '../stores/uistore'
import { moduleLabelMap } from '../lib/ui-text'
import type { ModuleKey } from '../types'
import { ModuleLoading } from './moduleloading'

const moduleLoaders = {
  dashboard: () => import('./dashboard-module'),
  accounts: () => import('./accounts-module'),
  automation: () => import('./automation-module'),
  'bot-center': () => import('./bot-center-module'),
  'auto-join': () => import('./auto-join-module'),
  'direct-message': () => import('./direct-message-module'),
  'proxy-pool': () => import('./proxy-pool-module'),
  'session-manager': () => import('./session-manager-module'),
  logs: () => import('./logs-module'),
  settings: () => import('./settings-module')
} satisfies Record<ModuleKey, () => Promise<{ default: ComponentType }>>

const DashboardModule = lazy(moduleLoaders.dashboard)
const AccountsModule = lazy(moduleLoaders.accounts)
const AutomationModule = lazy(moduleLoaders.automation)
const BotCenterModule = lazy(moduleLoaders['bot-center'])
const AutoJoinModule = lazy(moduleLoaders['auto-join'])
const DirectMessageModule = lazy(moduleLoaders['direct-message'])
const ProxyPoolModule = lazy(moduleLoaders['proxy-pool'])
const SessionManagerModule = lazy(moduleLoaders['session-manager'])
const LogsModule = lazy(moduleLoaders.logs)
const SettingsModule = lazy(moduleLoaders.settings)

const moduleMap: Record<ModuleKey, LazyExoticComponent<ComponentType>> = {
  dashboard: DashboardModule,
  accounts: AccountsModule,
  automation: AutomationModule,
  'bot-center': BotCenterModule,
  'auto-join': AutoJoinModule,
  'direct-message': DirectMessageModule,
  'proxy-pool': ProxyPoolModule,
  'session-manager': SessionManagerModule,
  logs: LogsModule,
  settings: SettingsModule
}

export const ModuleViewport = memo(function ModuleViewport() {
  const activeModule = useUIStore((state) => state.activeModule)
  const ActiveComponent = useMemo(() => moduleMap[activeModule], [activeModule])
  const title = moduleLabelMap[activeModule]

  useEffect(() => {
    const warmModules: ModuleKey[] = ['automation', 'direct-message', 'auto-join', 'logs', 'accounts']
    const runner = () => {
      for (const key of warmModules) {
        if (key === activeModule) continue
        void moduleLoaders[key]()
      }
    }

    const idleRunner = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number }).requestIdleCallback
    if (typeof idleRunner === 'function') {
      const handle = idleRunner(runner, { timeout: 1200 })
      return () => window.cancelIdleCallback?.(handle)
    }

    const timer = window.setTimeout(runner, 400)
    return () => window.clearTimeout(timer)
  }, [activeModule])

  return (
    <div className="min-h-0 h-full overflow-auto">
      <div className="mb-5 px-1 pt-1">
        <h1 className="text-[30px] font-extrabold tracking-[0.01em] text-white">{title}</h1>
      </div>

      <Suspense fallback={<ModuleLoading title={title} />}>
        <ActiveComponent />
      </Suspense>
    </div>
  )
})
