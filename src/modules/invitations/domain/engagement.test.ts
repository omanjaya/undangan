import { describe, it, expect } from "vitest";
import { replySchema, rsvpsToCsv, wishesToCsv } from "./engagement";

describe("ekspor CSV", () => {
  it("RSVP memakai BOM, header Indonesia, dan label kehadiran", () => {
    const csv = rsvpsToCsv([
      {
        name: "Sari",
        attendance: "attending",
        attendeeCount: 2,
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
      {
        name: "Budi",
        attendance: "declined",
        attendeeCount: 0,
        updatedAt: "2026-09-02T10:00:00.000Z",
      },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")).toEqual([
      '﻿"Nama","Kehadiran","Jumlah orang","Waktu"',
      '"Sari","Hadir","2","2026-09-01T10:00:00.000Z"',
      '"Budi","Tidak hadir","0","2026-09-02T10:00:00.000Z"',
      "",
    ]);
  });

  it("menetralkan rumus spreadsheet dan menggandakan tanda kutip", () => {
    const csv = wishesToCsv([
      {
        id: "1",
        invitationId: "i",
        name: '=HYPERLINK("http://x")',
        message: '+1 "selamat",\nbahagia',
        status: "approved",
        createdAt: "2026-09-01T10:00:00.000Z",
        reply: "@balas",
      },
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(`"'+1 ""selamat"",\nbahagia"`);
    expect(csv).toContain(`"Ditampilkan","'@balas"`);
    expect(csv.split("\r\n")[0]).toBe(
      '﻿"Nama","Ucapan","Status","Balasan","Waktu"',
    );
  });
});

describe("replySchema", () => {
  it("memangkas spasi dan membatasi 500 karakter", () => {
    expect(replySchema.parse("  terima kasih  ")).toBe("terima kasih");
    expect(replySchema.parse("   ")).toBe("");
    expect(() => replySchema.parse("a".repeat(501))).toThrow("500");
  });
});
