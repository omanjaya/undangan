import type { APIRoute } from "astro";
import { recordGuestOpen } from "../../../server/guests";
import {
  guardMutation,
  readInput,
  rateLimit,
  clientIp,
  json,
  errorResponse,
} from "../../../server/http";

/** Dipanggil tanpa sesi dari halaman tamu; hanya mencatat buka untuk kode yang sah. */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    rateLimit("guest-open:" + clientIp(request, clientAddress), 30);
    const data = await readInput(request, 2048);
    const code = typeof data.code === "string" ? data.code : "";
    // Kode yang sama tidak boleh menggelembungkan hitungan dari satu pengunjung.
    rateLimit(`guest-open-code:${code.slice(0, 16)}`, 6);
    return json({ ok: await recordGuestOpen(String(data.slug || ""), code) });
  } catch (e) {
    return errorResponse(e);
  }
};
