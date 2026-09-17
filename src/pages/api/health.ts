import type { APIRoute } from "astro";
import { validateOwnerConfiguration } from "../../server/auth";
import { json } from "../../server/http";
import { readState } from "../../modules/invitations/infrastructure/store";
export const GET: APIRoute = async () => {
  try {
    validateOwnerConfiguration();
    await readState();
    return json({
      status: "ok",
      storage: process.env.DATABASE_URL ? "postgresql" : "development-file",
    });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
};
