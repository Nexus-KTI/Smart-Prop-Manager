"use client";

export type DateFormatOption = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd";

export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Africa/Lagos", label: "+01:00 West Africa Time - Lagos" },
  { value: "Africa/Accra", label: "+00:00 Ghana - Accra" },
  { value: "Africa/Abidjan", label: "+00:00 Côte d'Ivoire - Abidjan" },
  { value: "Africa/Nairobi", label: "+03:00 East Africa - Nairobi" },
  { value: "Africa/Johannesburg", label: "+02:00 South Africa - Johannesburg" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "UTC", label: "UTC" },
];

export const DATE_FORMAT_OPTIONS: { value: DateFormatOption; label: string }[] =
  [
    { value: "dd/mm/yyyy", label: "dd/mm/yyyy" },
    { value: "mm/dd/yyyy", label: "mm/dd/yyyy" },
    { value: "yyyy-mm-dd", label: "yyyy-mm-dd" },
  ];

type Props = {
  timezone: string;
  dateFormat: DateFormatOption;
  disabled?: boolean;
  onTimezoneChange: (value: string) => void;
  onDateFormatChange: (value: DateFormatOption) => void;
};

export function LocalePreferenceFields({
  timezone,
  dateFormat,
  disabled,
  onTimezoneChange,
  onDateFormatChange,
}: Props) {
  return (
    <div className="settings-section">
      <p className="settings-section-title">Additional settings</p>
      <p className="settings-section-lede">
        Time zone and date format for how dates appear in your account.
      </p>

      <label className="form-field">
        <span className="form-label">Time zone</span>
        <select
          className="form-input"
          value={timezone}
          disabled={disabled}
          onChange={(event) => onTimezoneChange(event.target.value)}
        >
          {TIMEZONE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="form-field">
        <span className="form-label">Date format</span>
        <select
          className="form-input"
          value={dateFormat}
          disabled={disabled}
          onChange={(event) =>
            onDateFormatChange(event.target.value as DateFormatOption)
          }
        >
          {DATE_FORMAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
