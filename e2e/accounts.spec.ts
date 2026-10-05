import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// Email unik per proyek dan per eksekusi; state file dipakai bersama.
const unique = (label: string) =>
  `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.test`;

test("pelanggan mendaftar, mendapat ruang kerja sendiri, dan tidak melihat milik admin", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Daftar gratis" }).click();
  await page.waitForURL("**/daftar");

  await page.getByLabel("Nama", { exact: true }).fill("Pelanggan Uji");
  await page.getByLabel("Email").fill(unique("pelanggan"));
  await page.getByLabel("Kata sandi").fill("kata-sandi-aman");
  await page.getByRole("button", { name: /Buat akun/ }).click();
  await page.waitForURL("**/dashboard");

  // Hanya undangan awal milik sendiri; undangan contoh admin tidak muncul.
  await expect(page.locator("body")).not.toContainText("amara-raka");

  // Pelanggan bukan admin.
  const admin = await page.goto("/admin");
  expect(admin?.status()).toBe(403);

  // Undangan admin tidak dapat dipratinjau pelanggan lain.
  const preview = await page.goto("/i/amara-raka?preview=1");
  expect(preview?.status()).toBe(404);
});

test("pendaftaran menolak kata sandi pendek dan email ganda", async ({
  page,
}) => {
  await page.goto("/daftar");
  await page.getByLabel("Nama", { exact: true }).fill("Orang Uji");
  await page.getByLabel("Email").fill(unique("pendek"));
  await page.getByLabel("Kata sandi").fill("12345678");
  await page.evaluate(() => {
    document
      .querySelector("input[name=password]")!
      .removeAttribute("minlength");
  });
  await page.getByLabel("Kata sandi").fill("pendek");
  await page.getByRole("button", { name: /Buat akun/ }).click();
  await expect(page.locator("#register-error")).toContainText("8 karakter");

  await page.goto("/daftar");
  await page.getByLabel("Nama", { exact: true }).fill("Admin Palsu");
  await page.getByLabel("Email").fill("owner@undangan.local");
  await page.getByLabel("Kata sandi").fill("kata-sandi-aman");
  await page.getByRole("button", { name: /Buat akun/ }).click();
  await expect(page.locator("#register-error")).toContainText(
    "sudah terdaftar",
  );
});

test("admin dapat membuka /admin dan tamu anonim diarahkan masuk", async ({
  page,
  context,
}) => {
  const anonim = await page.goto("/admin");
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(anonim?.status()).toBe(200);
  await context.clearCookies();
  await loginAsOwner(page);
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Ringkasan" })).toBeVisible();
});

test("login menolak kata sandi salah dengan pesan yang sama untuk email tak dikenal", async ({
  page,
}) => {
  const pesan = async (email: string) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Kata sandi").fill("salah-total-12");
    await page.getByRole("button", { name: /Masuk ke ruang undangan/ }).click();
    const error = page.locator("#login-error");
    await expect(error).not.toBeEmpty();
    return error.textContent();
  };
  expect(await pesan("owner@undangan.local")).toBe(
    await pesan("tidak-ada@example.test"),
  );
});
