import type { APIRoute } from "astro";
import { getActor } from "../../../server/auth";
import { addGuest, getGuests } from "../../../server/guests";
import {
  guardMutation,
  rateLimit,
  clientIp,
  readInput,
  json,
  errorResponse,
} from "../../../server/http";

export const GET: APIRoute = async ({ request, url }) => {
  try {
    return json(
      await getGuests(
        await getActor(request),
        url.searchParams.get("slug") || "",
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    const actor = await getActor(request);
    rateLimit(
      `guest-add:${actor?.userId || clientIp(request, clientAddress)}`,
      60,
    );
    const data = await readInput(request);
    return json(await addGuest(actor, String(data.slug || ""), data), 201);
  } catch (e) {
    return errorResponse(e);
  }
};
