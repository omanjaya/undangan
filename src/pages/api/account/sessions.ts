import { signOutOtherSessions } from "../../../server/account";
import { accountEndpoint } from "../../../server/account-api";
import { json } from "../../../server/http";

/** Keluar dari semua perangkat lain; sesi yang sedang dipakai dipertahankan. */
export const POST = accountEndpoint(
  "sessions",
  async (actor, _input, token) => {
    await signOutOtherSessions(actor, token);
    return json({ ok: true });
  },
);
