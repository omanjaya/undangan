import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { exportGuestsCsv } from "../../../server/guests";
import { errorResponse } from "../../../server/http";

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const slug = url.searchParams.get("slug") || "";
    const origin = process.env.APP_URL
      ? new URL(process.env.APP_URL).origin
      : url.origin;
    const csv = await exportGuestsCsv(await getActor(request), slug, origin);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="daftar-tamu.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
};
