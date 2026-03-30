/**
 * 模型管理 REST 路由
 */
import { Hono } from "hono";
import { safeJson } from "../hono-helpers.js";
import { t } from "../i18n.js";
import { modelRefEquals, parseModelRef } from "../../shared/model-ref.js";
import { lookupKnown } from "../../shared/known-models.js";

/** 查询模型显示名：overrides > SDK name > known-models > id */
function resolveModelName(id, sdkName, overrides, provider) {
  if (overrides?.[id]?.displayName) return overrides[id].displayName;
  if (sdkName && sdkName !== id) return sdkName;
  const known = lookupKnown(provider, id);
  if (known?.name) return known.name;
  return sdkName || id;
}

export function createModelsRoute(engine) {
  const route = new Hono();

  // 列出可用模型
  route.get("/models", async (c) => {
    try {
      const overrides = engine.config?.models?.overrides;
      const cur = engine.currentModel;
      const models = engine.availableModels.map(m => ({
        id: m.id,
        name: resolveModelName(m.id, m.name, overrides, m.provider),
        provider: m.provider,
        isCurrent: modelRefEquals(m, cur),
        vision: m.vision,
        reasoning: m.reasoning,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
      }));
      return c.json({ models, current: cur?.id || null });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  // 健康检测：发一个最小 completion 请求，验证模型能真正回话
  route.post("/models/health", async (c) => {
    try {
      const body = await safeJson(c);
      const raw = body.modelId;
      if (!raw) return c.json({ error: "modelId required" }, 400);

      const ref = parseModelRef(raw);
      if (body.provider) ref.provider = body.provider;
      if (!ref.id) return c.json({ error: "modelId required" }, 400);

      // 统一凭证解析（找模型 + 拿凭证一步到位）
      const resolved = engine.resolveModelWithCredentials(ref);

      // Codex Responses API 无法简单探测
      if (resolved.api === "openai-codex-responses") {
        return c.json({ ok: true, status: 0, provider: resolved.provider, skipped: t("error.codexNoHealthCheck") });
      }

      // 发一个真实的 max_tokens=1 completion，验证模型能回话
      const { callText } = await import("../../core/llm-client.js");
      await callText({
        api: resolved.api,
        model: resolved.model,
        apiKey: resolved.api_key,
        baseUrl: resolved.base_url,
        provider: resolved.provider,
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 1,
        timeoutMs: 15_000,
      });
      return c.json({ ok: true, status: 200, provider: resolved.provider });
    } catch (err) {
      return c.json({ ok: false, error: err.message });
    }
  });

  // 切换模型
  route.post("/models/set", async (c) => {
    try {
      const body = await safeJson(c);
      const { modelId, provider } = body;
      if (!modelId) {
        return c.json({ error: t("error.missingParam", { param: "modelId" }) }, 400);
      }
      engine.setPendingModel(modelId, provider);
      return c.json({ ok: true, model: engine.currentModel?.name, pendingModel: true });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  return route;
}
