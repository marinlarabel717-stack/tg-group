import { PlaceholderModule } from '../components/layout/placeholdermodule'
import { moduleLabelMap } from '../lib/ui-text'

export default function ProxyPoolModule() {
  return (
    <PlaceholderModule
      title={moduleLabelMap['proxy-pool']}
      subtitle="集中查看 Proxy 健康度、区域分布、轮换池与延迟表现，保持客户端级运营视图。"
    />
  )
}
