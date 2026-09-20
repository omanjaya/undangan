// Membuat ornamen pendukung tema baru dengan mewarnai ulang (duotone tint)
// aset watercolor yang sudah ada. Jalankan: node scripts/tint-theme-ornaments.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const O = "public/ornaments";

// base "light" = set Jepun Ivory, base "dark" = set Puri Emerald.
const arts = {
  rosa: { base: "light", tint: { r: 198, g: 120, b: 132 } },
  biru: { base: "dark", tint: { r: 150, g: 170, b: 190 } },
  hijau: { base: "light", tint: { r: 124, g: 152, b: 104 } },
  keemasan: { base: "dark", tint: { r: 205, g: 168, b: 96 } },
  pasir: { base: "light", tint: { r: 176, g: 160, b: 132 } },
  monokrom: { base: "dark", tint: { r: 158, g: 158, b: 155 } },
};

const sources = {
  light: {
    cover: `${O}/covers/ivory-cover.webp`,
    corner: `${O}/theme-pack/ivory-floral-crescent.png`,
    accent: `${O}/theme-pack/ivory-jepun-cascade.png`,
    extra: `${O}/jepun-corner.png`,
  },
  dark: {
    cover: `${O}/covers/emerald-cover.webp`,
    corner: `${O}/theme-pack/emerald-foliage-corner.png`,
    accent: `${O}/theme-pack/emerald-gold-fan.png`,
    extra: `${O}/candi-bentar.png`,
  },
};

mkdirSync(`${O}/covers`, { recursive: true });
mkdirSync(`${O}/theme-pack`, { recursive: true });

for (const [art, { base, tint }] of Object.entries(arts)) {
  const src = sources[base];
  const jobs = [
    [src.cover, `${O}/covers/${art}-cover.webp`],
    [src.corner, `${O}/theme-pack/${art}-corner.webp`],
    [src.accent, `${O}/theme-pack/${art}-accent.webp`],
    [src.extra, `${O}/theme-pack/${art}-extra.webp`],
  ];
  for (const [input, output] of jobs) {
    await sharp(input).tint(tint).webp({ quality: 82 }).toFile(output);
    console.log(output);
  }
}
