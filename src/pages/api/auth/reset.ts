import type { APIRoute } from "astro";
import { DomainError } from "../../../modules/invitations/domain/invitation";
import { resetPassword } from "../../../server/password-reset";
import {
  clientIp,
  errorResponse,
  guardMutation,
  json,
  rateLimit,
  readInput,
} from "../../../server/http";

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    guardMutation(request);
    rateLimit("reset:" + clientIp(request, clientAddress), 10);
    const data = await readInput(request);
    if (data.password !== data.confirm)
      throw new DomainError("Konfirmasi kata sandi tidak sama.");
    await resetPassword(data.token, data.password);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
};
