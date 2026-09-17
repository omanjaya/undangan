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
  // Astro menyusun CSP beserta hash script/style-nya sendiri (lihat security.csp
  // di astro.config.mjs): lewat <meta> untuk halaman prerender, lewat header ini
  // untuk halaman on-demand seperti /i/[slug]. frame-ancestors diabaikan pada
  // <meta>, jadi ditambahkan di sini — digabung, bukan menimpa, supaya hash
  // script dari Astro tidak hilang dan JavaScript undangan tetap jalan.
  if (import.meta.env.PROD) {
    const frameAncestors = `frame-ancestors ${editorPreview ? "'self'" : "'none'"}`;
    const generated = response.headers.get("Content-Security-Policy");
    response.headers.set(
      "Content-Security-Policy",
      generated && !/(^|;)\s*frame-ancestors\s/i.test(generated)
        ? `${generated.replace(/;\s*$/, "")}; ${frameAncestors}`
        : (generated ?? frameAncestors),
    );
  }
  return response;
});
