import { deleteCustomer } from "../../../../../server/admin";
import { adminPost } from "../../../../../server/admin-api";

export const POST = adminPost(async ({ actor, params, data }) => ({
  body: {
    ok: true,
    ...(await deleteCustomer(
      actor,
      params.userId || "",
      String(data.confirm || ""),
    )),
    redirect: "/admin/pelanggan",
  },
}));
