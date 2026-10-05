import { describe, expect, it } from "vitest";
import { salesReadiness } from "./readiness";
import { emptyGlobal } from "../invitations/infrastructure/global-state";

const ready = (env: Record<string, string>, banks = true) => {
  const g = emptyGlobal();
  if (banks)
    g.siteSettings.bankAccounts = [
      { bank: "BCA", holder: "Temu", number: "123" },
    ];
  g.packages = [
    {
      id: "premium",
      name: "Premium",
      tagline: "",
      price: 1,
      durationDays: 1,
      features: [],
      limits: { maxInvitations: 1, maxGuests: 1, maxMediaMB: 1 },
      flags: {
        music: true,
        video: true,
        gift: true,
        guestList: true,
        qrCheckin: true,
        customSlug: true,
        removeBranding: true,
      },
      active: true,
      sortOrder: 0,
      updatedAt: "",
    },
  ];
  return Object.fromEntries(
    salesReadiness(g, env).map((item) => [item.id, item.done]),
  );
};

describe("salesReadiness", () => {
  it("menandai nilai bawaan dan kosong sebagai belum siap", () => {
    expect(ready({ CONTACT_WHATSAPP: "6281234567890" }, false)).toMatchObject({
      bank: false,
      packages: true,
      whatsapp: false,
      business: false,
      smtp: false,
      telegram: false,
      "site-url": false,
    });
  });
  it("semua siap bila env dan pengaturan diisi", () => {
    const result = ready({
      CONTACT_WHATSAPP: "6281999888777",
      BUSINESS_NAME: "Temu Studio",
      BUSINESS_ADDRESS: "Denpasar",
      CONTACT_EMAIL: "halo@temu.id",
      SMTP_HOST: "smtp.temu.id",
      MAIL_FROM: "Temu <halo@temu.id>",
      TELEGRAM_BOT_TOKEN: "x",
      TELEGRAM_CHAT_ID: "1",
      SITE_URL: "https://temu.id",
    });
    expect(Object.values(result).every(Boolean)).toBe(true);
  });
});
