import type { PackageDefinition } from "../modules/billing/catalog";
import type { SiteConfig } from "./site";

/** Halaman publik statis yang boleh diindeks, dengan path relatif. */
export const PUBLIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/kontak", priority: "0.5", changefreq: "yearly" },
  { path: "/syarat-ketentuan", priority: "0.3", changefreq: "yearly" },
  { path: "/kebijakan-privasi", priority: "0.3", changefreq: "yearly" },
  { path: "/kebijakan-refund", priority: "0.3", changefreq: "yearly" },
] as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** XML sitemap: halaman publik ditambah pratinjau tema. */
export function buildSitemap(origin: string, themeIds: string[]): string {
  const base = origin.replace(/\/+$/, "");
  const entries = [
    ...PUBLIC_PAGES.map((p) => ({ ...p, loc: `${base}${p.path}` })),
    ...themeIds.map((id) => ({
      loc: `${base}/themes/${encodeURIComponent(id)}`,
      priority: "0.6",
      changefreq: "monthly",
    })),
  ];
  const urls = entries
    .map(
      (e) =>
        `  <url><loc>${escapeXml(e.loc)}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** robots.txt: area privat (dashboard, admin, API, halaman tamu) ditutup. */
export function buildRobots(origin: string): string {
  const base = origin.replace(/\/+$/, "");
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /dashboard",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /i/",
    "Disallow: /media/",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

/** JSON-LD Organization + Product/Offer untuk tiap paket. */
export function buildLandingJsonLd(
  site: SiteConfig,
  packages: PackageDefinition[],
) {
  const organization = {
    "@type": "Organization",
    "@id": `${site.url}/#organization`,
    name: site.name,
    legalName: site.businessName,
    url: site.url,
    email: site.email,
    telephone: `+${site.whatsapp}`,
    address: site.businessAddress,
  };
  const products = packages.map((pkg) => ({
    "@type": "Product",
    name: `${site.name} paket ${pkg.name}`,
    description: pkg.tagline,
    brand: { "@id": organization["@id"] },
    offers: {
      "@type": "Offer",
      price: pkg.price,
      priceCurrency: "IDR",
      availability: "https://schema.org/InStock",
      url: `${site.url}/daftar?paket=${encodeURIComponent(pkg.id)}`,
    },
  }));
  return {
    "@context": "https://schema.org",
    "@graph": [organization, ...products] as Record<string, unknown>[],
  };
}

/** Serialisasi aman untuk ditaruh di dalam <script>: cegah penutupan tag dini. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
