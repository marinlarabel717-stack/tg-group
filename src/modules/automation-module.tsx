import { PlaceholderModule } from '../components/layout/placeholdermodule'
import { moduleLabelMap } from '../lib/ui-text'

export default function AutomationModule() {
  return (
    <PlaceholderModule
      title={moduleLabelMap.automation}
      subtitle="构建自动化流程、触发编排规则、批量下发任务，并统一协调 Telegram 相关执行链路。"
    />
  )
}
