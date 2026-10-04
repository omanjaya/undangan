import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { labels, t } from "./i18n";

const componentDir = join(process.cwd(), "src/components/invitation");
const sources = readdirSync(componentDir)
  .filter((name) => name.endsWith(".astro") || name.endsWith(".ts"))
  .map((name) => readFileSync(join(componentDir, name), "utf8"));

describe("kamus label dua bahasa", () => {
  it("memiliki teks Indonesia dan Inggris untuk setiap label", () => {
    for (const [key, entry] of Object.entries(labels)) {
      expect(entry.id.trim(), key).not.toBe("");
      expect(entry.en.trim(), key).not.toBe("");
    }
  });
  it("menjaga placeholder variabel tetap sama di kedua bahasa", () => {
    for (const [key, entry] of Object.entries(labels)) {
      const vars = (text: string) => text.match(/\{\w+\}/g)?.sort() ?? [];
      expect(vars(entry.en), key).toEqual(vars(entry.id));
    }
  });
  it("hanya memakai markup <br> dan <em> yang aman", () => {
    for (const [key, entry] of Object.entries(labels)) {
      const tags = [...(entry.id + entry.en).matchAll(/<\/?(\w+)/g)].map(
        (m) => m[1],
      );
      for (const tag of tags) expect(["br", "em"], key).toContain(tag);
    }
  });
  it("menyediakan semua kunci data-i18n yang dipakai komponen tamu", () => {
    const used = new Set<string>();
    for (const source of sources)
      for (const match of source.matchAll(
        /data-i18n(?:-aria-label|-placeholder)?="([\w.]+)"/g,
      ))
        used.add(match[1]);
    expect(used.size).toBeGreaterThan(30);
    for (const key of used) expect(labels, key).toHaveProperty(key);
  });
  it("t() mengembalikan teks Indonesia bawaan", () => {
    expect(t("cover.open")).toBe("Buka undangan");
  });
});
