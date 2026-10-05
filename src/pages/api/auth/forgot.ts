import type { APIRoute } from "astro";
import { DomainError } from "../../../modules/invitations/domain/invitation";
import { mailAvailable } from "../../../server/mail";
import {
  RESET_REQUEST_MESSAGE,
  requestPasswordReset,
} from "../../../server/password-reset";
import {
  clientIp,
  errorResponse,
  guardMutation,
  json,
  rateLimit,
  readInput,
} from "../../../server/http";

/**
 * Minta tautan atur ulang kata sandi. Jawabannya selalu sama untuk email
 * terdaftar maupun tidak (anti-enumerasi); hanya batas per IP yang dapat
 * menjawab berbeda, dan itu tidak bergantung pada email.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    rateLimit("forgot:" + clientIp(request, clientAddress), 5, 15 * 60_000);
    const data = await readInput(request);
    if (!mailAvailable())
      throw new DomainError(
        "Pengiriman email belum tersedia. Hubungi admin lewat WhatsApp.",
        503,
      );
    const origin = process.env.APP_URL
      ? new URL(process.env.APP_URL).origin
      : new URL(request.url).origin;
    await requestPasswordReset(String(data.email || ""), { origin });
    return json({ ok: true, message: RESET_REQUEST_MESSAGE });
  } catch (e) {
    return errorResponse(e);
  }
};
