import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { applyBudgetTemplate } from "../../../server/budget";
import { guardMutation, json, errorResponse } from "../../../server/http";
export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    return json(await applyBudgetTemplate(await getActor(request)));
  } catch (e) {
    return errorResponse(e);
  }
};
