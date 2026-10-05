import type { APIRoute } from "astro";
import { cookieValue, getActor } from "./auth";
import {
  errorResponse,
  guardMutation,
  json,
  rateLimit,
  readInput,
} from "./http";
import type { Actor } from "./services";

/**
 * Pembungkus endpoint akun: validasi origin, sesi wajib, batas laju per
 * pengguna, lalu menyerahkan aktor, token sesi saat ini, dan masukan.
 * `sensitive` (memerlukan kata sandi) memakai batas yang lebih ketat.
 */
export function accountEndpoint(
  name: string,
  handler: (
    actor: Actor,
    input: Record<string, unknown>,
    token: string | undefined,
  ) => Promise<Response>,
  options: { sensitive?: boolean } = {},
): APIRoute {
  return async ({ request }) => {
    try {
      guardMutation(request);
      const actor = await getActor(request);
      if (!actor) return json({ error: "Silakan masuk terlebih dahulu." }, 401);
      if (options.sensitive)
        rateLimit(`account-${name}:${actor.userId}`, 8, 15 * 60_000);
      else rateLimit(`account-${name}:${actor.userId}`, 30);
      const input = await readInput(request);
      return await handler(
        actor,
        input,
        cookieValue(request, "invitation_session"),
      );
    } catch (e) {
      return errorResponse(e);
    }
  };
}
