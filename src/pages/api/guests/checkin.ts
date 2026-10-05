import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { checkInGuest } from "../../../server/guests";
import {
  guardMutation,
  readInput,
  rateLimit,
  clientIp,
  json,
  errorResponse,
} from "../../../server/http";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    // Pemindaian beruntun di pintu masuk butuh batas yang longgar.
    rateLimit(
      `guest-checkin:${actor?.userId || clientIp(request, clientAddress)}`,
      120,
    );
    const data = await readInput(request);
    return json(await checkInGuest(actor, String(data.slug || ""), data.code));
  } catch (e) {
    return errorResponse(e);
  }
};
