"use client";

type Props = {
  title?: string;
  message: string;
  onRetry: () => void;
  retryLabel?: string;
  /** Error digest to quote to support; matches the server log line. */
  reference?: string;
};

/** Short title + muted reason + one Retry, no secondary CTAs. */
export function FetchErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Retry",
  reference,
}: Props) {
  const reason = message.trim() || "Check your connection and try again.";

  return (
    <section className="dashboard" role="alert">
      <header className="dashboard-header">
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{reason}</p>
        {reference ? (
          <p className="page-subtitle">
            Reference <span className="mono-data">{reference}</span>
          </p>
        ) : null}
      </header>
      <div className="form-actions form-actions-start">
        <button type="button" className="btn-primary" onClick={onRetry}>
          {retryLabel}
        </button>
      </div>
    </section>
  );
}
