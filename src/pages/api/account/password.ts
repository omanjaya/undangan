import { changePassword } from "../../../server/account";
import { accountEndpoint } from "../../../server/account-api";
import { json } from "../../../server/http";

export const POST = accountEndpoint(
  "password",
  async (actor, input, token) => {
    await changePassword(actor, token, input);
    return json({ ok: true });
  },
  { sensitive: true },
);
