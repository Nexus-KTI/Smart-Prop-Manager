import Link from "next/link";

export default function Phase1SettingsPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1">Phase 1</Link> · Settings · PRD F5/F6
      </p>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">
        Profile + one notification channel. Copy must match the real channel.
      </p>
      <div className="form-card" style={{ marginTop: 20, maxWidth: 420 }}>
        <div className="osx-field">
          <label className="osx-field-label" htmlFor="osx-name">
            Name
          </label>
          <input
            id="osx-name"
            className="form-input"
            defaultValue="Ada Okafor"
          />
        </div>
        <div className="osx-field">
          <label className="osx-field-label" htmlFor="osx-email">
            Email
          </label>
          <input
            id="osx-email"
            className="form-input"
            defaultValue="ada@example.com"
          />
        </div>
        <fieldset className="osx-field" style={{ border: "none", padding: 0 }}>
          <legend className="osx-field-label">Preferred channel</legend>
          <label className="osx-radio">
            <input type="radio" name="channel" defaultChecked /> WhatsApp
          </label>
          <label className="osx-radio">
            <input type="radio" name="channel" /> SMS
          </label>
          <label className="osx-radio">
            <input type="radio" name="channel" /> Email
          </label>
        </fieldset>
        <div className="osx-actions">
          <button type="button" className="btn-primary">
            Save channel
          </button>
        </div>
      </div>
    </>
  );
}
