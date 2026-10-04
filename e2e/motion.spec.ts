import { expect, test } from "@playwright/test";
import { openCover, trackErrors } from "./helpers";

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("cover terbuka seketika dan konten langsung terlihat", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto("/themes/jepun-ivory");
    const cover = await openCover(page);
    // Tanpa animasi, jeda penutupan 0 ms (bukan 800 ms).
    await expect(cover).toBeHidden({ timeout: 400 });
    await expect(page.locator("#wedding-title")).toBeVisible();
    await expect(page.locator("#wedding-title")).toBeFocused();

    const hiddenReveals = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll<HTMLElement>(".im-reveal")).filter(
          (node) => Number(getComputedStyle(node).opacity) < 1,
        ).length,
    );
    expect(hiddenReveals).toBe(0);
    expect(errors).toEqual([]);
  });
});
