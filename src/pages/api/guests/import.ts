import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { importGuests } from "../../../server/guests";
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
    // Sesi diperiksa dan kuota dipakai sebelum body besar dibaca.
    const actor = await getActor(request);
    rateLimit(
      `guest-import:${actor?.id || clientIp(request, clientAddress)}`,
      10,
    );
    const data = await readInput(request, 500_000);
    return json(await importGuests(actor, String(data.slug || ""), data.text));
  } catch (e) {
    return errorResponse(e);
  }
};
