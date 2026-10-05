import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { startOrder } from "../../../../server/billing";
import {
  errorResponse,
  guardMutation,
  json,
  rateLimit,
  readInput,
} from "../../../../server/http";

/** Pelanggan memilih paket: membuat tagihan, atau memakai ulang yang masih terbuka. */
export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    rateLimit(`order:${actor?.userId || "anonymous"}`, 20);
    const data = await readInput(request);
    return json(await startOrder(actor, data.packageId), 201);
  } catch (e) {
    return errorResponse(e);
  }
};
