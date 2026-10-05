import { changeEmail } from "../../../server/account";
import { accountEndpoint } from "../../../server/account-api";
import { json } from "../../../server/http";

export const POST = accountEndpoint(
  "email",
  async (actor, input) =>
    json({ ok: true, ...(await changeEmail(actor, input)) }),
  { sensitive: true },
);
