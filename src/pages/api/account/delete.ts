import { deleteAccount } from "../../../server/account";
import { accountEndpoint } from "../../../server/account-api";
import { sessionCookie } from "../../../server/auth";
import { json } from "../../../server/http";

export const POST = accountEndpoint(
  "delete",
  async (actor, input) => {
    await deleteAccount(actor, input);
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  },
  { sensitive: true },
);
