import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { saveDraft } from "../../../../server/services";
import {
  guardMutation,
  readInput,
  json,
  errorResponse,
} from "../../../../server/http";
export const POST: APIRoute = async ({ request, params }) => {
  try {
    guardMutation(request);
    const data = await readInput(request, 65_536);
    return json(
      await saveDraft(await getActor(request), {
        slug: params.slug || "",
        lockVersion: Number(data.lockVersion),
        content: data.content,
      }),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
