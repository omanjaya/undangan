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
  if (!forwarded) return fallback;
  const hops = forwarded
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops.at(-1) || fallback;
}
export function rateLimit(key: string, max = 15) {
  const now = Date.now();
  if (limits.size >= 10000)
    for (const [k, v] of limits) if (v.reset < now) limits.delete(k);
  const limit = limits.get(key);
  if (limit && limit.reset > now) {
    if (limit.count >= max)
      throw new DomainError(
        "Terlalu banyak permintaan. Coba lagi dalam satu menit.",
        429,
      );
    limit.count++;
  } else {
    if (!limit && limits.size >= 10000)
      throw new DomainError("Layanan sedang sibuk. Silakan coba kembali.", 429);
    limits.set(key, { count: 1, reset: now + 60000 });
  }
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
