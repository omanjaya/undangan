import { endImpersonation } from "../../../server/admin";
import { adminPost } from "../../../server/admin-api";
import { sessionCookie } from "../../../server/auth";

/** Dipanggil dari sesi pelanggan hasil penyamaran; bukan endpoint khusus admin. */
export const POST = adminPost(
  async ({ request }) => {
    const { token, redirect } = await endImpersonation(request);
    return {
      body: { ok: true, redirect },
      headers: { "Set-Cookie": sessionCookie(token) },
    };
  },
  { body: false },
);
