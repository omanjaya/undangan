import type { AstroGlobal } from "astro";
import { getActor } from "./auth";
import type { Actor } from "./services";

/**
 * Penjaga halaman pelanggan (/dashboard/paket, /dashboard/tagihan/*):
 *
 *   const guard = await customerPage(Astro);
 *   if (guard instanceof Response) return guard;
 */
export async function customerPage(
  astro: AstroGlobal,
): Promise<Actor | Response> {
  astro.response.headers.set("Cache-Control", "private, no-store");
  const actor = await getActor(astro.request);
  if (!actor)
    return astro.redirect(
      "/login?next=" + encodeURIComponent(astro.url.pathname),
    );
  return actor;
}
