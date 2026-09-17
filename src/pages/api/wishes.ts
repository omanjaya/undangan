import type { APIRoute } from "astro";
import { getActor } from "../../server/auth";
import { getWishes, moderateWish } from "../../server/services";
import {
  guardMutation,
  readInput,
  json,
  errorResponse,
} from "../../server/http";
import { DomainError } from "../../modules/invitations/domain/invitation";
export const GET: APIRoute = async ({ url }) => {
  try {
    return json({
      wishes: await getWishes(url.searchParams.get("slug") || "amara-raka"),
    });
  } catch (e) {
    return errorResponse(e);
  }
};
export const POST: APIRoute = async ({ request }) => {
  try {
    guardMutation(request);
    const data = await readInput(request);
    if (data.status !== "approved" && data.status !== "hidden")
      throw new DomainError("Status tidak valid.");
    return json(
      await moderateWish(await getActor(request), String(data.id), data.status),
    );
  } catch (e) {
    return errorResponse(e);
  }
};
