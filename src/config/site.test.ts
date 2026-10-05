import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, getSiteConfig, whatsappLink } from "./site";

describe("getSiteConfig", () => {
  it("memakai nilai bawaan bila env kosong", () => {
    const c = getSiteConfig({});
    expect(c.name).toBe("Temu");
    expect(c.url).toBe("http://localhost:4321");
  });
  it("SITE_URL didahulukan, lalu APP_URL, tanpa garis miring akhir", () => {
    expect(getSiteConfig({ APP_URL: "https://a.id/" }).url).toBe(
      "https://a.id",
    );
    expect(
      getSiteConfig({ APP_URL: "https://a.id", SITE_URL: "https://b.id//" })
        .url,
    ).toBe("https://b.id");
  });
  it("membersihkan nomor WhatsApp dari karakter non-angka", () => {
    expect(
      getSiteConfig({ CONTACT_WHATSAPP: "+62 812-1111-2222" }).whatsapp,
    ).toBe("6281211112222");
  });
});

describe("whatsappLink", () => {
  it("mengodekan pesan", () => {
    expect(whatsappLink("62812", "Halo Temu")).toBe(
      "https://wa.me/62812?text=Halo%20Temu",
    );
  });
});

describe("formatPhoneDisplay", () => {
  it("memformat nomor Indonesia", () => {
    expect(formatPhoneDisplay("6281234567890")).toBe("+62 812-3456-7890");
  });
});
