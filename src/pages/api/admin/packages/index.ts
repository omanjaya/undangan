import type { APIRoute } from "astro";
import { getActor } from "../../../../server/auth";
import { adminSavePackage } from "../../../../server/billing";
import {
  errorResponse,
  guardMutation,
  json,
  readInput,
} from "../../../../server/http";

/** `mode` = "create" atau "update"; sisanya bidang paket. */
export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    const { mode, ...input } = await readInput(request);
    const record = await adminSavePackage(
      actor,
      input,
      mode === "create" ? "create" : "update",
    );
    return json({ package: record }, mode === "create" ? 201 : 200);
  } catch (e) {
    return errorResponse(e);
  }
};
