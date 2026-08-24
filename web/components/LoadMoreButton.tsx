type LoadMoreButtonProps = {
  hasMore: boolean;
  loading?: boolean;
  onLoadMore: () => void;
  className?: string;
};

export function LoadMoreButton({
  hasMore,
  loading = false,
  onLoadMore,
  className,
}: LoadMoreButtonProps) {
  if (!hasMore) return null;

  return (
    <div className={className ?? "table-load-more"}>
      <button
        type="button"
        className="btn-secondary"
        onClick={onLoadMore}
        disabled={loading}
      >
        {loading ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}
