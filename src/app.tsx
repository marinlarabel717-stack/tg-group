import { AppFrame } from './components/window/appframe'
import { DraggableTopbar } from './components/window/draggabletopbar'
import { Sidebar } from './components/layout/sidebar'
import { Topbar } from './components/layout/topbar'
import { DashboardView } from './components/dashboard/dashboardview'
import { AccountsView } from './components/accounts/accountsview'
import { PlaceholderModule } from './components/layout/placeholdermodule'
import { useAppStore } from './store/appstore'
import { moduleLabelMap } from './lib/ui-text'

const moduleContent = {
  dashboard: <DashboardView />,
  accounts: <AccountsView />,
  automation: (
    <PlaceholderModule
      title={moduleLabelMap.automation}
      subtitle="构建自动化流程、触发编排规则、批量下发任务，并统一协调 Telegram 相关执行链路。"
    />
  ),
  'proxy-pool': (
    <PlaceholderModule
      title={moduleLabelMap['proxy-pool']}
      subtitle="集中查看 Proxy 健康度、区域分布、轮换池与延迟表现，保持客户端级运营视图。"
    />
  ),
  'session-manager': (
    <PlaceholderModule
      title={moduleLabelMap['session-manager']}
      subtitle="管理导入、恢复、失效提醒与 Session 生命周期，统一维护会话资产。"
    />
  ),
  logs: (
    <PlaceholderModule
      title={moduleLabelMap.logs}
      subtitle="查看运行日志、审计事件、通知记录与执行诊断，保持全局可观察性。"
    />
  )
} as const

function App() {
  const activeModule = useAppStore((state) => state.activeModule)

  return (
    <AppFrame>
      <DraggableTopbar>
        <Topbar />
      </DraggableTopbar>

      <div className="relative grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-4 overflow-hidden px-4 py-4">
        <Sidebar />

        <main className="flex min-w-0 flex-col gap-4 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.025] p-4 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="min-h-0 flex-1 overflow-auto">{moduleContent[activeModule]}</div>
        </main>
      </div>
    </AppFrame>
  )
}

export default App
