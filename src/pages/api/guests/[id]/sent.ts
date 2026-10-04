import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { markGuestSent } from "../../../../server/guests";
import {
  guardMutation,
  rateLimit,
  clientIp,
  readInput,
  json,
  errorResponse,
} from "../../../../server/http";

export const POST: APIRoute = async ({ request, params, clientAddress }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    rateLimit(
      `guest-sent:${actor?.id || clientIp(request, clientAddress)}`,
      240,
    );
    const data = await readInput(request);
    const sent = data.sent !== false && data.sent !== "false";
    return json(await markGuestSent(actor, params.id || "", sent));
  } catch (e) {
    return errorResponse(e);
  }
};
