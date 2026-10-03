import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { importBudgetCsv } from "../../../server/budget";
import {
  guardMutation,
  readInput,
  json,
  errorResponse,
} from "../../../server/http";
export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    // Satu anggaran penuh berisi ratusan baris, jauh di atas batas bawaan.
    const data = await readInput(request, 1_000_000);
    return json(await importBudgetCsv(await getActor(request), data.csv));
  } catch (e) {
    return errorResponse(e);
  }
};
