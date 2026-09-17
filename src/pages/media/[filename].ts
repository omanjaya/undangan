import type { APIRoute } from "astro";
import { getActor } from "../../server/auth";
import { serveMedia } from "../../server/media";
import { errorResponse } from "../../server/http";
export const GET: APIRoute = async ({ request, params }) => {
  try {
    return await serveMedia(
      params.filename || "",
      request,
      await getActor(request),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
export const HEAD = GET;
