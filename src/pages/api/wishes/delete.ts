import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { deleteWish } from "../../../server/services";
import {
  guardMutation,
  readInput,
  json,
  errorResponse,
} from "../../../server/http";
export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    const data = await readInput(request);
    return json(await deleteWish(await getActor(request), String(data.id)));
  } catch (e) {
    return errorResponse(e);
  }
};
