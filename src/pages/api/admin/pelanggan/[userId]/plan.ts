import { setManualPlan } from "../../../../../server/admin";
import { adminPost } from "../../../../../server/admin-api";

export const POST = adminPost(async ({ actor, params, data }) => ({
  body: {
    ok: true,
    ...(await setManualPlan(actor, params.userId || "", data)),
  },
}));
