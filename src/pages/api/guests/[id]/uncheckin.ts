import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { undoCheckIn } from "../../../../server/guests";
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
      `guest-uncheckin:${actor?.id || clientIp(request, clientAddress)}`,
      60,
    );
    return json(await undoCheckIn(actor, params.id || ""));
  } catch (e) {
    return errorResponse(e);
  }
};
