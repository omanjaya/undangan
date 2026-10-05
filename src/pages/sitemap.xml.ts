import type { APIRoute } from "astro";
import { buildSitemap } from "../config/seo";
import { getSiteConfig } from "../config/site";
import { themes } from "../modules/invitations/domain/themes";

export const GET: APIRoute = () =>
  new Response(
    buildSitemap(
      getSiteConfig().url,
      themes.map((t) => t.id),
    ),
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
