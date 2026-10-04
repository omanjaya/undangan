import { expect, test } from "@playwright/test";
import { loginAsOwner, openCover, trackErrors } from "./helpers";

const slug = "amara-raka";

test("daftar tamu: kirim WA, dibuka, RSVP tertaut, QR, check-in", async ({
  page,
  browser,
}, testInfo) => {
  const errors = trackErrors(page);
  const name = `Tamu WA ${testInfo.project.name} ${Date.now().toString(36)}`;
  await loginAsOwner(page);

  const form = page.locator("#guest-form");
  await form.locator("[name=name]").fill(name);
  await form.locator("[name=phone]").fill("0812 3456 7890");
  await form.locator("#guest-submit").click();
  const row = page.locator(".guest-row", { hasText: name });
  await expect(row).toContainText("+6281234567890");
  await expect(row).toContainText("Belum dikirim");

  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    row.getByRole("button", { name: "Kirim via WA" }).click(),
  ]);
  expect(popup.url()).toMatch(/whatsapp\.com|wa\.me/);
  expect(decodeURIComponent(popup.url())).toContain("6281234567890");
  await popup.close();
  await expect(row.locator(".guest-status").first()).toHaveText(/Terkirim/i);

  const code = await page.evaluate(
    async ([slugName, guestName]) => {
      const response = await fetch(
        `/api/guests?slug=${encodeURIComponent(slugName)}`,
      );
      const data = (await response.json()) as {
        guests: { name: string; code: string }[];
      };
      return data.guests.find((guest) => guest.name === guestName)?.code;
    },
    [slug, name],
  );
  expect(code).toBeTruthy();

  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  const guestErrors = trackErrors(guestPage);
  await guestPage.goto(`/i/${slug}?to=${encodeURIComponent(name)}&g=${code}`);
  await expect(guestPage.locator(".invite-cover-recipient")).toHaveText(name);
  await openCover(guestPage);
  await expect(guestPage.getByLabel("Nama lengkap")).toHaveValue(name);
  await guestPage.getByLabel("Konfirmasi kehadiran").selectOption("attending");
  await guestPage.getByLabel("Jumlah tamu").selectOption("2");
  await guestPage
    .getByRole("button", { name: /(Kirim|Perbarui) konfirmasi/ })
    .click();
  await expect(guestPage.locator("#rsvp-status")).toContainText(
    "Konfirmasi tersimpan",
  );
  await guestPage.locator("[data-qr-open]").click();
  await expect(
    guestPage.locator("[data-qr-dialog] svg, [data-qr-dialog] img").first(),
  ).toBeVisible();
  await guestPage.locator("[data-qr-close]").click();
  expect(guestErrors).toEqual([]);
  await guestContext.close();

  await page.reload();
  const updated = page.locator(".guest-row", { hasText: name });
  await expect(updated).toContainText("dibuka");
  await expect(updated).toContainText(/hadir \(2 orang\)/i);

  await page.goto("/dashboard/checkin");
  const input = page.locator(".checkin-manual input");
  const submit = page.locator(".checkin-manual button").first();
  await input.fill(code!);
  await submit.click();
  await expect(page.locator(".checkin-result")).toContainText("Selamat datang");
  await input.fill(code!);
  await submit.click();
  await expect(page.locator(".checkin-result")).toContainText("sudah check-in");
  expect(errors).toEqual([]);
});

test("ucapan: balasan pemilik tampil, ekspor CSV tersedia", async ({
  page,
  browser,
}, testInfo) => {
  const id = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(`/i/${slug}`);
  await openCover(guestPage);
  await guestPage.getByLabel("Nama lengkap").fill(`Tamu balas ${id}`);
  await guestPage.getByLabel("Konfirmasi kehadiran").selectOption("attending");
  await guestPage.getByLabel(/Doa & ucapan/).fill(`Ucapan ${id}`);
  await guestPage
    .getByRole("button", { name: /(Kirim|Perbarui) konfirmasi/ })
    .click();
  await expect(guestPage.locator("#rsvp-status")).toContainText(
    "Konfirmasi tersimpan",
  );

  await loginAsOwner(page);
  const row = page.locator(".wish-row", { hasText: `Ucapan ${id}` });
  await row.getByRole("button", { name: "Tampilkan" }).click();
  await expect(
    page.locator(".wish-row", { hasText: `Ucapan ${id}` }),
  ).toContainText("Ditampilkan");
  const reply = page
    .locator(".wish-row", { hasText: `Ucapan ${id}` })
    .locator(".wish-reply-form");
  await reply.locator("textarea").fill(`Terima kasih ${id}`);
  await reply.getByRole("button", { name: "Kirim balasan" }).click();
  await expect(
    page.locator(".wish-row", { hasText: `Ucapan ${id}` }),
  ).toContainText("Ubah balasan");

  await guestPage.reload();
  await expect(
    guestPage.locator("#guestbook", { hasText: `Terima kasih ${id}` }),
  ).toBeAttached();
  await guestContext.close();

  for (const file of ["rsvp.csv", "ucapan.csv"]) {
    const response = await page.request.get(`/api/invitations/${slug}/${file}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(await response.text()).toContain(id);
  }
});

test("amplop digital dan pilihan bahasa Inggris", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = trackErrors(page);
  await page.goto("/themes/jepun-ivory");
  const cover = await openCover(page);
  await expect(cover).toBeHidden();
  const copy = page.locator("button", { hasText: "Salin" }).first();
  await copy.scrollIntoViewIfNeeded();
  await copy.click();
  await expect(copy).toContainText(/Tersalin/i);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page
    .locator('[data-lang-switch][data-variant="header"] [data-lang="en"]')
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("SAVE THE DATE").first()).toBeAttached();
  await expect(page.locator('[data-i18n="couple.groom"]').first()).toHaveText(
    /groom/i,
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(errors).toEqual([]);
});
