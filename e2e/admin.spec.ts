import { expect, test } from "@playwright/test";
import { loginAsOwner, trackErrors } from "./helpers";

// Batas laju login/daftar dihitung per IP; tiap tes memakai IP samaran sendiri
// (sama seperti e2e/accounts.spec.ts).
test.beforeEach(async ({ context }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}`,
  });
});

const unique = (label: string) =>
  `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.test`;

test("admin membuat akun klien, menyamar, kembali, lalu menangguhkannya", async ({
  page,
}) => {
  const errors = trackErrors(page);
  page.on("dialog", (dialog) => dialog.accept());
  const email = unique("klien");
  const name = "Klien Jasa Uji";

  await loginAsOwner(page);
  await expect(page.getByRole("link", { name: /Panel admin/ })).toBeVisible();

  // Ringkasan memuat indikator utama.
  await page.goto("/admin");
  await expect(page.getByText("Menunggu verifikasi")).toBeVisible();
  await expect(page.getByText("Pendapatan 6 bulan terakhir")).toBeVisible();

  // Buat akun klien.
  await page.goto("/admin/pelanggan");
  await page.getByLabel("Nama klien").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel(/Telepon/).fill("081234567890");
  await page.getByRole("button", { name: "Buat akun" }).click();
  await expect(page.locator("#client-password")).not.toBeEmpty();
  const password = (await page.locator("#client-password").textContent()) || "";
  expect(password).toHaveLength(12);
  await expect(page.locator("#client-message")).toHaveValue(
    new RegExp(`${password}`),
  );
  await page.getByRole("link", { name: "Buka detail klien" }).click();
  await page.waitForURL("**/admin/pelanggan/*");
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Masuk sebagai klien: pita penyamaran muncul di dashboard klien.
  await page.getByRole("button", { name: "Masuk sebagai pelanggan" }).click();
  await page.waitForURL("**/dashboard");
  const banner = page.locator(".impersonation-banner");
  await expect(banner).toContainText(`Anda masuk sebagai ${name}`);
  // Klien bukan admin: tidak ada tautan panel admin, dan /admin ditolak.
  await expect(page.getByRole("link", { name: /Panel admin/ })).toHaveCount(0);
  expect((await page.goto("/admin"))?.status()).toBe(403);
  await page.goto("/dashboard");

  // Kembali ke admin memulihkan sesi admin.
  await page.getByRole("button", { name: "Kembali ke admin" }).click();
  await page.waitForURL("**/admin/pelanggan/*");
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.locator(".impersonation-banner")).toHaveCount(0);

  // Jejak aktivitas mencatat awal dan akhir penyamaran.
  await page.goto("/admin/log?action=user.impersonate");
  await expect(
    page.locator("td code", { hasText: "user.impersonate.start" }).first(),
  ).toBeVisible();
  await expect(
    page.locator("td code", { hasText: "user.impersonate.end" }).first(),
  ).toBeVisible();

  // Tangguhkan klien.
  await page.goto("/admin/pelanggan?q=" + encodeURIComponent(email));
  await page.getByRole("link", { name }).click();
  await page.getByRole("button", { name: "Tangguhkan" }).click();
  await expect(page.getByRole("status")).toContainText("ditangguhkan");

  // Klien tidak dapat masuk.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: /Masuk ke ruang undangan/ }).click();
  await expect(page.locator("#login-error")).toContainText("ditangguhkan");

  expect(errors.filter((e) => !/status of 40[0-9]|403|401/.test(e))).toEqual(
    [],
  );
});

test("pelanggan biasa tidak dapat membuka halaman maupun API admin", async ({
  page,
}) => {
  await page.goto("/daftar");
  await page.getByLabel("Nama", { exact: true }).fill("Pelanggan Biasa");
  await page.getByLabel("Email").fill(unique("biasa"));
  await page.getByLabel("Kata sandi").fill("kata-sandi-aman");
  await page.getByRole("button", { name: /Buat akun/ }).click();
  await page.waitForURL("**/dashboard");
  for (const path of ["/admin", "/admin/pelanggan", "/admin/log"]) {
    expect((await page.goto(path))?.status(), path).toBe(403);
  }
  const response = await page.request.post("/api/admin/pelanggan", {
    form: { name: "X Y", email: unique("x") },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(response.status()).toBe(403);
});
