const base = { timeZone: "Asia/Makassar" } as const;
const date = new Intl.DateTimeFormat("id-ID", {
  ...base,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTime = new Intl.DateTimeFormat("id-ID", {
  ...base,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDate = (iso?: string) =>
  iso && !Number.isNaN(Date.parse(iso)) ? date.format(new Date(iso)) : "-";
export const formatDateTime = (iso?: string) =>
  iso && !Number.isNaN(Date.parse(iso)) ? dateTime.format(new Date(iso)) : "-";

export const PLAN_LABEL = {
  trial: "Uji coba",
  active: "Aktif",
  expired: "Kedaluwarsa",
} as const;
export const PLAN_TONE = {
  trial: "",
  active: "ok",
  expired: "bad",
} as const;

/** Menambah parameter query ke URL halaman saat ini (tanpa `page` bila kosong). */
export function withParams(
  url: URL,
  changes: Record<string, string | number | undefined>,
) {
  const next = new URL(url);
  next.searchParams.delete("notice");
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === "") next.searchParams.delete(key);
    else next.searchParams.set(key, String(value));
  }
  return next.pathname + next.search;
}
