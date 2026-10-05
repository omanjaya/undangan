import type { APIRoute } from "astro";
import { buildRobots } from "../config/seo";
import { getSiteConfig } from "../config/site";

export const GET: APIRoute = () =>
  new Response(buildRobots(getSiteConfig().url), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
