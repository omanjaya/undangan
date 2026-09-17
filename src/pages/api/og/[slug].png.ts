import { presentationContent } from "../../../modules/invitations/domain/presentation";
import type { APIRoute } from "astro";
import sharp from "sharp";
import { resolve } from "node:path";
import { getPublished } from "../../../server/services";
import { uploadDirectory } from "../../../server/media";

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });

const truncate = (value: string, maximum: number) => {
  const characters = Array.from(value.trim());
  return characters.length <= maximum
    ? value.trim()
    : `${characters.slice(0, maximum - 1).join("")}…`;
};

const responseHeaders = (slug: string) => ({
  "Content-Type": "image/png",
  "Content-Disposition": `inline; filename="undangan-${slug}.png"`,
  "Cache-Control": "private, no-store",
});

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? "";
  const savedContent = await getPublished(slug);
  if (!savedContent) return new Response("Not found", { status: 404 });

  const content = presentationContent(savedContent);
  const namesText = truncate(`${content.bride} & ${content.groom}`, 48);
  const names = escapeXml(namesText);
  const nameFontSize = Math.max(
    36,
    Math.min(78, Math.floor(1750 / Math.max(namesText.length, 1))),
  );
  const venue = escapeXml(truncate(content.venue, 72));
  const date = escapeXml(
    new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Makassar",
    }).format(new Date(content.date)),
  );
  const fallbackBackground = content.heroPhoto
    ? ""
    : '<rect width="1200" height="630" fill="#e9e5d8"/>';
  const card =
    Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#17261f" stop-opacity=".2"/><stop offset="1" stop-color="#17261f" stop-opacity=".9"/></linearGradient></defs>
    ${fallbackBackground}
    <rect width="1200" height="630" fill="url(#shade)"/>
    <text x="80" y="92" fill="#f7f1df" font-family="Georgia,serif" font-size="24" letter-spacing="7">UNDANGAN PERNIKAHAN</text>
    <text x="80" y="354" fill="#fffaf0" font-family="Georgia,serif" font-size="${nameFontSize}">${names}</text>
    <line x1="80" y1="398" x2="250" y2="398" stroke="#d6be82" stroke-width="3"/>
    <text x="80" y="454" fill="#fffaf0" font-family="Arial,sans-serif" font-size="28">${date}</text>
    <text x="80" y="503" fill="#e9e1cd" font-family="Arial,sans-serif" font-size="23">${venue}</text>
    <text x="80" y="570" fill="#d6be82" font-family="Arial,sans-serif" font-size="18" letter-spacing="5">TEMU</text>
  </svg>`);

  let image = sharp(card);
  if (content.heroPhoto) {
    const filename = content.heroPhoto.slice("/media/".length);
    try {
      const background = await sharp(resolve(uploadDirectory(), filename))
        .resize(1200, 630, { fit: "cover" })
        .png()
        .toBuffer();
      image = sharp(background).composite([{ input: card }]);
    } catch {
      // Keep sharing functional with the branded card if stored media is missing.
      image = sharp({
        create: {
          width: 1200,
          height: 630,
          channels: 4,
          background: "#e9e5d8",
        },
      }).composite([{ input: card }]);
    }
  }
  const png = await image.png({ quality: 90 }).toBuffer();
  return new Response(new Uint8Array(png), {
    headers: {
      ...responseHeaders(slug),
      "Content-Length": String(png.byteLength),
    },
  });
};

export const HEAD: APIRoute = async ({ params }) => {
  const slug = params.slug ?? "";
  if (!(await getPublished(slug))) return new Response(null, { status: 404 });
  return new Response(null, { headers: responseHeaders(slug) });
};
