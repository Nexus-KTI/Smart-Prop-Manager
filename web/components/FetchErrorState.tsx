"use client";

type Props = {
  title?: string;
  message: string;
  onRetry: () => void;
  retryLabel?: string;
};

/** Short title + muted reason + one Retry, no secondary CTAs. */
export function FetchErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Retry",
}: Props) {
  const reason = message.trim() || "Check your connection and try again.";

  return (
    <section className="dashboard" role="alert">
      <header className="dashboard-header">
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{reason}</p>
      </header>
      <div className="form-actions form-actions-start">
        <button type="button" className="btn-primary" onClick={onRetry}>
          {retryLabel}
        </button>
      </div>
    </section>
  );
}
