import type { APIRoute } from "astro";
import { logout, sessionCookie } from "../../../server/auth";
import { errorResponse, guardMutation, json } from "../../../server/http";
export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    await logout(request);
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  } catch (e) {
    return errorResponse(e);
  }
};
