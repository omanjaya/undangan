import { ZodError } from "zod";
import { DomainError } from "../modules/invitations/domain/invitation";
const limits = new Map<string, { count: number; reset: number }>();
export function json(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}
export function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return json({ error: error.issues.map((i) => i.message).join(" ") }, 400);
  if (error instanceof DomainError)
    return json({ error: error.message }, error.status);
  console.error(
    "Request failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  return json({ error: "Terjadi kesalahan. Silakan coba kembali." }, 500);
}
export function guardMutation(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : new URL(request.url).origin;
  if (!origin || origin !== expected)
    throw new DomainError("Origin permintaan tidak diizinkan.", 403);
}
/**
 * IP pengunjung sebenarnya. Aplikasi hanya mendengar di 127.0.0.1 dan selalu
 * diakses lewat reverse proxy, sehingga `clientAddress` bernilai sama untuk
 * semua orang dan rate limit menjadi satu ember bersama. Proxy menambahkan IP
 * asli di akhir X-Forwarded-For, jadi entri terakhir yang dipakai — entri awal
 * bisa dipalsukan pengunjung.
 */
export function clientIp(request: Request, fallback: string) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return ipBucket(fallback);
  const hops = forwarded
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return ipBucket(hops.at(-1) || fallback);
}

/**
 * IPv6 dikelompokkan per /64: satu pengguna biasanya memegang seluruh /64,
 * sehingga tanpa ini penyerang dapat memakai jutaan alamat untuk menghindari
 * batas dan memenuhi tabel limiter.
 */
export function ipBucket(ip: string) {
  if (!ip.includes(":")) return ip;
  // IPv4-mapped (::ffff:1.2.3.4) tetap diperlakukan sebagai IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const groups = head ? head.split(":") : [];
  if (ip.includes("::")) {
    const rest = tail ? tail.split(":") : [];
    groups.push(
      ...Array(Math.max(0, 8 - groups.length - rest.length)).fill("0"),
    );
    groups.push(...rest);
  }
  if (groups.length !== 8) return ip;
  return (
    groups
      .slice(0, 4)
      .map((g) => g.replace(/^0+(?=.)/, ""))
      .join(":") + "::/64"
  );
}
/**
 * Menghitung satu permintaan pada ember `key`; true bila batas `max` dalam
 * jendela `windowMs` sudah terlampaui (permintaan itu tidak dihitung).
 */
export function rateLimited(key: string, max = 15, windowMs = 60000) {
  const now = Date.now();
  if (limits.size >= 10000)
    for (const [k, v] of limits) if (v.reset < now) limits.delete(k);
  const limit = limits.get(key);
  if (limit && limit.reset > now) {
    if (limit.count >= max) return true;
    limit.count++;
    return false;
  }
  if (!limit && limits.size >= 10000)
    throw new DomainError("Layanan sedang sibuk. Silakan coba kembali.", 429);
  limits.set(key, { count: 1, reset: now + windowMs });
  return false;
}
export function rateLimit(key: string, max = 15, windowMs = 60000) {
  if (rateLimited(key, max, windowMs))
    throw new DomainError(
      windowMs > 60000
        ? "Terlalu banyak permintaan. Coba lagi beberapa menit lagi."
        : "Terlalu banyak permintaan. Coba lagi dalam satu menit.",
      429,
    );
}
// Percobaan gagal (mis. kata sandi salah) per kunci; hanya kegagalan yang dihitung.
const failures = new Map<string, { count: number; reset: number }>();
export function assertNotLockedOut(key: string, max: number, message: string) {
  const entry = failures.get(key);
  if (entry && entry.reset > Date.now() && entry.count >= max)
    throw new DomainError(message, 429);
}
export function recordFailure(key: string, windowMs: number) {
  const now = Date.now();
  if (failures.size >= 10000)
    for (const [k, v] of failures) if (v.reset < now) failures.delete(k);
  const entry = failures.get(key);
  if (entry && entry.reset > now) entry.count++;
  else failures.set(key, { count: 1, reset: now + windowMs });
}
export function clearFailures(key: string) {
  failures.delete(key);
}
export async function readInput(request: Request, maximumBytes = 16_384) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maximumBytes)
    throw new DomainError("Data terlalu besar.", 413);
  const contentType = request.headers.get("content-type")?.split(";")[0].trim();
  if (
    contentType !== "application/json" &&
    contentType !== "application/x-www-form-urlencoded"
  ) {
    throw new DomainError("Format permintaan tidak didukung.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("Data permintaan kosong.");
  const decoder = new TextDecoder();
  let raw = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new DomainError("Data terlalu besar.", 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error("Expected object");
      return data as Record<string, unknown>;
    } catch {
      throw new DomainError("Format JSON tidak valid.");
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}
