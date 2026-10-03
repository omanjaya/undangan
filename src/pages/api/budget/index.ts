import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { addBudgetItem, getBudget } from "../../../server/budget";
import {
  guardMutation,
  rateLimit,
  clientIp,
  readInput,
  json,
  errorResponse,
} from "../../../server/http";
export const GET: APIRoute = async ({ request }) => {
  try {
    return json(await getBudget(await getActor(request)));
  } catch (e) {
    return errorResponse(e);
  }
};
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    rateLimit(
      `budget-add:${actor?.id || clientIp(request, clientAddress)}`,
      30,
    );
    return json(await addBudgetItem(actor, await readInput(request)), 201);
  } catch (e) {
    return errorResponse(e);
  }
};
