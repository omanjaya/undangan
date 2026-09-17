import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { renameInvitation } from "../../../../server/services";
import {
  errorResponse,
  guardMutation,
  json,
  readInput,
} from "../../../../server/http";
export const POST: APIRoute = async ({ request, params }) => {
  try {
    guardMutation(request);
    const data = await readInput(request);
    return json(
      await renameInvitation(
        await getActor(request),
        params.slug || "",
        data.newSlug,
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
