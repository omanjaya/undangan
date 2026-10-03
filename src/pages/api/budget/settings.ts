import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { saveBudgetSettings } from "../../../server/budget";
import {
  guardMutation,
  rateLimit,
  clientIp,
  readInput,
  json,
  errorResponse,
} from "../../../server/http";
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    rateLimit(
      `budget-settings:${actor?.id || clientIp(request, clientAddress)}`,
      30,
    );
    return json(await saveBudgetSettings(actor, await readInput(request)));
  } catch (e) {
    return errorResponse(e);
  }
};
