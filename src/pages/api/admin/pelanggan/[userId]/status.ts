import { setCustomerStatus } from "../../../../../server/admin";
import { adminPost } from "../../../../../server/admin-api";
import { DomainError } from "../../../../../modules/invitations/domain/invitation";

export const POST = adminPost(async ({ actor, params, data }) => {
  if (data.status !== "active" && data.status !== "suspended")
    throw new DomainError("Status tidak valid.", 400);
  return {
    body: {
      ok: true,
      ...(await setCustomerStatus(actor, params.userId || "", data.status)),
    },
  };
});
