import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  const editorPreview =
    context.url.pathname.startsWith("/i/") &&
    context.url.searchParams.get("preview") === "1" &&
    response.status === 200;
  response.headers.set(
    "X-Frame-Options",
    editorPreview ? "SAMEORIGIN" : "DENY",
  );
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (import.meta.env.PROD) {
    response.headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; frame-src 'self' https://www.google.com https://www.youtube-nocookie.com; frame-ancestors ${editorPreview ? "'self'" : "'none'"}; base-uri 'self'; form-action 'self'; object-src 'none'`,
    );
  }
  return response;
});
