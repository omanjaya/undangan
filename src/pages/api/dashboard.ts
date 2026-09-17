import type { APIRoute } from "astro";
import { getActor } from "../../server/auth";
import { getDashboardData } from "../../server/services";
import { json, errorResponse } from "../../server/http";
export const GET: APIRoute = async ({ request }) => {
  try {
    return json(await getDashboardData(await getActor(request)));
  } catch (e) {
    return errorResponse(e);
  }
};
