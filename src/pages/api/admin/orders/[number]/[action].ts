import type { APIRoute } from "astro";
import { getActor } from "../../../../../server/auth";
import {
  adminCancelOrderByNumber,
  adminRejectOrder,
  adminVerifyOrder,
} from "../../../../../server/billing";
import { DomainError } from "../../../../../modules/invitations/domain/invitation";
import {
  errorResponse,
  guardMutation,
  json,
  readInput,
} from "../../../../../server/http";

/** Tindakan admin pada satu pesanan: verify, reject (dengan alasan), cancel. */
export const POST: APIRoute = async ({ request, params }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    const number = params.number ?? "";
    switch (params.action) {
      case "verify":
        return json({ order: await adminVerifyOrder(actor, number) });
      case "reject": {
        const data = await readInput(request);
        return json({
          order: await adminRejectOrder(actor, number, data.reason),
        });
      }
      case "cancel":
        return json({ order: await adminCancelOrderByNumber(actor, number) });
      default:
        throw new DomainError("Tindakan tidak dikenal.", 404);
    }
  } catch (e) {
    return errorResponse(e);
  }
};
