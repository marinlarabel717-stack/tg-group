import { AppFrame } from './components/window/appframe'
import { Sidebar } from './components/layout/sidebar'
import { LicenseGate } from './components/license/licensegate'
import { ModuleViewport } from './modules/moduleviewport'
import { useUIStore } from './stores/uistore'

function App() {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
  return (
    <LicenseGate>
      <AppFrame>
        <div className={`relative grid h-full min-h-0 gap-5 overflow-hidden px-5 pb-5 pt-12 ${sidebarCollapsed ? 'grid-cols-[86px_1fr]' : 'grid-cols-[252px_1fr]'}`}>
          <Sidebar />

          <main className="flex min-h-0 min-w-0 flex-col gap-5 overflow-hidden rounded-[16px] bg-panel/95 p-5 contain-layout">
            <div className="app-scroll-shell min-h-0 flex-1">
              <ModuleViewport />
            </div>
          </main>
        </div>
      </AppFrame>
    </LicenseGate>
  )
}

export default App
