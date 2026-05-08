import { GlassPanel } from '../common/glasspanel'

export function PlaceholderModule({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <GlassPanel className="min-h-[720px]">
      <div className="flex h-full min-h-[620px] items-center justify-center">
        <div className="max-w-xl text-center">
          <div className="text-sm uppercase tracking-[0.25em] text-neonSoft">Module</div>
          <h2 className="mt-3 text-4xl font-semibold text-white">{title}</h2>
          <p className="mt-4 text-base leading-7 text-textMuted">{subtitle}</p>
        </div>
      </div>
    </GlassPanel>
  )
}
