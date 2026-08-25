type AuthLoadingGateProps = {
  /** Visible status text under the mark. */
  label?: string;
  /**
   * `fullscreen` covers the viewport (post-auth redirect).
   * `panel` fits Suspense / card-sized slots.
   */
  variant?: "fullscreen" | "panel";
};

export function AuthLoadingGate({
  label = "Loading…",
  variant = "fullscreen",
}: AuthLoadingGateProps) {
  return (
    <div
      className={
        variant === "panel"
          ? "auth-loading-gate auth-loading-gate--panel"
          : "auth-loading-gate auth-loading-gate--fullscreen"
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="auth-loading-gate-inner">
        <span className="auth-loading-mark" aria-hidden="true" />
        <p className="auth-loading-label">{label}</p>
      </div>
    </div>
  );
}
