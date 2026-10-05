import { resetCustomerPassword } from "../../../../../server/admin";
import { adminPost } from "../../../../../server/admin-api";

export const POST = adminPost(
  async ({ actor, params }) => ({
    body: {
      ok: true,
      ...(await resetCustomerPassword(actor, params.userId || "")),
    },
  }),
  { body: false },
);
