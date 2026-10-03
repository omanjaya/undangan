import { describe, it, expect } from "vitest";
import {
  bearerSplit,
  categoryBars,
  type BearerGroup,
  type CategoryGroup,
} from "./budget-chart";

const category = (over: Partial<CategoryGroup>): CategoryGroup => ({
  category: "lainnya",
  label: "Lain-lain",
  count: 1,
  estimate: 0,
  committed: 0,
  paid: 0,
  ...over,
});

const bearer = (over: Partial<BearerGroup>): BearerGroup => ({
  bearer: "bersama",
  label: "Ditanggung bersama",
  count: 1,
  committed: 0,
  paid: 0,
  outstanding: 0,
  ...over,
});

/** Lebar batang dengan bagian tertentu, urut sesuai kemunculan markup. */
const widths = (markup: string, part: string) =>
  [
    ...markup.matchAll(
      new RegExp(`data-part="${part}"[^>]*width="([\\d.]+)"`, "g"),
    ),
  ].map((m) => Number(m[1]));

const viewBoxHeight = (markup: string) =>
  Number(markup.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)![1]);

describe("grafik anggaran per kategori", () => {
  it("mengembalikan string kosong untuk data kosong dan semua nol", () => {
    expect(categoryBars([])).toBe("");
    expect(
      categoryBars([
        category({ label: "Katering" }),
        category({ label: "Busana", estimate: 500_000 }),
      ]),
    ).toBe("");
  });

  it("menggambar panjang batang proporsional terhadap komitmen", () => {
    const markup = categoryBars([
      category({ label: "Katering", committed: 10_000_000 }),
      category({ label: "Busana", committed: 5_000_000 }),
    ]);
    const bars = widths(markup, "komitmen");
    expect(bars.length).toBe(2);
    expect(bars[0] / bars[1]).toBeCloseTo(2, 5);
  });

  it("menandai bagian terbayar di dalam batang tanpa melewatinya", () => {
    const markup = categoryBars([
      category({ label: "Katering", committed: 8_000_000, paid: 2_000_000 }),
    ]);
    const [committed] = widths(markup, "komitmen");
    const [paid] = widths(markup, "terbayar");
    expect(paid).toBeLessThan(committed);
    expect(paid / committed).toBeCloseTo(0.25, 5);
  });

  it("tidak memanjangkan bagian terbayar meski lebih bayar", () => {
    const markup = categoryBars([
      category({ label: "Katering", committed: 4_000_000, paid: 9_000_000 }),
    ]);
    expect(widths(markup, "terbayar")[0]).toBe(widths(markup, "komitmen")[0]);
  });

  it("meng-escape label dari pengguna sehingga tidak bocor sebagai markup", () => {
    const markup = categoryBars([
      category({
        label: "<script>alert(\"x\")</script> & 'kutip'",
        committed: 1_000_000,
      }),
    ]);
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).toContain("&amp;");
    expect(markup).toContain("&quot;");
    expect(markup).toContain("&apos;");
  });

  it("menyertakan title, role, dan aria-label", () => {
    const markup = categoryBars([
      category({ label: "Katering", committed: 1_000_000 }),
    ]);
    expect(markup).toContain('role="img"');
    expect(markup).toMatch(/aria-label="[^"]+"/);
    expect(markup).toMatch(/<title>[^<]+<\/title>/);
  });

  it("memakai judul pilihan dan meng-escape-nya", () => {
    const markup = categoryBars(
      [category({ label: "Katering", committed: 1_000_000 })],
      { title: 'Anggaran "utama" & cadangan' },
    );
    expect(markup).toContain(
      "<title>Anggaran &quot;utama&quot; &amp; cadangan</title>",
    );
  });

  it("menambah tinggi viewBox seiring jumlah baris tanpa lebar piksel tetap", () => {
    const satu = categoryBars([
      category({ label: "Katering", committed: 1_000_000 }),
    ]);
    const tiga = categoryBars([
      category({ label: "Katering", committed: 1_000_000 }),
      category({ label: "Busana", committed: 2_000_000 }),
      category({ label: "Upakara", committed: 3_000_000 }),
    ]);
    expect(viewBoxHeight(tiga)).toBeGreaterThan(viewBoxHeight(satu));
    expect(viewBoxHeight(tiga)).toBe(viewBoxHeight(satu) * 3);
    expect(satu).toContain('width="100%"');
    expect(satu).not.toMatch(/\bwidth="\d+px"/);
  });

  it("memakai currentColor dan opacity, bukan warna keras", () => {
    const markup = categoryBars([
      category({ label: "Katering", committed: 1_000_000, paid: 500_000 }),
    ]);
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(markup).not.toMatch(/rgb\(/);
    expect(markup).toContain('fill="currentColor"');
    expect(markup).toMatch(/opacity="[\d.]+"/);
  });

  it("menulis nilai dalam format rupiah Indonesia", () => {
    const markup = categoryBars([
      category({ label: "Katering", committed: 12_500_000 }),
    ]);
    expect(markup).toMatch(/Rp\s?12\.500\.000/);
  });
});

