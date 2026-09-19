type ListPaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

/** Compact Prev / Next pager for filtered list slices. */
export function ListPagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: ListPaginationProps) {
  if (total <= pageSize) return null;

  const safePage = Math.min(Math.max(page, 1), pageCount);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  return (
    <div className="list-pagination" role="navigation" aria-label="List pages">
      <p className="list-pagination-meta mono-data">
        {from}–{to} of {total}
      </p>
      <div className="list-pagination-controls">
        <button
          type="button"
          className="btn-secondary"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          Previous
        </button>
        <span className="list-pagination-page mono-data">
          {safePage} / {pageCount}
        </span>
        <button
          type="button"
          className="btn-secondary"
          disabled={safePage >= pageCount}
          onClick={() => onPageChange(safePage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
