import type { APIRoute } from "astro";
import { login, sessionCookie } from "../../../server/auth";
import {
  errorResponse,
  guardMutation,
  json,
  rateLimit,
  readInput,
} from "../../../server/http";
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    rateLimit("login:" + clientAddress, 8);
    const data = await readInput(request);
    const token = await login(
      String(data.email || ""),
      String(data.password || ""),
    );
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(token) });
  } catch (e) {
    return errorResponse(e);
  }
};
