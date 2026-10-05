import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { adminSaveSettings } from "../../../server/billing";
import {
  errorResponse,
  guardMutation,
  json,
  readInput,
} from "../../../server/http";

export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    await adminSaveSettings(actor, await readInput(request, 65_536));
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
};
