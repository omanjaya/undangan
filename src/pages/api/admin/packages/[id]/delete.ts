import type { APIRoute } from "astro";
import { getActor } from "../../../../../server/auth";
import { adminDeletePackage } from "../../../../../server/billing";
import { errorResponse, guardMutation, json } from "../../../../../server/http";

export const POST: APIRoute = async ({ request, params }) => {
  try {
    guardMutation(request);
    await adminDeletePackage(await getActor(request), params.id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
};
