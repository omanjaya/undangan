import type { APIRoute } from "astro";
import { getActor } from "../../server/auth";
import { listMedia, uploadMedia } from "../../server/media";
import {
  errorResponse,
  guardMutation,
  json,
  rateLimit,
} from "../../server/http";
export const GET: APIRoute = async ({ request }) => {
  try {
    return json({ assets: await listMedia(await getActor(request)) });
  } catch (e) {
    return errorResponse(e);
  }
};
export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    rateLimit(`upload:${actor?.id || "anonymous"}`, 20);
    return json({ asset: await uploadMedia(actor, request) }, 201);
  } catch (e) {
    return errorResponse(e);
  }
};
