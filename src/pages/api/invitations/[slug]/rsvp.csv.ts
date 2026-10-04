import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { exportRsvpCsv } from "../../../../server/services";
import { errorResponse } from "../../../../server/http";
export const GET: APIRoute = async ({ request, params }) => {
  try {
    const { slug, csv } = await exportRsvpCsv(
      await getActor(request),
      params.slug || "",
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rsvp-${slug}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
};
