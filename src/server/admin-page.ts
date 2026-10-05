import type { AstroGlobal } from "astro";
import { getActor } from "./auth";
import type { Actor } from "./services";

/**
 * Penjaga halaman /admin/*. Mengembalikan aktor admin, atau Response yang
 * harus langsung dikembalikan halaman:
 *
 *   const guard = await adminPage(Astro);
 *   if (guard instanceof Response) return guard;
 *   const actor = guard;
 */
export async function adminPage(astro: AstroGlobal): Promise<Actor | Response> {
  astro.response.headers.set("Cache-Control", "private, no-store");
  const actor = await getActor(astro.request);
  if (!actor)
    return astro.redirect(
      "/login?next=" + encodeURIComponent(astro.url.pathname),
    );
  if (actor.role !== "admin")
    return new Response("Akses hanya untuk admin.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  return actor;
}
