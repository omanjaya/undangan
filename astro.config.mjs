import { defineConfig } from "astro/config";
import node from "@astrojs/node";
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  server: { host: true, port: 4321 },
  // Astro menghitung hash untuk script/style-nya sendiri, termasuk yang di-inline
  // saat build produksi. Tanpa ini, `script-src 'self'` memblokir seluruh
  // JavaScript undangan di produksi (cover, slideshow, galeri, RSVP, musik).
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "media-src 'self'",
        "frame-src 'self' https://www.google.com https://www.youtube-nocookie.com",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ],
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
});
