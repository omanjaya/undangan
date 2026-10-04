import { expect, type Page } from "@playwright/test";

export const themeIds = [
  "jepun-ivory",
  "puri-emerald",
  "senja-terracotta",
  "lotus-rosa",
  "samudra-biru",
  "sawah-hijau",
  "malam-keemasan",
  "pasir-putih",
  "midnight-monochrome",
] as const;

export const ownerLogin = {
  email: "owner@undangan.local",
  password: "demo-undangan-2026",
};

/** Mengumpulkan galat halaman dan console.error untuk diperiksa di akhir tes. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push(`console: ${message.text()} @ ${message.location().url}`);
  });
  return errors;
}

export async function openCover(page: Page) {
  const cover = page.locator(".invite-cover");
  await expect(cover).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/invite-locked/);
  await page.locator("[data-open-invitation]").click();
  await expect(page.locator("html")).not.toHaveClass(/invite-locked/);
  return cover;
}

export async function loginAsOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerLogin.email);
  await page.getByLabel("Kata sandi").fill(ownerLogin.password);
  await page.getByRole("button", { name: /Masuk ke ruang undangan/ }).click();
  await page.waitForURL("**/dashboard");
}

/**
 * Menggulir bertahap ke dasar halaman agar IntersectionObserver memicu semua
 * reveal. Memakai perilaku instan karena CSS dapat mengaktifkan smooth scroll.
 */
export async function scrollToBottom(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.5));
    const root = document.documentElement;
    while (window.scrollY + window.innerHeight < root.scrollHeight - 1) {
      window.scrollBy({ top: step, behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  });
}
