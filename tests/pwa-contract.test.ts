import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("installable web release", () => {
  it("publishes a scoped standalone manifest with a maskable icon", () => {
    const manifest = JSON.parse(
      readFileSync("public/manifest.webmanifest", "utf8"),
    ) as {
      start_url: string;
      scope: string;
      display: string;
      icons: { purpose?: string }[];
    };
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((icon) => icon.purpose?.includes("maskable"))).toBe(
      true,
    );
  });

  it("caches the application shell but explicitly excludes the soundtrack", () => {
    const worker = readFileSync("public/sw.js", "utf8");
    expect(worker).toContain('caches.match("/")');
    expect(worker).toContain('url.pathname.startsWith("/music/")');
    expect(worker).toContain("builtAssets");
    expect(worker).toContain("self.skipWaiting()");
  });
});
