/**
 * Tujuan setelah login (`/login?next=`). Hanya jalur relatif satu origin yang
 * diterima, supaya parameter ini tidak bisa dipakai untuk mengalihkan
 * pengguna ke situs lain (open redirect).
 */
const BASE = "http://next-path.invalid";

export function safeNextPath(value: unknown, fallback = "/dashboard") {
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  if (!raw || raw.length > 500) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // Backslash, tab, baris baru, dan karakter kontrol ditafsirkan berbeda oleh peramban.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  // Jangan kembali ke halaman masuk/daftar: membuat putaran tanpa ujung.
  if (/^\/(login|daftar)(\/|$)/.test(url.pathname)) return fallback;
  return url.pathname + url.search + url.hash;
}
