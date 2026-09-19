"use client";

export const NEXORA_DATA_INVALIDATED = "nexora:data-invalidated";

export type DataInvalidationScope =
  | "urgent-actions"
  | "applications"
  | "work-orders"
  | "message-unread"
  | "notification-extras";

export type DataInvalidationDetail = {
  path?: string;
  scopes: DataInvalidationScope[];
};

export function emitDataInvalidation(
  scopes: DataInvalidationScope[],
  path?: string,
): void {
  if (typeof window === "undefined" || scopes.length === 0) return;
  window.dispatchEvent(
    new CustomEvent<DataInvalidationDetail>(NEXORA_DATA_INVALIDATED, {
      detail: { path, scopes: [...new Set(scopes)] },
    }),
  );
}

export function onDataInvalidated(
  scope: DataInvalidationScope,
  listener: () => void,
): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<DataInvalidationDetail>).detail;
    if (detail?.scopes?.includes(scope)) listener();
  };
  window.addEventListener(NEXORA_DATA_INVALIDATED, handler);
  return () => window.removeEventListener(NEXORA_DATA_INVALIDATED, handler);
}
