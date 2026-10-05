import { expect, test, type Page } from "@playwright/test";
import { loginAsOwner, trackErrors } from "./helpers";

// Pendaftaran dibatasi 5/menit per IP; tiap tes memakai IP samaran sendiri
// (lewat X-Forwarded-For, seperti di belakang reverse proxy).
const fakeIp = () => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
};
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
});

const unique = (label: string) =>
  `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.test`;

// PNG 1x1 yang sah.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("pelanggan memilih paket, transfer, admin memverifikasi, lalu undangan bisa terbit", async ({
  page,
  browser,
}) => {
  const errors = trackErrors(page);
  const email = unique("bayar");

  // Admin menyiapkan rekening tujuan.
  const adminContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": fakeIp() },
  });
  const adminPage = await adminContext.newPage();
  adminPage.on("dialog", (dialog) => void dialog.accept());
  const adminErrors = trackErrors(adminPage);
  await loginAsOwner(adminPage);
  await adminPage.goto("/admin/pengaturan");
  const row = adminPage.locator("[data-row]").first();
  await row.locator("[data-field=bank]").fill("BCA");
  await row.locator("[data-field=holder]").fill("Temu Studio");
  await row.locator("[data-field=number]").fill("1234567890");
  await adminPage.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(adminPage.locator("#bill-toast")).toContainText("tersimpan");
  await noHorizontalScroll(adminPage);

  // Pelanggan datang dari tombol harga di landing page.
  await page.goto("/#harga");
  await page
    .getByRole("link", { name: "Mulai sekarang dengan paket Premium" })
    .click();
  await page.waitForURL("**/daftar?paket=premium");
  await expect(page.locator(".chosen-package")).toContainText("Premium");
  await page.getByLabel("Nama", { exact: true }).fill("Pelanggan Bayar");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill("kata-sandi-aman");
  await page.getByRole("button", { name: /Buat akun/ }).click();

  // Setelah mendaftar, diarahkan ke paket pilihan.
  await page.waitForURL("**/dashboard/paket?paket=premium");
  await expect(page.locator("#paket-premium")).toContainText("Pilihan Anda");
  await expect(
    page.getByText("Mode uji coba: undangan belum bisa diterbitkan."),
  ).toBeVisible();
  await noHorizontalScroll(page);

  // Sebelum membayar, penerbitan ditolak dengan petunjuk ke halaman paket.
  await page.goto("/dashboard");
  await expect(page.getByText("Mode uji coba")).toBeVisible();
  await page.locator("#publish").click();
  await expect(page.locator("#toast")).toContainText("Pilih paket");
  await expect(page.locator("#toast a")).toHaveAttribute(
    "href",
    "/dashboard/paket",
  );

  // Pilih paket: tagihan dibuat dengan kode unik.
  await page.goto("/dashboard/paket?paket=premium");
  await page
    .locator("#paket-premium")
    .getByRole("button", { name: "Pilih paket" })
    .click();
  await page.waitForURL(/\/dashboard\/tagihan\/TMU-\d{8}-\d{4}$/);
  const number = page.url().split("/").pop()!;
  const total = await page.locator("output[data-total]").textContent();
  expect(total).toMatch(/^Rp199\.\d{3}$/);
  await expect(page.getByText("BCA", { exact: true })).toBeVisible();
  await expect(page.getByText("1234567890")).toBeVisible();
  await noHorizontalScroll(page);

  // Unggah bukti transfer.
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "bukti.png", mimeType: "image/png", buffer: PNG });
  await page.locator("textarea[name=note]").fill("Dari BCA atas nama sendiri");
  await page.getByRole("button", { name: "Kirim bukti transfer" }).click();
  await expect(page.getByText("Menunggu verifikasi admin")).toBeVisible();
  await expect(page.getByAltText("Bukti transfer yang diunggah")).toBeVisible();

  // Admin menemukan pesanan, memeriksa bukti, lalu memverifikasi.
  await adminPage.goto(`/admin/pesanan?q=${encodeURIComponent(email)}`);
  await adminPage.getByRole("link", { name: number }).click();
  await expect(
    adminPage.getByAltText(`Bukti transfer ${number}`),
  ).toBeVisible();
  await expect(adminPage.getByText("Dari BCA atas nama sendiri")).toBeVisible();
  await noHorizontalScroll(adminPage);
  await adminPage
    .getByRole("button", { name: /Verifikasi & aktifkan paket/ })
    .click();
  await expect(adminPage.locator(".bill-badge")).toHaveText("Lunas");

  // Pelanggan kini punya paket aktif dan dapat menerbitkan.
  await page.goto("/dashboard");
  await expect(page.getByText("Paket Premium aktif")).toBeVisible();
  const slug = (await page
    .locator(".invitation-chip.is-active span")
    .textContent())!.replace("/i/", "");
  await page.locator("#publish").click();
  await expect(page.locator("#unpublish")).toBeVisible();
  const publik = await page.request.get(`/i/${slug}`);
  expect(publik.status()).toBe(200);

  // Invoice cetak untuk pesanan lunas.
  await page.goto(`/dashboard/tagihan/${number}/cetak`);
  await expect(page.getByText("LUNAS")).toBeVisible();
  await expect(page.getByText("Rp199.000")).toBeVisible();
  await noHorizontalScroll(page);

  // Satu-satunya galat yang wajar: 403 saat menerbitkan sebelum membayar.
  expect(errors.filter((e) => !e.includes("/publish"))).toEqual([]);
  expect(adminErrors).toEqual([]);
  await adminContext.close();
});

