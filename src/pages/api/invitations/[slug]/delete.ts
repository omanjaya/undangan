import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { deleteInvitation } from "../../../../server/services";
import { guardMutation, json, errorResponse } from "../../../../server/http";
export const POST: APIRoute = async ({ request, params }) => {
  try {
    guardMutation(request);
    return json(
      await deleteInvitation(await getActor(request), params.slug || ""),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
