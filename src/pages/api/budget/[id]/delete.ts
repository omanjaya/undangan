import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { removeBudgetItem } from "../../../../server/budget";
import { guardMutation, json, errorResponse } from "../../../../server/http";
export const POST: APIRoute = async ({ request, params }) => {
  try {
    guardMutation(request);
    return json(
      await removeBudgetItem(await getActor(request), params.id || ""),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
