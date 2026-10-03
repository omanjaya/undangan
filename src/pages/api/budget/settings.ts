import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { saveBudgetSettings } from "../../../server/budget";
import {
  guardMutation,
  readInput,
  json,
  errorResponse,
} from "../../../server/http";
export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    return json(
      await saveBudgetSettings(
        await getActor(request),
        await readInput(request),
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
