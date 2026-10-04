import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { updateGuest } from "../../../../server/guests";
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
      `guest-edit:${actor?.id || clientIp(request, clientAddress)}`,
      120,
    );
    return json(
      await updateGuest(actor, params.id || "", await readInput(request)),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
