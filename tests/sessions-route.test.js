import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const browserManagerMock = {
  isRunning: true,
  currentUrl: "https://before.example.com",
  suspendForSession: vi.fn(async () => {
    browserManagerMock.isRunning = false;
    browserManagerMock.currentUrl = null;
  }),
  resumeForSession: vi.fn(async () => {
    browserManagerMock.isRunning = true;
    browserManagerMock.currentUrl = "https://after.example.com";
  }),
  closeBrowserForSession: vi.fn(),
  getBrowserSessions: vi.fn(() => ({})),
};

vi.mock("../lib/browser/browser-manager.js", () => ({
  BrowserManager: {
    instance: () => browserManagerMock,
  },
}));

vi.mock("../core/message-utils.js", () => ({
  extractTextContent: () => ({ text: "", images: [], thinking: "", toolUses: [] }),
  loadSessionHistoryMessages: vi.fn(async () => []),
  isValidSessionPath: vi.fn(() => true),
}));

describe("sessions route", () => {
  beforeEach(() => {
    browserManagerMock.isRunning = true;
    browserManagerMock.currentUrl = "https://before.example.com";
    browserManagerMock.suspendForSession.mockClear();
    browserManagerMock.resumeForSession.mockClear();
    browserManagerMock.closeBrowserForSession.mockClear();
  });

  it("restores browser state for the target session after switch", async () => {
    const { createSessionsRoute } = await import("../server/routes/sessions.js");
    const app = new Hono();

    const engine = {
      agentsDir: "/tmp/agents",
      currentSessionPath: "/tmp/agents/a/sessions/old.jsonl",
      messages: [{ role: "assistant", content: "ok" }],
      memoryEnabled: true,
      planMode: false,
      memoryModelUnavailableReason: null,
      cwd: "/tmp/workspace",
      currentAgentId: "hana",
      agentName: "Hana",
      currentModel: { id: "gpt-test", provider: "openai" },
      isSessionStreaming: vi.fn(() => false),
      switchSession: vi.fn(async (sessionPath) => {
        engine.currentSessionPath = sessionPath;
      }),
    };

    app.route("/api", createSessionsRoute(engine));

    const res = await app.request("/api/sessions/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp/agents/a/sessions/new.jsonl" }),
    });

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(browserManagerMock.suspendForSession).toHaveBeenCalledWith("/tmp/agents/a/sessions/old.jsonl");
    expect(browserManagerMock.resumeForSession).toHaveBeenCalledWith("/tmp/agents/a/sessions/new.jsonl");
    expect(data.browserRunning).toBe(true);
    expect(data.browserUrl).toBe("https://after.example.com");
  });
});
