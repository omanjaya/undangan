import type { APIRoute } from "astro";
import { getActor } from "../../../../../server/auth";
import { cancelOrder } from "../../../../../server/billing";
import {
  errorResponse,
  guardMutation,
  json,
  rateLimit,
} from "../../../../../server/http";

export const POST: APIRoute = async ({ request, params }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    rateLimit(`order:${actor?.userId || "anonymous"}`, 20);
    await cancelOrder(actor, params.number ?? "");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
};
