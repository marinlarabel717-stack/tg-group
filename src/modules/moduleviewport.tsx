import { lazy, memo, Suspense, useMemo, type ComponentType, type LazyExoticComponent } from 'react'
import { useUIStore } from '../stores/uistore'
import { moduleLabelMap } from '../lib/ui-text'
import type { ModuleKey } from '../types'
import { ModuleLoading } from './moduleloading'

const DashboardModule = lazy(() => import('./dashboard-module'))
const AccountsModule = lazy(() => import('./accounts-module'))
const AutomationModule = lazy(() => import('./automation-module'))
const BotCenterModule = lazy(() => import('./bot-center-module'))
const AutoJoinModule = lazy(() => import('./auto-join-module'))
const BatchCreateModule = lazy(() => import('./batch-create-module'))
const DirectMessageModule = lazy(() => import('./direct-message-module'))
const ProxyPoolModule = lazy(() => import('./proxy-pool-module'))
const SessionManagerModule = lazy(() => import('./session-manager-module'))
const LogsModule = lazy(() => import('./logs-module'))
const SettingsModule = lazy(() => import('./settings-module'))

const moduleMap: Record<ModuleKey, LazyExoticComponent<ComponentType>> = {
  dashboard: DashboardModule,
  accounts: AccountsModule,
  automation: AutomationModule,
  'bot-center': BotCenterModule,
  'auto-join': AutoJoinModule,
  'batch-create': BatchCreateModule,
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
