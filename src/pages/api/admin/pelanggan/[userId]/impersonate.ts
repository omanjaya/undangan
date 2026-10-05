import { startImpersonation } from "../../../../../server/admin";
import { adminPost } from "../../../../../server/admin-api";
import { sessionCookie } from "../../../../../server/auth";

export const POST = adminPost(
  async ({ actor, params, token }) => {
    const sessionToken = await startImpersonation(
      actor,
      params.userId || "",
      token,
    );
    return {
      body: { ok: true, redirect: "/dashboard" },
      headers: { "Set-Cookie": sessionCookie(sessionToken) },
    };
  },
  { body: false },
);
