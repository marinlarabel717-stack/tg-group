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

      <div className="relative grid min-h-0 flex-1 grid-cols-[292px_1fr] gap-5 px-5 py-5">
        <Sidebar />

        <main className="flex min-w-0 flex-col gap-5 rounded-[16px] bg-panel/95 p-5 contain-layout">
          <div className="app-scroll-shell min-h-0 flex-1">
            <ModuleViewport />
          </div>
        </main>
      </div>
    </AppFrame>
  )
}

export default App
