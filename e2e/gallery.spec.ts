import { expect, test } from "@playwright/test";
import { openCover } from "./helpers";

test("lightbox galeri: buka, berikutnya, Escape, fokus kembali", async ({
  page,
}) => {
  await page.goto("/themes/jepun-ivory");
  await openCover(page);

  const items = page.locator(".invite-gallery-item");
  expect(await items.count()).toBeGreaterThan(1);
  const first = items.first();
  await first.scrollIntoViewIfNeeded();
  await first.click();

  const dialog = page.locator("[data-gallery-lightbox]");
  await expect(dialog).toBeVisible();
  const counter = dialog.locator("[data-lightbox-current]");
  await expect(counter).toHaveText("1");
  const image = dialog.locator("[data-lightbox-image]");
  await expect(image).toHaveAttribute("src", /.+/);
  const firstSrc = await image.getAttribute("src");

  await dialog.locator("[data-lightbox-next]").click();
  await expect(counter).toHaveText("2");
  await expect(image).not.toHaveAttribute("src", firstSrc!);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(first).toBeFocused();
});
