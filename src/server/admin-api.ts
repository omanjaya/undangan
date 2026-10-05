import type { APIRoute } from "astro";
import { getActor, cookieValue } from "./auth";
import { errorResponse, guardMutation, json, readInput } from "./http";
import type { Actor } from "./services";

type Context = {
  actor: Actor | null;
  request: Request;
  params: Record<string, string | undefined>;
  data: Record<string, unknown>;
  token?: string;
};
type Result = {
  body: unknown;
  status?: number;
  headers?: Record<string, string>;
};

/**
 * Membungkus endpoint POST admin: validasi origin, baca masukan, aktor dari
 * sesi. Pemeriksaan peran dilakukan oleh layanan di server/admin.ts
 * (`requireAdmin`), sehingga tak ada endpoint yang bisa lupa menjaganya.
 */
export function adminPost(
  handler: (context: Context) => Promise<Result>,
  options: { body?: boolean } = {},
): APIRoute {
  return async ({ request, params }) => {
    try {
      guardMutation(request);
      const actor = await getActor(request);
      const data = options.body === false ? {} : await readInput(request);
      const result = await handler({
        actor,
        request,
        params,
        data,
        token: cookieValue(request, "invitation_session"),
      });
      return json(result.body, result.status ?? 200, result.headers);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Tautan masuk untuk pesan klien. */
export const loginUrlFor = (request: Request) =>
  new URL(
    "/login",
    process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.url,
  ).href;
