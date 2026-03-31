import { describe, expect, it, vi } from "vitest";
import { BrowserManager } from "../lib/browser/browser-manager.js";

describe("BrowserManager URL tracking", () => {
  it.each([
    ["scroll", (manager) => manager.scroll("down", 2)],
    ["select", (manager) => manager.select(7, "next")],
    ["pressKey", (manager) => manager.pressKey("Enter")],
    ["wait", (manager) => manager.wait({ timeout: 100 })],
  ])("%s updates currentUrl from browser command results", async (_name, action) => {
    const manager = new BrowserManager();
    manager._url = "https://before.example.com";
    manager._sendCmd = vi.fn().mockResolvedValue({
      currentUrl: "https://after.example.com",
      text: "snapshot",
    });

    const text = await action(manager);

    expect(text).toBe("snapshot");
    expect(manager.currentUrl).toBe("https://after.example.com");
  });
});
