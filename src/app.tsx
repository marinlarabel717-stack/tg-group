import { AppFrame } from './components/window/appframe'
import { DraggableTopbar } from './components/window/draggabletopbar'
import { Sidebar } from './components/layout/sidebar'
import { Topbar } from './components/layout/topbar'
import { DashboardView } from './components/dashboard/dashboardview'
import { AccountsView } from './components/accounts/accountsview'
import { PlaceholderModule } from './components/layout/placeholdermodule'
import { useAppStore } from './store/appstore'

const moduleContent = {
  dashboard: <DashboardView />,
  accounts: <AccountsView />,
  automation: (
    <PlaceholderModule
      title="Automation Center"
      subtitle="Build cyber automation flows, trigger orchestration rules, queue bulk actions, and coordinate advanced Telegram task pipelines."
    />
  ),
  'proxy-pool': (
    <PlaceholderModule
      title="Proxy Pool"
      subtitle="Monitor proxy health, region availability, rotation pools, and latency maps inside a true desktop operations console."
    />
  ),
  'session-manager': (
    <PlaceholderModule
      title="Session Manager"
      subtitle="Manage import, session lifecycles, recovery, expiration alerts, and enterprise session inventories from one surface."
    />
  ),
  logs: (
    <PlaceholderModule
      title="Logs & Events"
      subtitle="Observe operational history, audit events, notifications, and execution diagnostics with a cyber SaaS visual language."
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
