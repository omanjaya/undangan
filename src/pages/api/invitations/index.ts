import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { createInvitation } from "../../../server/services";
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
      await createInvitation(await getActor(request), {
        slug: data.slug,
        copyFromSlug:
          typeof data.copyFromSlug === "string" ? data.copyFromSlug : undefined,
      }),
      201,
    );
  } catch (e) {
    return errorResponse(e);
  }
};
