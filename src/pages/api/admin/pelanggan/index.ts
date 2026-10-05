import { createClientAccount } from "../../../../server/admin";
import { adminPost, loginUrlFor } from "../../../../server/admin-api";

export const POST = adminPost(async ({ actor, data, request }) => ({
  body: await createClientAccount(actor, data, loginUrlFor(request)).then(
    (result) => ({
      ok: true,
      ...result,
      detailUrl: `/admin/pelanggan/${result.userId}`,
    }),
  ),
  status: 201,
}));
