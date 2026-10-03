import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { addBudgetItem, getBudget } from "../../../server/budget";
import {
  guardMutation,
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
export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    return json(
      await addBudgetItem(await getActor(request), await readInput(request)),
      201,
    );
  } catch (e) {
    return errorResponse(e);
  }
};
