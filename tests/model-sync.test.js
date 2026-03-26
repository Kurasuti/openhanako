/**
 * model-sync.js 单元测试
 *
 * 测试：providers.yaml → models.json 单向投影
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// mock known-models.json：只提供测试用的几条
vi.mock("../shared/hana-root.js", () => ({
  fromRoot: (...segments) => path.join("/fake-root", ...segments),
}));

// 控制 readFileSync 对 known-models.json 的返回值
const KNOWN_MODELS = {
  "qwen3.5-flash": { name: "Qwen3.5 Flash", context: 131072, maxOutput: 8192 },
  "deepseek-chat": { name: "DeepSeek Chat", context: 128000, maxOutput: 8192 },
  "gpt-4o": { name: "GPT-4o", context: 128000, maxOutput: 16384 },
};

const _origReadFileSync = fs.readFileSync;
vi.spyOn(fs, "readFileSync").mockImplementation((p, ...args) => {
  if (String(p).includes("known-models.json")) {
    return JSON.stringify(KNOWN_MODELS);
  }
  return _origReadFileSync.call(fs, p, ...args);
});

const tmpDir = path.join(os.tmpdir(), "hana-test-model-sync-" + Date.now());
let modelsJsonPath;
let authJsonPath;

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  modelsJsonPath = path.join(tmpDir, "models.json");
  authJsonPath = path.join(tmpDir, "auth.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function loadSync() {
  const mod = await import("../core/model-sync.js");
  return mod.syncModels;
}

describe("syncModels", () => {
  it("writes providers with credentials and models to models.json", async () => {
    const syncModels = await loadSync();

    const providers = {
      dashscope: {
        base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api: "openai-completions",
        api_key: "sk-test",
        models: ["qwen3.5-flash"],
      },
    };

    const changed = syncModels(providers, { modelsJsonPath });

    expect(changed).toBe(true);
    const result = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
    expect(result.providers.dashscope).toBeDefined();
    expect(result.providers.dashscope.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
    expect(result.providers.dashscope.api).toBe("openai-completions");
    expect(result.providers.dashscope.apiKey).toBe("sk-test");
    expect(result.providers.dashscope.models).toHaveLength(1);
    expect(result.providers.dashscope.models[0].id).toBe("qwen3.5-flash");
  });

  it("skips providers without api_key (and not localhost/OAuth)", async () => {
    const syncModels = await loadSync();

    const providers = {
      dashscope: {
        base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api: "openai-completions",
        // no api_key
        models: ["qwen3.5-flash"],
      },
    };

    const changed = syncModels(providers, { modelsJsonPath });

    expect(changed).toBe(true);
    const result = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
    expect(result.providers.dashscope).toBeUndefined();
    expect(Object.keys(result.providers)).toHaveLength(0);
  });

  it("skips providers without models", async () => {
    const syncModels = await loadSync();

    const providers = {
      dashscope: {
        base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api: "openai-completions",
        api_key: "sk-test",
        // no models
      },
    };

    const changed = syncModels(providers, { modelsJsonPath });

    expect(changed).toBe(true);
    const result = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
    expect(result.providers.dashscope).toBeUndefined();
  });

  it("skips providers without base_url", async () => {
    const syncModels = await loadSync();

    const providers = {
      dashscope: {
        // no base_url
        api: "openai-completions",
        api_key: "sk-test",
        models: ["qwen3.5-flash"],
      },
    };

    const changed = syncModels(providers, { modelsJsonPath });

    expect(changed).toBe(true);
    const result = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
    expect(result.providers.dashscope).toBeUndefined();
  });

  it("enriches model metadata from known-models.json", async () => {
    const syncModels = await loadSync();

    const providers = {
      dashscope: {
        base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api: "openai-completions",
        api_key: "sk-test",
        models: ["qwen3.5-flash"],
      },
    };

    syncModels(providers, { modelsJsonPath });

    const result = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
    const model = result.providers.dashscope.models[0];
    expect(model.name).toBe("Qwen3.5 Flash");
    expect(model.contextWindow).toBe(131072);
    expect(model.maxTokens).toBe(8192);
    expect(model.input).toEqual(["text", "image"]);
  });

  it("handles model objects with user overrides (name, context, maxOutput)", async () => {
    const syncModels = await loadSync();

    const providers = {
      dashscope: {
        base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api: "openai-completions",
        api_key: "sk-test",
        models: [
          { id: "qwen3.5-flash", name: "My Custom Qwen", context: 65536, maxOutput: 4096 },
        ],
      },
    };

    syncModels(providers, { modelsJsonPath });

    const result = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
    const model = result.providers.dashscope.models[0];
    expect(model.id).toBe("qwen3.5-flash");
    expect(model.name).toBe("My Custom Qwen");
    expect(model.contextWindow).toBe(65536);
    expect(model.maxTokens).toBe(4096);
  });

  it("resolves OAuth credentials from auth.json via oauthKeyMap", async () => {
    const syncModels = await loadSync();

    // write auth.json with an OAuth token under "minimax" key
    fs.writeFileSync(authJsonPath, JSON.stringify({
      minimax: { apiKey: "oauth-token-123" },
    }), "utf-8");

    const providers = {
      "minimax-oauth": {
        base_url: "https://api.minimax.chat/v1",
        api: "openai-completions",
        // no api_key — should resolve from auth.json
        models: ["minimax-model-1"],
      },
    };

    const oauthKeyMap = { "minimax-oauth": "minimax" };

    const changed = syncModels(providers, { modelsJsonPath, authJsonPath, oauthKeyMap });

    expect(changed).toBe(true);
    const result = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
    expect(result.providers["minimax-oauth"]).toBeDefined();
    expect(result.providers["minimax-oauth"].apiKey).toBe("oauth-token-123");
  });

  it("uses atomic write (tmp + rename)", async () => {
    const syncModels = await loadSync();

    const renameSpy = vi.spyOn(fs, "renameSync");

    const providers = {
      dashscope: {
        base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api: "openai-completions",
        api_key: "sk-test",
        models: ["qwen3.5-flash"],
      },
    };

    syncModels(providers, { modelsJsonPath });

    // renameSync should have been called with a tmp path → final path
    expect(renameSpy).toHaveBeenCalledTimes(1);
    const [src, dest] = renameSpy.mock.calls[0];
    expect(dest).toBe(modelsJsonPath);
    expect(src).toMatch(/\.tmp$/);

    renameSpy.mockRestore();
  });

  it("returns false if no changes", async () => {
    const syncModels = await loadSync();

    const providers = {
      dashscope: {
        base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api: "openai-completions",
        api_key: "sk-test",
        models: ["qwen3.5-flash"],
      },
    };

    // first call: writes
    const changed1 = syncModels(providers, { modelsJsonPath });
    expect(changed1).toBe(true);

    // second call: same data, no change
    const changed2 = syncModels(providers, { modelsJsonPath });
    expect(changed2).toBe(false);
  });

  it("allows localhost providers without api_key", async () => {
    const syncModels = await loadSync();

    const providers = {
      ollama: {
        base_url: "http://localhost:11434/v1",
        api: "openai-completions",
        // no api_key — but localhost, should pass
        models: ["llama3"],
      },
    };

    const changed = syncModels(providers, { modelsJsonPath });

    expect(changed).toBe(true);
    const result = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
    expect(result.providers.ollama).toBeDefined();
    expect(result.providers.ollama.apiKey).toBe("local");
    expect(result.providers.ollama.models[0].id).toBe("llama3");
  });

  it("handles multiple providers in one call", async () => {
    const syncModels = await loadSync();

    const providers = {
      dashscope: {
        base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        api: "openai-completions",
        api_key: "sk-dash",
        models: ["qwen3.5-flash"],
      },
      deepseek: {
        base_url: "https://api.deepseek.com/v1",
        api: "openai-completions",
        api_key: "sk-deep",
        models: ["deepseek-chat"],
      },
    };

    syncModels(providers, { modelsJsonPath });

    const result = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
    expect(Object.keys(result.providers)).toHaveLength(2);
    expect(result.providers.dashscope.models[0].id).toBe("qwen3.5-flash");
    expect(result.providers.deepseek.models[0].id).toBe("deepseek-chat");
    expect(result.providers.deepseek.models[0].name).toBe("DeepSeek Chat");
  });

  it("falls back to humanized name for unknown models", async () => {
    const syncModels = await loadSync();

    const providers = {
      custom: {
        base_url: "https://custom.api.com/v1",
        api: "openai-completions",
        api_key: "sk-custom",
        models: ["my-custom-model-240101"],
      },
    };

    syncModels(providers, { modelsJsonPath });

    const result = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
    const model = result.providers.custom.models[0];
    // date suffix stripped, humanized
    expect(model.name).toBe("My Custom Model");
    expect(model.contextWindow).toBe(128000); // default
  });
});
