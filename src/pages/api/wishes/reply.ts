import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { replyToWish } from "../../../server/services";
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
    return json(
      await replyToWish(await getActor(request), String(data.id), data.reply),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