test("admin menolak bukti, pelanggan melihat alasan dan mengunggah ulang", async ({
  page,
  browser,
}) => {
  const email = unique("tolak");
  await page.goto("/daftar");
  await page.getByLabel("Nama", { exact: true }).fill("Pelanggan Tolak");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill("kata-sandi-aman");
  await page.getByRole("button", { name: /Buat akun/ }).click();
  await page.waitForURL("**/dashboard");

  await page.goto("/dashboard/paket");
  await page
    .locator("#paket-esensial")
    .getByRole("button", { name: "Pilih paket" })
    .click();
  await page.waitForURL(/\/dashboard\/tagihan\/TMU-/);
  const number = page.url().split("/").pop()!;
  const upload = async () => {
    await page
      .locator("input[type=file]")
      .setInputFiles({ name: "bukti.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Kirim bukti transfer" }).click();
    await expect(page.getByText("Menunggu verifikasi admin")).toBeVisible();
  };
  await upload();

  const adminContext = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": fakeIp() },
  });
  const adminPage = await adminContext.newPage();
  await loginAsOwner(adminPage);
  await adminPage.goto(`/admin/pesanan/${number}`);
  await adminPage.locator("textarea[name=reason]").fill("Nominal tidak sesuai");
  await adminPage.getByRole("button", { name: "Tolak bukti" }).click();
  await expect(adminPage.locator(".bill-badge")).toHaveText("Ditolak");

  // Pelanggan lain tidak dapat melihat tagihan ini.
  const other = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": fakeIp() },
  });
  const otherPage = await other.newPage();
  await otherPage.goto("/daftar");
  await otherPage.getByLabel("Nama", { exact: true }).fill("Orang Lain");
  await otherPage.getByLabel("Email").fill(unique("lain"));
  await otherPage.getByLabel("Kata sandi").fill("kata-sandi-aman");
  await otherPage.getByRole("button", { name: /Buat akun/ }).click();
  await otherPage.waitForURL("**/dashboard");
  const denied = await otherPage.goto(`/dashboard/tagihan/${number}`);
  expect(denied?.status()).toBe(404);
  const proofDenied = await otherPage.request.get(
    await page
      .goto(`/dashboard/tagihan/${number}`)
      .then(
        async () => (await page.locator("img.bill-proof").getAttribute("src"))!,
      ),
  );
  expect(proofDenied.status()).toBe(404);
  await other.close();

  await page.reload();
  await expect(page.getByText("Nominal tidak sesuai").first()).toBeVisible();
  await upload();
  await adminPage.reload();
  await expect(adminPage.locator(".bill-badge")).toHaveText(
    "Menunggu verifikasi",
  );
  await adminContext.close();
});
