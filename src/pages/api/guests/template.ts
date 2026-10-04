import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { saveWaTemplate } from "../../../server/guests";
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
    rateLimit(
      `guest-template:${actor?.id || clientIp(request, clientAddress)}`,
      30,
    );
    const data = await readInput(request);
    return json(
      await saveWaTemplate(actor, String(data.slug || ""), data.template),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
