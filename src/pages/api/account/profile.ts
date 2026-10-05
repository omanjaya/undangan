import { updateProfile } from "../../../server/account";
import { accountEndpoint } from "../../../server/account-api";
import { json } from "../../../server/http";

export const POST = accountEndpoint("profile", async (actor, input) =>
  json({ ok: true, ...(await updateProfile(actor, input)) }),
);
