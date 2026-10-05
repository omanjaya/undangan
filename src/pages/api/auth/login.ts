import type { APIRoute } from "astro";
import { safeNextPath } from "../../../modules/accounts/next-path";
import { login, sessionCookie } from "../../../server/auth";
import {
  assertNotLockedOut,
  clearFailures,
  clientIp,
  errorResponse,
  guardMutation,
  json,
  rateLimit,
  readInput,
  recordFailure,
} from "../../../server/http";
import { DomainError } from "../../../modules/invitations/domain/invitation";

// Percobaan gagal dihitung per email (selain batas per IP) agar satu akun tidak
// bisa ditebak lewat banyak alamat IP. Pesannya sama untuk email yang tidak dikenal.
const FAILURE_MAX = 10;
const FAILURE_WINDOW_MS = 15 * 60_000;
const LOCKED =
  "Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit.";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    rateLimit("login:" + clientIp(request, clientAddress), 8);
    const data = await readInput(request);
    const email = String(data.email || "")
      .trim()
      .toLowerCase()
      .slice(0, 254);
    const key = "login-fail:" + email;
    assertNotLockedOut(key, FAILURE_MAX, LOCKED);
    let token: string;
    try {
      token = await login(email, String(data.password || ""));
    } catch (error) {
      if (error instanceof DomainError && error.status === 401)
        recordFailure(key, FAILURE_WINDOW_MS);
      throw error;
    }
    clearFailures(key);
    return json({ ok: true, next: safeNextPath(data.next) }, 200, {
      "Set-Cookie": sessionCookie(token),
    });
  } catch (e) {
    return errorResponse(e);
  }
};
