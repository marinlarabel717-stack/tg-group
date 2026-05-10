import { AppFrame } from './components/window/appframe'
import { DraggableTopbar } from './components/window/draggabletopbar'
import { Sidebar } from './components/layout/sidebar'
import { LicenseGate } from './components/license/licensegate'
import { Topbar } from './components/layout/topbar'
import { ModuleViewport } from './modules/moduleviewport'
import { useUIStore } from './stores/uistore'

function App() {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
  return (
    <LicenseGate>
      <AppFrame>
        <DraggableTopbar>
          <Topbar />
        </DraggableTopbar>

        <div className={`relative grid min-h-0 flex-1 gap-5 overflow-hidden px-5 py-5 ${sidebarCollapsed ? 'grid-cols-[84px_1fr]' : 'grid-cols-[212px_1fr]'}`}>
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
