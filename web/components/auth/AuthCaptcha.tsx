"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileLoader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoader) return turnstileLoader;

  const promise = new Promise<TurnstileApi>((resolve, reject) => {
    const script =
      document.querySelector<HTMLScriptElement>(
        'script[data-nexora-turnstile="true"]',
      ) ?? document.createElement("script");

    const onLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile did not initialize."));
    };
    const onError = () => reject(new Error("Turnstile failed to load."));

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!script.isConnected) {
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.nexoraTurnstile = "true";
      document.head.appendChild(script);
    }
  }).catch((error): never => {
    turnstileLoader = null;
    throw error;
  });

  turnstileLoader = promise;
  return promise;
}

export function turnstileSiteKey(): string {
  return (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();
}

export function captchaRequired(): boolean {
  return Boolean(turnstileSiteKey());
}

type AuthCaptchaProps = {
  onToken: (token: string | null) => void;
  token: string | null;
  className?: string;
};

/** Renders Turnstile when NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured. */
export function AuthCaptcha({
  onToken,
  token,
  className,
}: AuthCaptchaProps) {
  const siteKey = turnstileSiteKey();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const previousTokenRef = useRef(token);
  const [readyError, setReadyError] = useState<string | null>(null);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    void loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || widgetIdRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (value) => {
            setReadyError(null);
            onTokenRef.current(value);
          },
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => {
            onTokenRef.current(null);
            setReadyError(
              "Security check failed to load. Refresh and try again.",
            );
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          onTokenRef.current(null);
          setReadyError(
            "Security check failed to load. Refresh and try again.",
          );
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    const tokenWasConsumed = previousTokenRef.current && !token;
    previousTokenRef.current = token;
    if (tokenWasConsumed && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [token]);

  if (!siteKey) return null;

  return (
    <div className={className ?? "auth-captcha"}>
      <div ref={containerRef} />
      {readyError ? <p className="form-error">{readyError}</p> : null}
    </div>
  );
}

export function requireCaptchaToken(token: string | null | undefined): string | null {
  if (!captchaRequired()) return null;
  const value = (token || "").trim();
  if (!value) {
    throw new Error("Complete the captcha before continuing.");
  }
  return value;
}
