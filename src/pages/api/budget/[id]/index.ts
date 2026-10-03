import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { updateBudgetItem } from "../../../../server/budget";
import {
  guardMutation,
  rateLimit,
  clientIp,
  readInput,
  json,
  errorResponse,
} from "../../../../server/http";
export const POST: APIRoute = async ({ request, params, clientAddress }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    rateLimit(
      `budget-edit:${actor?.id || clientIp(request, clientAddress)}`,
      60,
    );
    return json(
      await updateBudgetItem(actor, params.id || "", await readInput(request)),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
