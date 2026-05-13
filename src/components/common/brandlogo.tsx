import { memo } from 'react'
import brandIcon from '../../../build/icon.png'
import { BRAND_NAME, BRAND_SUBTITLE, BRAND_TAGLINE } from '../../lib/brand'

interface BrandLogoProps {
  size?: number
  title?: string
  subtitle?: string
  roundedClassName?: string
  className?: string
  imageClassName?: string
  textClassName?: string
  subtitleClassName?: string
  titleClassName?: string
  taglineClassName?: string
  showText?: boolean
}

export const BrandLogo = memo(function BrandLogo({
  size = 44,
  title = BRAND_NAME,
  subtitle = BRAND_SUBTITLE,
  roundedClassName = 'rounded-[14px]',
  className = '',
  imageClassName = '',
  textClassName = '',
  subtitleClassName = '',
  titleClassName = '',
  taglineClassName = '',
  showText = true
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <div
        className={`shrink-0 overflow-hidden border border-white/10 bg-white/[0.03] shadow-[0_10px_24px_rgba(0,0,0,0.24)] ${roundedClassName}`.trim()}
        style={{ width: size, height: size }}
      >
        <img src={brandIcon} alt={title} className={`h-full w-full object-cover ${imageClassName}`.trim()} draggable={false} />
      </div>
      {showText ? (
        <div className={`min-w-0 ${textClassName}`.trim()}>
          <div className={`truncate text-[11px] uppercase tracking-[0.24em] text-textMuted ${subtitleClassName}`.trim()}>{subtitle}</div>
          <div className={`truncate text-[18px] font-semibold text-textMain ${titleClassName}`.trim()}>{title}</div>
          <div className={`truncate text-[12px] text-textMuted ${taglineClassName}`.trim()}>{BRAND_TAGLINE}</div>
        </div>
      ) : null}
    </div>
  )
})
