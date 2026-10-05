import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { adminCreateOrder } from "../../../../server/billing";
import {
  errorResponse,
  guardMutation,
  json,
  readInput,
} from "../../../../server/http";

/** Admin membuat pesanan untuk pelanggan (jasa atau penjualan di luar sistem). */
export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    const order = await adminCreateOrder(actor, await readInput(request));
    return json({ order }, 201);
  } catch (e) {
    return errorResponse(e);
  }
};
