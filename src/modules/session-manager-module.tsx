import { PlaceholderModule } from '../components/layout/placeholdermodule'
import { moduleLabelMap } from '../lib/ui-text'

export default function SessionManagerModule() {
  return (
    <PlaceholderModule
      title={moduleLabelMap['session-manager']}
      subtitle="管理导入、恢复、失效提醒与 Session 生命周期，统一维护会话资产。"
    />
  )
}
