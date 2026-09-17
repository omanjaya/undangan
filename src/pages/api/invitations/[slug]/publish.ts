import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { publishInvitation } from "../../../../server/services";
import { guardMutation, json, errorResponse } from "../../../../server/http";
export const POST: APIRoute = async ({ request, params }) => {
  try {
    guardMutation(request);
    return json(
      await publishInvitation(await getActor(request), params.slug || ""),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
