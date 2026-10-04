import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { removeGuest } from "../../../../server/guests";
import {
  guardMutation,
  rateLimit,
  clientIp,
  json,
  errorResponse,
} from "../../../../server/http";

export const POST: APIRoute = async ({ request, params, clientAddress }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    rateLimit(
      `guest-delete:${actor?.id || clientIp(request, clientAddress)}`,
      120,
    );
    return json(await removeGuest(actor, params.id || ""));
  } catch (e) {
    return errorResponse(e);
  }
};
