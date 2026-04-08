import { describe, it, expect } from "vitest";
import { resolveAgent, resolveAgentStrict } from "../server/utils/resolve-agent.js";

function mockEngine(agents) {
  return {
    getAgent: (id) => agents[id] || null,
    agent: agents._focus,
    currentAgentId: "_focus",
  };
}

function mockCtx(agentId) {
  return { req: { query: (k) => k === "agentId" ? agentId : null, param: () => null } };
}

describe("resolveAgentStrict", () => {
  it("找到 agent 时正常返回", () => {
    const engine = mockEngine({ hana: { id: "hana" }, _focus: { id: "_focus" } });
    expect(resolveAgentStrict(engine, mockCtx("hana"))).toEqual({ id: "hana" });
  });

  it("agentId 不存在时抛 AgentNotFoundError", () => {
    const engine = mockEngine({ _focus: { id: "_focus" } });
    expect(() => resolveAgentStrict(engine, mockCtx("ghost"))).toThrow("not found");
  });

  it("无显式 agentId 时返回焦点 agent", () => {
    const engine = mockEngine({ _focus: { id: "_focus" } });
    expect(resolveAgentStrict(engine, mockCtx(null))).toEqual({ id: "_focus" });
  });
});

describe("resolveAgent (读操作 fallback)", () => {
  it("agentId 不存在时 fallback 到焦点 agent", () => {
    const engine = mockEngine({ _focus: { id: "_focus" } });
    expect(resolveAgent(engine, mockCtx("ghost"))).toEqual({ id: "_focus" });
  });
});
