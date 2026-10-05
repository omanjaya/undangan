import type { APIRoute } from "astro";
import { exportAccountData } from "../../../server/account";
import { getActor } from "../../../server/auth";
import { errorResponse, rateLimit } from "../../../server/http";

/** Unduh data saya (JSON). Hanya membaca, tetapi memerlukan sesi dan dibatasi lajunya. */
export const GET: APIRoute = async ({ request }) => {
  try {
    const actor = await getActor(request);
    if (actor) rateLimit(`account-export:${actor.userId}`, 5);
    const data = await exportAccountData(actor);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="data-saya-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
};
