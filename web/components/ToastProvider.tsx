"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastTone = "neutral" | "success" | "error";

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS: Record<ToastTone, number> = {
  neutral: 3000,
  success: 3000,
  error: 4500,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<ToastTone>("neutral");
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    hideTimer.current = null;
    clearTimer.current = null;
  }, []);

  const showToast = useCallback(
    (next: string, nextTone: ToastTone = "neutral") => {
      clearTimers();
      setMessage(next);
      setTone(nextTone);
      setVisible(true);
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        clearTimer.current = setTimeout(() => {
          setMessage(null);
          setTone("neutral");
        }, 200);
      }, DURATION_MS[nextTone]);
    },
    [clearTimers],
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  const toneClass =
    tone === "success"
      ? " app-toast--success"
      : tone === "error"
        ? " app-toast--error"
        : "";

  const isError = tone === "error";

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <div
          className={`app-toast${toneClass}${visible ? " is-visible" : ""}`}
          role={isError ? "alert" : "status"}
          aria-live={isError ? "assertive" : "polite"}
        >
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
