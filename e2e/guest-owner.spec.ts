import { expect, test, type Browser, type Page } from "@playwright/test";
import { loginAsOwner, openCover, trackErrors } from "./helpers";

const slug = "amara-raka";

// Nama unik per proyek, per tes, dan per eksekusi agar tes tidak bergantung
// pada data tes lain (state file dipakai bersama).
function guestFor(label: string) {
  const id = `${label}-${Date.now().toString(36)}`;
  return { name: `Tamu ${id}`, message: `Selamat berbahagia dari ${id}` };
}

async function submitRsvp(page: Page, name: string, message: string) {
  await page.getByLabel("Nama lengkap").fill(name);
  await page.getByLabel("Konfirmasi kehadiran").selectOption("attending");
  await page.getByLabel("Jumlah tamu").selectOption("2");
  await page.getByLabel(/Doa & ucapan/).fill(message);
  await page
    .getByRole("button", { name: /(Kirim|Perbarui) konfirmasi/ })
    .click();
  await expect(page.locator("#rsvp-status")).toContainText(
    "Konfirmasi tersimpan",
  );
}

async function ownerPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAsOwner(page);
  return { context, page };
}

test("tamu: nama penerima, RSVP, kirim ulang tetap satu RSVP", async ({
  page,
  browser,
}, testInfo) => {
  const errors = trackErrors(page);
  const guest = guestFor(`rsvp-${testInfo.project.name}`);
  await page.goto(`/i/${slug}?to=Budi%20%26%20Sari`);

  await expect(page.locator(".invite-cover-recipient")).toHaveText(
    "Budi & Sari",
  );
  await openCover(page);

  await page.locator("#rsvp-form").scrollIntoViewIfNeeded();
  await submitRsvp(page, guest.name, guest.message);
  // Kirim ulang dengan data yang sama.
  await submitRsvp(page, guest.name, guest.message);
  expect(errors).toEqual([]);

  const owner = await ownerPage(browser);
  await owner.page.goto("/dashboard");
  await expect(
    owner.page.locator("tbody tr", { hasText: guest.name }),
  ).toHaveCount(1);
  await owner.context.close();
});

test("pemilik: moderasi ucapan tampil di halaman tamu, keluar menutup akses", async ({
  page,
  browser,
}, testInfo) => {
  const guest = guestFor(`mod-${testInfo.project.name}`);

  // Tamu mengirim ucapan lewat konteks terpisah.
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(`/i/${slug}`);
  await openCover(guestPage);
  await guestPage.locator("#rsvp-form").scrollIntoViewIfNeeded();
  await submitRsvp(guestPage, guest.name, guest.message);

  // Belum disetujui, jadi belum tampil publik (tunggu buku tamu selesai dimuat).
  await guestPage.reload();
  await expect(
    guestPage
      .locator("#guestbook .invite-guestbook-empty, #guestbook .invite-wish")
      .first(),
  ).toBeAttached();
  await expect(
    guestPage.locator("#guestbook", { hasText: guest.message }),
  ).toHaveCount(0);

  await loginAsOwner(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const row = page.locator(".wish-row", { hasText: guest.message });
  await expect(row).toContainText("Menunggu tinjauan");
  await row.getByRole("button", { name: "Tampilkan" }).click();
  await expect(
    page.locator(".wish-row", { hasText: guest.message }),
  ).toContainText("Ditampilkan");

  await guestPage.reload();
  await expect(
    guestPage.locator("#guestbook .invite-wish", { hasText: guest.message }),
  ).toBeVisible();
  await guestContext.close();

  await page.locator("#logout").click();
  await page.waitForURL("**/login");
  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/\/dashboard$/);
});
