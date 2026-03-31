import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("volcengine adapter", () => {
  beforeEach(() => mockFetch.mockReset());

  it("sends correct request and returns buffer from b64_json", async () => {
    const { volcengineAdapter } = await import("../plugins/image-gen/adapters/volcengine.js");

    const fakeB64 = Buffer.from("fake-image").toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ b64_json: fakeB64, size: "2048x2048" }],
      }),
    });

    const result = await volcengineAdapter.generate({
      prompt: "a cat",
      modelId: "doubao-seedream-4-0-250828",
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      size: "2K",
      format: "png",
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/images/generations");
    expect(opts.headers["Authorization"]).toBe("Bearer test-key");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("doubao-seedream-4-0-250828");
    expect(body.prompt).toBe("a cat");
    expect(body.response_format).toBe("b64_json");
    expect(body.size).toBe("2K");
    expect(body.output_format).toBe("png");

    expect(result.images).toHaveLength(1);
    expect(result.images[0].buffer).toEqual(Buffer.from("fake-image"));
    expect(result.images[0].mimeType).toBe("image/png");
  });

  it("applies providerDefaults (watermark, guidance_scale)", async () => {
    const { volcengineAdapter } = await import("../plugins/image-gen/adapters/volcengine.js");

    const fakeB64 = Buffer.from("img").toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: fakeB64 }] }),
    });

    await volcengineAdapter.generate({
      prompt: "test",
      modelId: "test-model",
      apiKey: "key",
      baseUrl: "https://test.com",
      providerDefaults: { watermark: true, guidance_scale: 7.5 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.watermark).toBe(true);
    expect(body.guidance_scale).toBe(7.5);
  });

  it("throws on API error with status and message", async () => {
    const { volcengineAdapter } = await import("../plugins/image-gen/adapters/volcengine.js");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "invalid key" } }),
    });

    await expect(volcengineAdapter.generate({
      prompt: "a cat", modelId: "test", apiKey: "bad", baseUrl: "https://test.com",
    })).rejects.toThrow(/401/);
  });

  it("throws when data array is empty", async () => {
    const { volcengineAdapter } = await import("../plugins/image-gen/adapters/volcengine.js");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await expect(volcengineAdapter.generate({
      prompt: "test", modelId: "test", apiKey: "key", baseUrl: "https://test.com",
    })).rejects.toThrow();
  });
});

describe("openai adapter", () => {
  beforeEach(() => mockFetch.mockReset());

  it("sends correct request and returns buffer from b64_json", async () => {
    const { openaiAdapter } = await import("../plugins/image-gen/adapters/openai.js");

    const fakeB64 = Buffer.from("fake-openai-image").toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ b64_json: fakeB64, revised_prompt: "A fluffy dog in a park" }],
      }),
    });

    const result = await openaiAdapter.generate({
      prompt: "a dog",
      modelId: "gpt-image-1",
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      size: "1024x1024",
      quality: "medium",
      format: "png",
    });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(opts.headers["Authorization"]).toBe("Bearer sk-test");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("gpt-image-1");
    expect(body.prompt).toBe("a dog");
    expect(body.quality).toBe("medium");
    expect(body.n).toBe(1);

    expect(result.images).toHaveLength(1);
    expect(result.images[0].buffer).toEqual(Buffer.from("fake-openai-image"));
    expect(result.images[0].mimeType).toBe("image/png");
    expect(result.revisedPrompt).toBe("A fluffy dog in a park");
  });

  it("applies providerDefaults (background)", async () => {
    const { openaiAdapter } = await import("../plugins/image-gen/adapters/openai.js");

    const fakeB64 = Buffer.from("img").toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: fakeB64 }] }),
    });

    await openaiAdapter.generate({
      prompt: "test",
      modelId: "gpt-image-1",
      apiKey: "key",
      baseUrl: "https://api.openai.com/v1",
      providerDefaults: { background: "transparent" },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.background).toBe("transparent");
  });

  it("throws on API error", async () => {
    const { openaiAdapter } = await import("../plugins/image-gen/adapters/openai.js");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "rate limit exceeded" } }),
    });

    await expect(openaiAdapter.generate({
      prompt: "test", modelId: "test", apiKey: "key", baseUrl: "https://test.com",
    })).rejects.toThrow(/429/);
  });
});
