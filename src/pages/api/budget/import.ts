import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { importBudgetCsv } from "../../../server/budget";
import {
  guardMutation,
  readInput,
  rateLimit,
  clientIp,
  json,
  errorResponse,
} from "../../../server/http";
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    // Sesi diperiksa dan kuota dipakai sebelum body besar dibaca, supaya
    // permintaan anonim tidak memaksa server menampung satu megabyte.
    const actor = await getActor(request);
    rateLimit(
      `budget-import:${actor?.userId || clientIp(request, clientAddress)}`,
      5,
    );
    const data = await readInput(request, 1_000_000);
    return json(
      await importBudgetCsv(actor, data.csv, {
        skipExisting: data.skipExisting === true,
      }),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
