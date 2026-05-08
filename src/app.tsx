import { AppFrame } from './components/window/appframe'
import { DraggableTopbar } from './components/window/draggabletopbar'
import { Sidebar } from './components/layout/sidebar'
import { Topbar } from './components/layout/topbar'
import { ModuleViewport } from './modules/moduleviewport'

function App() {
  return (
    <AppFrame>
      <DraggableTopbar>
        <Topbar />
      </DraggableTopbar>

      <div className="relative grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-3 px-3 py-3">
        <Sidebar />

        <main className="flex min-w-0 flex-col gap-4 rounded-[18px] border border-white/8 bg-[#101826] p-4 contain-layout">
          <div className="app-scroll-shell min-h-0 flex-1">
            <ModuleViewport />
          </div>
        </main>
      </div>
    </AppFrame>
  )
}

export default App
