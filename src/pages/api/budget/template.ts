import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { applyBudgetTemplate } from "../../../server/budget";
import {
  guardMutation,
  rateLimit,
  clientIp,
  json,
  errorResponse,
} from "../../../server/http";
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    rateLimit(
      `budget-template:${actor?.userId || clientIp(request, clientAddress)}`,
      30,
    );
    return json(await applyBudgetTemplate(actor));
  } catch (e) {
    return errorResponse(e);
  }
};
