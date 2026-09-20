import type { APIRoute } from "astro";
import { getActor } from "../../server/auth";
import { getDashboardData } from "../../server/services";
import { json, errorResponse } from "../../server/http";
export const GET: APIRoute = async ({ request, url }) => {
  try {
    return json(
      await getDashboardData(
        await getActor(request),
        url.searchParams.get("undangan") || undefined,
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
