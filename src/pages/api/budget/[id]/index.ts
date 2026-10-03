import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { updateBudgetItem } from "../../../../server/budget";
import {
  guardMutation,
  readInput,
  json,
  errorResponse,
} from "../../../../server/http";
export const POST: APIRoute = async ({ request, params }) => {
  try {
    guardMutation(request);
    return json(
      await updateBudgetItem(
        await getActor(request),
        params.id || "",
        await readInput(request),
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
