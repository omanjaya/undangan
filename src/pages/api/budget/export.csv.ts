import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { exportBudgetCsv } from "../../../server/budget";
import { errorResponse } from "../../../server/http";
export const GET: APIRoute = async ({ request }) => {
  try {
    const csv = await exportBudgetCsv(await getActor(request));
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="anggaran-pernikahan.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
};
