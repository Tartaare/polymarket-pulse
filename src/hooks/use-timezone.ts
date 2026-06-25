import { useSyncExternalStore } from "react";

type TimezoneMode = "local" | "et";

const STORAGE_KEY = "polysim-timezone";
const listeners = new Set<() => void>();

function getSnapshot(): TimezoneMode {
  if (typeof window === "undefined") return "et";
  return (localStorage.getItem(STORAGE_KEY) as TimezoneMode) || "et";
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setTimezone(mode: TimezoneMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  listeners.forEach((cb) => cb());
}

export function useTimezone(): [TimezoneMode, typeof setTimezone] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => "et" as const);
  return [mode, setTimezone];
}

/** Format a timestamp according to the user's timezone preference. */
export function formatTime(ts: number, mode: TimezoneMode, opts?: Intl.DateTimeFormatOptions): string {
  const tz = mode === "et" ? "America/New_York" : undefined;
  const defaults: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false };
  return new Date(ts).toLocaleTimeString("fr-FR", { ...defaults, ...opts, timeZone: tz });
}

export function formatDate(ts: number, mode: TimezoneMode): string {
  const tz = mode === "et" ? "America/New_York" : undefined;
  return new Date(ts).toLocaleDateString("fr-FR", {
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
}

export function formatDatetime(ts: number, mode: TimezoneMode): string {
  return `${formatDate(ts, mode)}, ${formatTime(ts, mode)}`;
}

export function tzLabel(mode: TimezoneMode): string {
  return mode === "et" ? "ET" : Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ") ?? "Local";
}
