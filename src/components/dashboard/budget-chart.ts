import type { BudgetSummary } from "../../modules/invitations/domain/budget";

export type CategoryGroup = BudgetSummary["byCategory"][number];
export type BearerGroup = BudgetSummary["byBearer"][number];

export type BudgetChartOptions = {
  /** Keterangan untuk <title> dan aria-label pembaca layar. */
  title?: string;
};

/**
 * Lebar dan tinggi hanya satuan viewBox, bukan piksel: svg dipasang dengan
 * width 100% supaya ikut lebar kartu dashboard.
 */
const VIEW_WIDTH = 480;
const ROW_HEIGHT = 44;
const BAR_HEIGHT = 10;
const SPLIT_HEIGHT = 18;
const LEGEND_HEIGHT = 20;

const rupiahFormat = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rupiah(value: number) {
  return rupiahFormat.format(Math.round(value));
}

/** Pembulatan dua desimal agar atribut tetap ringkas dan stabil. */
function unit(value: number) {
  return Math.round(value * 100) / 100;
}

function text(
  x: number,
  y: number,
  value: string,
  extra: { anchor?: "start" | "end"; size: number; opacity?: number },
) {
  const anchor = extra.anchor === "end" ? ' text-anchor="end"' : "";
  const opacity =
    extra.opacity === undefined ? "" : ` opacity="${extra.opacity}"`;
  return `<text x="${unit(x)}" y="${unit(y)}" font-size="${extra.size}" fill="currentColor"${anchor}${opacity}>${escapeXml(value)}</text>`;
}

function svg(height: number, label: string, body: string) {
  const safe = escapeXml(label);
  return `<svg viewBox="0 0 ${VIEW_WIDTH} ${unit(height)}" width="100%" role="img" aria-label="${safe}" preserveAspectRatio="xMinYMin meet" color="currentColor"><title>${safe}</title>${body}</svg>`;
}

/**
 * Batang horizontal per kategori: panjang mengikuti komitmen, bagian terbayar
 * digambar menumpuk di dalam batang yang sama agar sisa kekurangan terlihat.
 */
export function categoryBars(
  groups: readonly CategoryGroup[],
  options: BudgetChartOptions = {},
) {
  const rows = groups.filter((group) => group.committed > 0);
  const max = rows.reduce((n, group) => Math.max(n, group.committed), 0);
  if (!rows.length || max <= 0) return "";

  const height = rows.length * ROW_HEIGHT;
  const body = rows
    .map((group, index) => {
      const top = index * ROW_HEIGHT;
      const barY = top + 22;
      const committedWidth = (group.committed / max) * VIEW_WIDTH;
      // Lebih bayar pada satu pos tidak boleh melewati batang komitmennya.
      const paidWidth =
        (Math.min(group.paid, group.committed) / max) * VIEW_WIDTH;
      return [
        text(0, top + 14, group.label, { size: 13 }),
        text(VIEW_WIDTH, top + 14, rupiah(group.committed), {
          size: 12,
          anchor: "end",
          opacity: 0.7,
        }),
        `<rect data-part="jalur" x="0" y="${barY}" width="${VIEW_WIDTH}" height="${BAR_HEIGHT}" rx="${BAR_HEIGHT / 2}" fill="currentColor" opacity="0.08"/>`,
        `<rect data-part="komitmen" x="0" y="${barY}" width="${unit(committedWidth)}" height="${BAR_HEIGHT}" rx="${BAR_HEIGHT / 2}" fill="currentColor" opacity="0.32"/>`,
        `<rect data-part="terbayar" x="0" y="${barY}" width="${unit(paidWidth)}" height="${BAR_HEIGHT}" rx="${BAR_HEIGHT / 2}" fill="currentColor" opacity="0.85"/>`,
      ].join("");
    })
    .join("");

  const total = rows.reduce((n, group) => n + group.committed, 0);
  const paid = rows.reduce(
    (n, group) => n + Math.min(group.paid, group.committed),
    0,
  );
  const label =
    options.title ??
    `Komitmen anggaran ${rows.length} kategori, total ${rupiah(total)}, terbayar ${rupiah(paid)}.`;
  return svg(height, label, body);
}

/**
 * Satu batang bertumpuk untuk porsi komitmen tiap penanggung, dengan baris
 * keterangan di bawahnya karena segmen sempit tidak cukup memuat label.
 */
export function bearerSplit(
  groups: readonly BearerGroup[],
  options: BudgetChartOptions = {},
) {
  const rows = groups.filter((group) => group.committed > 0);
  const total = rows.reduce((n, group) => n + group.committed, 0);
  if (!rows.length || total <= 0) return "";

  let offset = 0;
  const segments: string[] = [];
  const legend: string[] = [];
  rows.forEach((group, index) => {
    const share = group.committed / total;
    const width = share * VIEW_WIDTH;
    const opacity = unit(0.85 - index * 0.22);
    segments.push(
      `<rect x="${unit(offset)}" y="0" width="${unit(width)}" height="${SPLIT_HEIGHT}" fill="currentColor" opacity="${Math.max(opacity, 0.15)}" data-share="${unit(share * 100)}"/>`,
    );
    offset += width;
    const legendY = SPLIT_HEIGHT + 14 + index * LEGEND_HEIGHT;
    legend.push(
      `<rect x="0" y="${legendY - 9}" width="10" height="10" rx="2" fill="currentColor" opacity="${Math.max(opacity, 0.15)}"/>`,
      text(16, legendY, group.label, { size: 12 }),
      text(
        VIEW_WIDTH,
        legendY,
        `${rupiah(group.committed)} · ${Math.round(share * 100)}%`,
        { size: 12, anchor: "end", opacity: 0.7 },
      ),
    );
  });

  const height = SPLIT_HEIGHT + 6 + rows.length * LEGEND_HEIGHT;
  const label =
    options.title ??
    `Pembagian komitmen anggaran antar ${rows.length} penanggung, total ${rupiah(total)}.`;
  return svg(height, label, `${segments.join("")}${legend.join("")}`);
}
