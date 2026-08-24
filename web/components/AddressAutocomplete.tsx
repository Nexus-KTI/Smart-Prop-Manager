"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type Props = {
  name?: string;
  defaultValue?: string;
  defaultLatitude?: number | null;
  defaultLongitude?: number | null;
  placeholder?: string;
  required?: boolean;
  id?: string;
};

type Suggestion = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number | string;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

type StatusKind = "idle" | "loading" | "empty" | "slow" | "error";

// Photon (Komoot) — free OSM geocoder, no API key / card required.
const PHOTON_URL = "https://photon.komoot.io/api/";
// Bias results toward Lagos without blocking other places.
const BIAS_LAT = 6.5244;
const BIAS_LON = 3.3792;
const DEBOUNCE_MS = 280;
const MIN_QUERY_LENGTH = 3;
const SEARCH_TIMEOUT_MS = 4000;

const STATUS_COPY: Record<Exclude<StatusKind, "idle">, string> = {
  loading: "Searching… you can keep typing or save as typed.",
  empty: "No matches — type the full address and save.",
  slow: "Search is slow — type the address and save.",
  error: "Suggestions unavailable — type the address and save.",
};

function coordString(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}

function formatPhotonLabel(properties: PhotonFeature["properties"]): string {
  if (!properties) return "";

  const streetLine = [properties.housenumber, properties.street]
    .filter(Boolean)
    .join(" ")
    .trim();
  const locality =
    properties.city ||
    properties.town ||
    properties.village ||
    properties.district ||
    properties.county ||
    "";

  const parts = [
    streetLine || properties.name,
    streetLine && properties.name && properties.name !== streetLine
      ? properties.name
      : null,
    locality,
    properties.state,
    properties.postcode,
    properties.country,
  ].filter((part, index, all) => {
    if (!part) return false;
    return all.indexOf(part) === index;
  });

  return parts.join(", ");
}

async function fetchSuggestions(
  query: string,
  signal: AbortSignal,
): Promise<Suggestion[]> {
  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lang", "en");
  url.searchParams.set("lat", String(BIAS_LAT));
  url.searchParams.set("lon", String(BIAS_LON));

  const response = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Photon request failed (${response.status})`);
  }

  const data = (await response.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];

  for (const feature of data.features ?? []) {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [longitude, latitude] = coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const label = formatPhotonLabel(feature.properties);
    if (!label || seen.has(label)) continue;
    seen.add(label);

    const osmId = feature.properties?.osm_id ?? suggestions.length;
    const osmType = feature.properties?.osm_type ?? "place";
    suggestions.push({
      id: `${osmType}-${osmId}-${label}`,
      label,
      latitude,
      longitude,
    });
  }

  return suggestions;
}

export function AddressAutocomplete({
  name = "address",
  defaultValue = "",
  defaultLatitude = null,
  defaultLongitude = null,
  placeholder = "Street, city",
  required = false,
  id,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedAddressRef = useRef<string | null>(
    defaultLatitude != null && defaultLongitude != null
      ? defaultValue || null
      : null,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  const [query, setQuery] = useState(defaultValue);
  const [latitude, setLatitude] = useState(coordString(defaultLatitude));
  const [longitude, setLongitude] = useState(coordString(defaultLongitude));
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [statusKind, setStatusKind] = useState<StatusKind>("idle");

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    return () => {
      searchSeqRef.current += 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      abortRef.current?.abort();
    };
  }, []);

  function clearCoords() {
    selectedAddressRef.current = null;
    setLatitude("");
    setLongitude("");
  }

  function closeList() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function selectSuggestion(suggestion: Suggestion) {
    selectedAddressRef.current = suggestion.label;
    setQuery(suggestion.label);
    setLatitude(String(suggestion.latitude));
    setLongitude(String(suggestion.longitude));
    setSuggestions([]);
    closeList();
    setStatusKind("idle");
    inputRef.current?.focus();
  }

  function scheduleSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    abortRef.current?.abort();

    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      searchSeqRef.current += 1;
      setSuggestions([]);
      closeList();
      setStatusKind("idle");
      return;
    }

    const seq = ++searchSeqRef.current;
    // Never show a stale/empty dropdown while waiting.
    setSuggestions([]);
    closeList();
    setStatusKind("loading");

    debounceRef.current = setTimeout(() => {
      if (seq !== searchSeqRef.current) return;

      const controller = new AbortController();
      abortRef.current = controller;
      let timedOut = false;
      timeoutRef.current = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, SEARCH_TIMEOUT_MS);

      void fetchSuggestions(trimmed, controller.signal)
        .then((results) => {
          if (seq !== searchSeqRef.current) return;
          if (results.length === 0) {
            setSuggestions([]);
            closeList();
            setStatusKind("empty");
            return;
          }
          setSuggestions(results);
          setOpen(true);
          setActiveIndex(0);
          setStatusKind("idle");
        })
        .catch((error: unknown) => {
          if (seq !== searchSeqRef.current) return;
          const aborted =
            (error instanceof DOMException && error.name === "AbortError") ||
            controller.signal.aborted;
          if (aborted && !timedOut) {
            // Superseded by a newer keystroke — ignore.
            return;
          }
          setSuggestions([]);
          closeList();
          setStatusKind(timedOut ? "slow" : "error");
        })
        .finally(() => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        });
    }, DEBOUNCE_MS);
  }

  function onChange(value: string) {
    setQuery(value);
    if (
      selectedAddressRef.current &&
      value.trim() !== selectedAddressRef.current
    ) {
      clearCoords();
    }
    scheduleSearch(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeList();
      return;
    }

    if (event.key === "Enter") {
      if (open && suggestions.length > 0 && activeIndex >= 0) {
        event.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
      }
      return;
    }

    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (index) => (index - 1 + suggestions.length) % suggestions.length,
      );
    }
  }

  const listOpen = open && suggestions.length > 0;
  const statusMessage =
    statusKind === "idle" ? null : STATUS_COPY[statusKind];

  return (
    <div className="address-autocomplete" ref={rootRef}>
      <input
        ref={inputRef}
        id={id}
        className="form-input"
        name={name}
        type="text"
        value={query}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-busy={statusKind === "loading" || undefined}
        aria-activedescendant={
          listOpen && activeIndex >= 0
            ? `${listId}-option-${activeIndex}`
            : undefined
        }
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {/* Optional coords — kept when a suggestion is picked; cleared on manual edit. */}
      <input type="hidden" name="latitude" value={latitude} />
      <input type="hidden" name="longitude" value={longitude} />

      {listOpen ? (
        <ul className="address-autocomplete-list" id={listId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id} role="presentation">
              <button
                type="button"
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? "address-autocomplete-option is-active"
                    : "address-autocomplete-option"
                }
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectSuggestion(suggestion);
                }}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {statusMessage ? (
        <p className="address-autocomplete-status" aria-live="polite">
          {statusMessage}
        </p>
      ) : (
        <p className="address-autocomplete-status address-autocomplete-hint">
          Optional suggestions. Pick one for coordinates, or type any address.
        </p>
      )}
    </div>
  );
}
