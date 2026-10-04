import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  DEFAULT_WA_TEMPLATE,
  GUEST_CODE_PATTERN,
  expectedPax,
  generateGuestCode,
  guestInputSchema,
  guestLink,
  guestStatus,
  guestsToCsv,
  normalizePhone,
  parseScannedCode,
  renderWaMessage,
  summarizeGuests,
  waTemplateSchema,
  waUrl,
  type Guest,
  type GuestView,
} from "./guests";

const guest = (patch: Partial<Guest> = {}): Guest => ({
  id: "g1",
  invitationId: "i1",
  code: "abcdefghjk",
  name: "Made",
  phone: "",
  group: "",
  maxPax: null,
  sentAt: null,
  firstOpenedAt: null,
  openCount: 0,
  checkedInAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...patch,
});

describe("normalisasi nomor telepon", () => {
  it.each([
    ["0812-3456-7890", "6281234567890"],
    ["+62 812 3456 7890", "6281234567890"],
    ["62812 3456 7890", "6281234567890"],
    ["812 3456 7890", "6281234567890"],
    ["(0812) 3456.7890", "6281234567890"],
    ["+62 0812 3456 7890", "6281234567890"],
    ["0062 812 3456 7890", "6281234567890"],
    ["+1 415 555 2671", "14155552671"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });
  it("membiarkan kosong dan menolak nilai yang tidak masuk akal", () => {
    expect(normalizePhone("   ")).toBe("");
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("0812")).toBeNull();
    expect(normalizePhone("0812-3456-7890-1234-5678")).toBeNull();
    expect(normalizePhone("0812x3456")).toBeNull();
  });
});

describe("kode tamu", () => {
  it("acak, URL-aman, dan unik terhadap kode yang sudah dipakai", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const code = generateGuestCode((n) => randomBytes(n), taken);
      expect(code).toMatch(GUEST_CODE_PATTERN);
      expect(taken.has(code)).toBe(false);
      taken.add(code);
    }
    expect(taken.size).toBe(2000);
  });
  it("mencoba lagi bila bertabrakan dan menyerah bila selalu bertabrakan", () => {
    const fixed = (n: number) => new Uint8Array(n).fill(1);
    const first = generateGuestCode(fixed);
    expect(() => generateGuestCode(fixed, new Set([first]))).toThrow();
    let calls = 0;
    const code = generateGuestCode(
      (n) => {
        calls++;
        return calls === 1
          ? new Uint8Array(n).fill(1)
          : new Uint8Array(n).fill(2);
      },
      new Set([first]),
    );
    expect(code).not.toBe(first);
  });
  it("membaca kode polos maupun URL hasil pindai", () => {
    expect(parseScannedCode("  ABCDEFGHJK ")).toBe("abcdefghjk");
    expect(
      parseScannedCode(
        "https://temu.test/dashboard/checkin?undangan=a&kode=abcdefghjk",
      ),
    ).toBe("abcdefghjk");
    expect(parseScannedCode("https://temu.test/i/x?to=A&g=abcdefghjk")).toBe(
      "abcdefghjk",
    );
  });
});

describe("masukan tamu", () => {
  it("memangkas spasi, mengosongkan opsional, dan memeriksa jatah", () => {
    expect(guestInputSchema.parse({ name: "  Made  " })).toEqual({
      name: "Made",
      phone: "",
      group: "",
      maxPax: null,
    });
    expect(guestInputSchema.parse({ name: "A", maxPax: "3" }).maxPax).toBe(3);
    expect(() => guestInputSchema.parse({ name: "A", maxPax: 9 })).toThrow();
    expect(() => guestInputSchema.parse({ name: "  " })).toThrow();
  });
});

describe("pesan WhatsApp", () => {
  it("mengganti {nama} dan {tautan} tanpa menafsirkan simbol $", () => {
    const text = renderWaMessage("Halo {nama}: {tautan} {nama}", "Rp$&1", "L");
    expect(text).toBe("Halo Rp$&1: L Rp$&1");
  });
  it("templat bawaan sah dan templat tanpa {tautan} ditolak", () => {
    expect(waTemplateSchema.safeParse(DEFAULT_WA_TEMPLATE).success).toBe(true);
    expect(waTemplateSchema.safeParse("Halo {nama}").success).toBe(false);
    expect(waTemplateSchema.safeParse("x".repeat(1001)).success).toBe(false);
  });
  it("membangun tautan wa.me dengan dan tanpa nomor", () => {
    expect(waUrl("6281234567890", "a b&c")).toBe(
      "https://wa.me/6281234567890?text=a%20b%26c",
    );
    expect(waUrl("", "hai")).toBe("https://wa.me/?text=hai");
  });
  it("tautan pribadi memuat nama ter-encode dan kode", () => {
    expect(
      guestLink("https://temu.test/", "amara-raka", {
        name: "I Made & Ni Luh",
        code: "abcdefghjk",
      }),
    ).toBe(
      "https://temu.test/i/amara-raka?to=I%20Made%20%26%20Ni%20Luh&g=abcdefghjk",
    );
  });
});

describe("status dan ringkasan", () => {
  it("status paling maju yang tampil", () => {
    expect(guestStatus(guest(), null)).toBe("belum-dikirim");
    expect(guestStatus(guest({ sentAt: "t" }), null)).toBe("terkirim");
    expect(guestStatus(guest({ sentAt: "t", firstOpenedAt: "t" }), null)).toBe(
      "dibuka",
    );
    expect(
      guestStatus(guest({ firstOpenedAt: "t" }), {
        attendance: "attending",
        attendeeCount: 2,
      }),
    ).toBe("hadir");
    expect(
      guestStatus(guest(), { attendance: "declined", attendeeCount: 0 }),
    ).toBe("tidak-hadir");
  });
  it("jumlah orang: RSVP, lalu jatah, lalu satu", () => {
    expect(
      expectedPax(guest({ maxPax: 4 }), {
        attendance: "attending",
        attendeeCount: 2,
      }),
    ).toBe(2);
    expect(expectedPax(guest({ maxPax: 4 }), null)).toBe(4);
    expect(expectedPax(guest(), null)).toBe(1);
  });
  it("menghitung ringkasan termasuk check-in", () => {
    const view = (patch: Partial<GuestView>): GuestView => ({
      ...guest(),
      rsvp: null,
      status: "belum-dikirim",
      pax: 1,
      ...patch,
    });
    const summary = summarizeGuests([
      view({}),
      view({ status: "terkirim" }),
      view({ status: "dibuka" }),
      view({
        status: "hadir",
        pax: 3,
        rsvp: { attendance: "attending", attendeeCount: 3 },
        checkedInAt: "t",
      }),
      view({
        status: "tidak-hadir",
        rsvp: { attendance: "declined", attendeeCount: 0 },
      }),
    ]);
    expect(summary).toMatchObject({
      total: 5,
      belumDikirim: 1,
      terkirim: 1,
      dibuka: 1,
      hadir: 1,
      hadirOrang: 3,
      tidakHadir: 1,
      belumRespons: 3,
      checkedIn: 1,
      checkedInOrang: 3,
    });
  });
});

describe("ekspor CSV", () => {
  it("menetralkan rumus dan menyertakan tautan", () => {
    const view: GuestView = {
      ...guest({ name: "=HYPERLINK(1)", phone: "6281234567890" }),
      rsvp: null,
      status: "belum-dikirim",
      pax: 1,
    };
    const csv = guestsToCsv([view], (g) => `https://x/${g.code}`);
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
    expect(csv).toContain("https://x/abcdefghjk");
    expect(csv.startsWith("﻿")).toBe(true);
  });
});
