import type { APIRoute } from "astro";
import { createSession, register, sessionCookie } from "../../../server/auth";
import {
  clientIp,
  errorResponse,
  guardMutation,
  json,
  rateLimit,
  readInput,
} from "../../../server/http";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    rateLimit("register:" + clientIp(request, clientAddress), 5);
    const data = await readInput(request);
    const { userId } = await register(data);
    const token = await createSession(userId);
    return json({ ok: true }, 201, { "Set-Cookie": sessionCookie(token) });
  } catch (e) {
    return errorResponse(e);
  }
};
