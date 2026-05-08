export function ModuleLoading({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-[640px] items-center justify-center rounded-[28px] border border-white/10 bg-[#0f1728]/88">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-neon/30 border-t-neon" />
        <div className="text-base font-medium text-white">正在加载 {title}</div>
        <div className="mt-2 text-sm text-textMuted">模块按需挂载中，请稍候。</div>
      </div>
    </div>
  )
}
