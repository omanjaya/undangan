import type { APIRoute } from "astro";
import { validateOwnerConfiguration } from "../../server/auth";
import { json } from "../../server/http";
import { readGlobal } from "../../modules/invitations/infrastructure/global-store";
export const GET: APIRoute = async () => {
  try {
    validateOwnerConfiguration();
    await readGlobal();
    return json({
      status: "ok",
      storage: process.env.DATABASE_URL ? "postgresql" : "development-file",
    });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
};
