import type { APIRoute } from "astro";
import { getActor } from "../../../../../server/auth";
import { uploadProof } from "../../../../../server/billing";
import {
  errorResponse,
  guardMutation,
  json,
  rateLimit,
} from "../../../../../server/http";

/** Badan permintaan = berkas gambar; catatan opsional lewat header X-Proof-Note. */
export const POST: APIRoute = async ({ request, params }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    rateLimit(`proof:${actor?.userId || "anonymous"}`, 10);
    return json(
      { order: await uploadProof(actor, params.number ?? "", request) },
      201,
    );
  } catch (e) {
    return errorResponse(e);
  }
};
