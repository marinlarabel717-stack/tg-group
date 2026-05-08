import { PlaceholderModule } from '../components/layout/placeholdermodule'
import { moduleLabelMap } from '../lib/ui-text'

export default function LogsModule() {
  return (
    <PlaceholderModule
      title={moduleLabelMap.logs}
      subtitle="查看运行日志、审计事件、通知记录与执行诊断，保持全局可观察性。"
    />
  )
}
