import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 4399);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  // Alur tamu dan pemilik berbagi satu berkas state, jadi dijalankan berurutan.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure", locale: "id-ID" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    // State dihapus sebelum server menyala supaya setiap proses mulai dari seed.
    command: `rm -rf .data-e2e && npm run dev -- --port ${port} --strictPort --ignore-lock`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATA_DIR: ".data-e2e",
      NODE_ENV: "development",
      DATABASE_URL: "",
      APP_URL: "",
      OWNER_PASSWORD: "",
      ASTRO_TELEMETRY_DISABLED: "1",
    },
  },
});
