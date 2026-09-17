import type { APIRoute } from "astro";
import { randomBytes } from "node:crypto";
import { cookieValue } from "../../server/auth";
import { submitRsvp } from "../../server/services";
import {
  guardMutation,
  readInput,
  rateLimit,
  json,
  errorResponse,
} from "../../server/http";
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    rateLimit("rsvp:" + clientAddress);
    const data = await readInput(request);
    const existing = cookieValue(request, "invitation_visitor");
    const token =
      existing && /^[a-f0-9]{64}$/.test(existing)
        ? existing
        : randomBytes(32).toString("hex");
    const result = await submitRsvp(
      String(data.slug || "amara-raka"),
      data,
      token,
    );
    return json(result, 200, {
      "Set-Cookie": `invitation_visitor=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    });
  } catch (e) {
    return errorResponse(e);
  }
};
