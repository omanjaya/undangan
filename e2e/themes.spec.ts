import { expect, test } from "@playwright/test";
import { openCover, scrollToBottom, themeIds, trackErrors } from "./helpers";

for (const mode of ["", "/tanpa-foto"]) {
  for (const id of themeIds) {
    test(`tema ${id}${mode} tampil, cover terbuka, animasi tuntas`, async ({
      page,
    }) => {
      const errors = trackErrors(page);
      await page.goto(`/themes/${id}${mode}`);

      const cover = await openCover(page);
      await expect(cover).toBeHidden();
      await expect(page.locator("#wedding-title")).toBeVisible();

      await scrollToBottom(page);
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                Array.from(document.querySelectorAll<HTMLElement>(".im-reveal"))
                  .filter((node) => node.offsetParent !== null)
                  .filter((node) => Number(getComputedStyle(node).opacity) < 1)
                  .length,
            ),
          { timeout: 5000 },
        )
        .toBe(0);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
}
