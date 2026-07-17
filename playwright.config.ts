import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  outputDir: ".artifacts/playwright",
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:4174",
    channel: "chrome",
    headless: true,
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command:
          "npm run preview -- --host 127.0.0.1 --port 4174 --strictPort",
        url: "http://127.0.0.1:4174",
        reuseExistingServer: true,
        timeout: 30_000,
      },
  projects: [
    {
      name: "desktop-chrome",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chrome",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
  ],
});
