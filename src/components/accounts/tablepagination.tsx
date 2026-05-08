import { memo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface TablePaginationProps {
  pageIndex: number
  pageCount: number
  pageSize: number
  totalRows: number
  canPreviousPage: boolean
  canNextPage: boolean
  onPreviousPage: () => void
  onNextPage: () => void
  onPageSizeChange: (size: number) => void
}

export const TablePagination = memo(function TablePagination({
  pageIndex,
  pageCount,
  pageSize,
  totalRows,
  canPreviousPage,
  canNextPage,
  onPreviousPage,
  onNextPage,
  onPageSizeChange
}: TablePaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-white/8 bg-[#111927] px-4 py-4">
      <div>
        <div className="text-[11px] tracking-[0.22em] text-textMuted">分页</div>
        <div className="mt-1 text-sm text-white">
          第 <span className="font-semibold">{pageIndex + 1}</span> 页，共 <span className="font-semibold">{Math.max(pageCount, 1)}</span> 页 · 共 {totalRows} 行
        </div>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-11 rounded-[12px] border border-white/8 bg-[#0d1522] px-4 text-sm text-textMain outline-none transition hover:border-neon/25 focus:border-neon/35"
        >
          {[10, 20, 30, 50].map((size) => (
            <option key={size} value={size}>
              每页 {size} 条
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button
            title="上一页"
            onClick={onPreviousPage}
            disabled={!canPreviousPage}
            className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-white/8 bg-[#0d1522] text-textMain transition hover:border-neon/25 hover:text-neonSoft disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            title="下一页"
            onClick={onNextPage}
            disabled={!canNextPage}
            className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-white/8 bg-[#0d1522] text-textMain transition hover:border-neon/25 hover:text-neonSoft disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
})
