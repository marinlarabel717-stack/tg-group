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

      <div className="relative grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-4 overflow-hidden px-4 py-4">
        <Sidebar />

        <main className="flex min-w-0 flex-col gap-4 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.025] p-4 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] contain-layout">
          <div className="min-h-0 flex-1 overflow-auto">
            <ModuleViewport />
          </div>
        </main>
      </div>
    </AppFrame>
  )
}

export default App