describe("grafik pembagian penanggung", () => {
  it("mengembalikan string kosong untuk data kosong dan semua nol", () => {
    expect(bearerSplit([])).toBe("");
    expect(
      bearerSplit([
        bearer({ label: "Keluarga mempelai pria" }),
        bearer({ label: "Keluarga mempelai wanita" }),
      ]),
    ).toBe("");
  });

  it("menjaga jumlah proporsi tidak melebihi 100%", () => {
    const markup = bearerSplit([
      bearer({ bearer: "pria", label: "Pria", committed: 7_000_000 }),
      bearer({ bearer: "wanita", label: "Wanita", committed: 3_000_000 }),
      bearer({ label: "Bersama", committed: 1_234_567 }),
    ]);
    const shares = [...markup.matchAll(/data-share="([\d.]+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(shares.length).toBe(3);
    const total = shares.reduce((n, share) => n + share, 0);
    expect(total).toBeLessThanOrEqual(100.01);
    expect(total).toBeGreaterThan(99.9);
  });

  it("memberi segmen proporsional dan menyusunnya tanpa celah", () => {
    const markup = bearerSplit([
      bearer({ bearer: "pria", label: "Pria", committed: 6_000_000 }),
      bearer({ bearer: "wanita", label: "Wanita", committed: 2_000_000 }),
    ]);
    const segmen = [
      ...markup.matchAll(
        /<rect x="([\d.]+)"[^>]*width="([\d.]+)"[^>]*data-share=/g,
      ),
    ].map((m) => ({ x: Number(m[1]), width: Number(m[2]) }));
    expect(segmen.length).toBe(2);
    expect(segmen[0].width / segmen[1].width).toBeCloseTo(3, 5);
    expect(segmen[1].x).toBeCloseTo(segmen[0].width, 5);
  });

  it("meng-escape label penanggung dari pengguna", () => {
    const markup = bearerSplit([
      bearer({ label: '<b>Pria</b> & "keluarga"', committed: 1_000_000 }),
    ]);
    expect(markup).not.toContain("<b>");
    expect(markup).toContain(
      "&lt;b&gt;Pria&lt;/b&gt; &amp; &quot;keluarga&quot;",
    );
  });

  it("menambah tinggi viewBox seiring jumlah baris keterangan", () => {
    const satu = bearerSplit([bearer({ label: "Pria", committed: 1_000_000 })]);
    const dua = bearerSplit([
      bearer({ bearer: "pria", label: "Pria", committed: 1_000_000 }),
      bearer({ bearer: "wanita", label: "Wanita", committed: 1_000_000 }),
    ]);
    expect(viewBoxHeight(dua)).toBeGreaterThan(viewBoxHeight(satu));
    expect(satu).toContain('width="100%"');
  });

  it("menyertakan title, role, aria-label, dan nilai rupiah", () => {
    const markup = bearerSplit([
      bearer({ label: "Pria", committed: 2_000_000 }),
    ]);
    expect(markup).toContain('role="img"');
    expect(markup).toMatch(/aria-label="[^"]+"/);
    expect(markup).toMatch(/<title>[^<]+<\/title>/);
    expect(markup).toMatch(/Rp\s?2\.000\.000/);
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
