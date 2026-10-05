import { expect, test, type Page } from "@playwright/test";
import { loginAsOwner, trackErrors } from "./helpers";

// Pendaftaran dan permintaan atur ulang dibatasi per IP. Tiap tes memakai IP
// samaran berbeda (lewat X-Forwarded-For) agar pengulangan cepat tidak tertahan.
test.beforeEach(async ({ context }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}`,
  });
});

const unique = (label: string) =>
  `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.test`;
const PASSWORD = "kata-sandi-aman";

async function register(page: Page, label: string) {
  const email = unique(label);
  await page.goto("/daftar");
  await page.getByLabel("Nama", { exact: true }).fill("Pelanggan Akun");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill(PASSWORD);
  await page.getByRole("button", { name: /Buat akun/ }).click();
  await page.waitForURL("**/dashboard");
  return email;
}

async function loginWith(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill(password);
  await page.getByRole("button", { name: /Masuk ke ruang undangan/ }).click();
}

/**
 * Email terakhir yang "dikirim" ke alamat itu. Endpoint uji ini hanya ada di
 * development tanpa DATABASE_URL (lihat src/pages/api/dev/last-mail.ts).
 */
async function lastMail(page: Page, to: string) {
  const response = await page.request.get(
    `/api/dev/last-mail?to=${encodeURIComponent(to)}`,
  );
  expect(response.status()).toBe(200);
  return (await response.json()).mail as { subject: string; text: string };
}

test("lupa kata sandi: tautan email, atur ulang, lalu masuk dengan kata sandi baru", async ({
  page,
  context,
}) => {
  const errors = trackErrors(page);
  const email = await register(page, "lupa");
  await context.clearCookies();

  await page.goto("/login");
  await page.getByRole("link", { name: "Lupa kata sandi?" }).click();
  await page.waitForURL("**/lupa-sandi");

  // Email tak dikenal dan terdaftar mendapat pesan yang persis sama.
  const done = page.locator("#forgot-done");
  await page.getByLabel("Email").fill(unique("tidak-ada"));
  await page.getByRole("button", { name: /Kirim tautan/ }).click();
  await expect(done).toBeVisible();
  const generic = await done.textContent();
  await page.reload();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /Kirim tautan/ }).click();
  await expect(done).toBeVisible();
  expect(await done.textContent()).toBe(generic);

  const mail = await lastMail(page, email);
  expect(mail.subject).toMatch(/kata sandi/i);
  const link = /https?:\/\/\S+\/reset-sandi\?token=[a-f0-9]{64}/.exec(
    mail.text,
  )![0];

  // Konfirmasi harus sama.
  await page.goto(link);
  await page.locator("#pw-password").fill("kata-sandi-baru-1");
  await page.locator("#pw-confirm").fill("kata-sandi-beda-2");
  await page.getByRole("button", { name: /Simpan kata sandi/ }).click();
  await expect(page.locator("#reset-error")).toContainText("Konfirmasi");

  await page.locator("#pw-confirm").fill("kata-sandi-baru-1");
  await page.getByRole("button", { name: /Simpan kata sandi/ }).click();
  await page.waitForURL("**/login?reset=1");
  await expect(page.locator("#login-notice")).toContainText("berhasil diubah");

  // Tautan sekali pakai.
  const reused = await page.goto(link);
  expect(reused?.status()).toBe(400);
  await expect(page.locator("body")).toContainText("tidak valid");

  // Kata sandi lama gagal, yang baru berhasil.
  await loginWith(page, email, PASSWORD);
  await expect(page.locator("#login-error")).not.toBeEmpty();
  await page.getByLabel("Kata sandi").fill("kata-sandi-baru-1");
  await page.getByRole("button", { name: /Masuk ke ruang undangan/ }).click();
  await page.waitForURL("**/dashboard");
  // Filter galat 400/401 yang memang diharapkan dari alur ini.
  expect(
    errors.filter(
      (e) => !/status of (400|401)|Failed to load resource/.test(e),
    ),
  ).toEqual([]);
});

test("ganti kata sandi dari pengaturan akun lalu masuk dengan kata sandi baru", async ({
  page,
  context,
}) => {
  const email = await register(page, "ganti");
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Akun" }).click();
  await page.waitForURL("**/dashboard/akun");

  const form = page.locator("[data-account-form=password]");
  await form.locator("#acc-pw-current").fill("salah-total-12");
  await form.locator("#acc-pw-new").fill("kata-sandi-baru-2");
  await form.locator("#acc-pw-confirm").fill("kata-sandi-baru-2");
  await form.getByRole("button", { name: "Ganti kata sandi" }).click();
  await expect(form.locator(".form-msg")).toContainText("tidak sesuai");

  await form.locator("#acc-pw-current").fill(PASSWORD);
  await form.locator("#acc-pw-new").fill("kata-sandi-baru-2");
  await form.locator("#acc-pw-confirm").fill("kata-sandi-baru-2");
  await form.getByRole("button", { name: "Ganti kata sandi" }).click();
  await expect(form.locator(".form-msg")).toContainText("Kata sandi diganti");

  // Sesi sekarang tetap berlaku.
  expect((await page.goto("/dashboard"))?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/dashboard");

  await context.clearCookies();
  await loginWith(page, email, PASSWORD);
  await expect(page.locator("#login-error")).not.toBeEmpty();
  await page.getByLabel("Kata sandi").fill("kata-sandi-baru-2");
  await page.getByRole("button", { name: /Masuk ke ruang undangan/ }).click();
  await page.waitForURL("**/dashboard");
});

test("profil, unduh data tanpa hash, dan hapus akun", async ({
  page,
  context,
}) => {
  const email = await register(page, "hapus");
  await page.goto("/dashboard/akun");

  await page.locator("#acc-name").fill("Nama Diperbarui");
  await page.getByRole("button", { name: "Simpan profil" }).click();
  await expect(
    page.locator("[data-account-form=profile] .form-msg"),
  ).toContainText("Profil disimpan");
  await page.reload();
  await expect(page.locator("#acc-name")).toHaveValue("Nama Diperbarui");

  const exported = await page.request.get("/api/account/export");
  expect(exported.status()).toBe(200);
  expect(exported.headers()["content-disposition"]).toContain("attachment");
  const text = await exported.text();
  expect(text).toContain(email);
  expect(text).not.toContain("passwordHash");
  expect(text).not.toContain("scrypt$");
  expect(text).not.toContain("tokenHash");

  page.on("dialog", (dialog) => void dialog.accept());
  const form = page.locator("[data-account-form=delete]");
  await form.locator("#acc-del-confirm").fill("HAPUS AKUN");
  await form.locator("#acc-del-pw").fill(PASSWORD);
  await form.getByRole("button", { name: "Hapus akun saya" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await context.clearCookies();
  await loginWith(page, email, PASSWORD);
  await expect(page.locator("#login-error")).not.toBeEmpty();
});

test("admin tidak melihat tombol hapus akun dan tidak bisa menghapusnya", async ({
  page,
}) => {
  await loginAsOwner(page);
  await page.goto("/dashboard/akun");
  await expect(page.locator("[data-account-form=delete]")).toHaveCount(0);
  const response = await page.request.post("/api/account/delete", {
    headers: { origin: new URL(page.url()).origin },
    data: { password: "demo-undangan-2026", confirmation: "HAPUS AKUN" },
  });
  expect(response.status()).toBe(403);
});

test("paket uji coba menampilkan tanda merek pada undangan, paket admin tidak", async ({
  page,
}) => {
  await register(page, "merek");
  const slugText = await page
    .locator(".invitation-chip span")
    .first()
    .textContent();
  const slug = slugText!.replace("/i/", "").trim();
  await page.goto(`/i/${slug}?preview=1`);
  const badge = page.locator(".branding-badge");
  await expect(badge).toHaveCount(1);
  await expect(badge).toContainText("Dibuat dengan Temu");
  await expect(page.locator(".invite-brand-credit")).toHaveCount(0);
  await expect(badge).toHaveAttribute("href", "/");

  // Ruang kerja admin tanpa batas: tidak ada tanda merek.
  await page.context().clearCookies();
  await loginAsOwner(page);
  await page.goto("/i/amara-raka?preview=1");
  await expect(page.locator(".invite-footer")).toHaveCount(1);
  await expect(page.locator(".branding-badge")).toHaveCount(0);
});

test("halaman contoh tema tidak tersaring oleh paket", async ({ page }) => {
  await page.goto("/themes/jepun-ivory");
  await expect(page.locator(".invite-footer")).toHaveCount(1);
  // Halaman pemasaran tetap memuat kredit merek.
  await expect(page.locator(".branding-badge")).toHaveCount(1);
});

test("login mengikuti ?next= yang aman dan menolak tujuan luar", async ({
  page,
  context,
}) => {
  const owner = {
    email: "owner@undangan.local",
    password: "demo-undangan-2026",
  };

  // Halaman admin mengarahkan tamu anonim ke /login?next=...
  await page.goto("/admin");
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/admin");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Kata sandi").fill(owner.password);
  await page.getByRole("button", { name: /Masuk ke ruang undangan/ }).click();
  await page.waitForURL("**/admin");
  await context.clearCookies();

  for (const next of ["//evil.test", "https://evil.test/x", "/\\evil.test"]) {
    await page.goto("/login?next=" + encodeURIComponent(next));
    await page.getByLabel("Email").fill(owner.email);
    await page.getByLabel("Kata sandi").fill(owner.password);
    await page.getByRole("button", { name: /Masuk ke ruang undangan/ }).click();
    await page.waitForURL("**/dashboard");
    expect(new URL(page.url()).hostname).not.toBe("evil.test");
    await context.clearCookies();
  }
});

test("pengguna yang sudah masuk diarahkan dari /login dan /daftar ke dashboard", async ({
  page,
}) => {
  await loginAsOwner(page);
  for (const path of ["/login", "/daftar", "/lupa-sandi"]) {
    await page.goto(path);
    expect(new URL(page.url()).pathname).toBe("/dashboard");
  }
});

test("halaman autentikasi tidak di-cache dan kolom kata sandi punya autocomplete serta tombol lihat", async ({
  page,
}) => {
  for (const path of ["/login", "/daftar", "/lupa-sandi"]) {
    const response = await page.goto(path);
    expect(response?.headers()["cache-control"]).toContain("no-store");
  }
  await page.goto("/login");
  const input = page.locator("#pw-password");
  await expect(input).toHaveAttribute("autocomplete", "current-password");
  await expect(input).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Tampilkan sandi" }).click();
  await expect(input).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Sembunyikan sandi" }).click();
  await expect(input).toHaveAttribute("type", "password");
  await page.goto("/daftar");
  await expect(page.locator("#pw-password")).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
  await page.goto("/reset-sandi?token=" + "a".repeat(64));
  await expect(page.locator("body")).toContainText("tidak valid");
});

test("halaman akun dan autentikasi tidak melimpah ke samping di layar sempit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page, "sempit");
  for (const path of ["/dashboard/akun", "/lupa-sandi", "/login"]) {
    if (path === "/lupa-sandi" || path === "/login")
      await page.context().clearCookies();
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
