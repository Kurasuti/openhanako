// plugins/image-gen/adapters/openai.js
import fs from "fs";
import path from "path";

const FORMAT_TO_MIME = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

// OpenAI gpt-image 支持的尺寸
const OPENAI_RATIO_TO_SIZE = {
  "1:1": "1024x1024",
  "4:3": "1536x1024", "3:4": "1024x1536",
  "16:9": "1536x1024", "9:16": "1024x1536",
  "3:2": "1536x1024", "2:3": "1024x1536",
};

export const openaiAdapter = {
  async generate({ prompt, modelId, apiKey, baseUrl, size, format, quality, aspectRatio, image, providerDefaults }) {
    const outputFormat = format || providerDefaults?.format || "jpeg";
    const effectiveRatio = aspectRatio || providerDefaults?.aspect_ratio;
    const body = {
      model: modelId,
      prompt,
      n: 1,
      output_format: outputFormat,
    };

    // size: 显式 size > 长宽比查表 > provider 默认
    if (size) {
      body.size = size;
    } else if (effectiveRatio && OPENAI_RATIO_TO_SIZE[effectiveRatio]) {
      body.size = OPENAI_RATIO_TO_SIZE[effectiveRatio];
    } else if (providerDefaults?.size) {
      body.size = providerDefaults.size;
    }

    if (quality || providerDefaults?.quality) body.quality = quality || providerDefaults.quality;

    if (providerDefaults) {
      if (providerDefaults.background) body.background = providerDefaults.background;
    }

    // 参考图（image-to-image）
    if (image) {
      const images = Array.isArray(image) ? image : [image];
      body.image = images.map(img => {
        if (path.isAbsolute(img) && fs.existsSync(img)) {
          const buf = fs.readFileSync(img);
          const ext = path.extname(img).slice(1).toLowerCase();
          const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" }[ext] || "image/png";
          return `data:${mime};base64,${buf.toString("base64")}`;
        }
        return img;
      });
    }

    const url = `${baseUrl.replace(/\/+$/, "")}/images/generations`;

    // OpenAI gpt-image 用 /images/edits 做图生图
    const endpoint = body.image
      ? `${baseUrl.replace(/\/+$/, "")}/images/edits`
      : url;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let msg = `API error ${res.status}`;
      try {
        const err = await res.json();
        if (err.error?.message) msg = `${msg}: ${err.error.message}`;
      } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    const images = data.data || [];
    if (images.length === 0) {
      throw new Error("API returned no images");
    }

    const mimeType = FORMAT_TO_MIME[outputFormat] || "image/png";
    const revisedPrompt = images[0]?.revised_prompt;

    return {
      images: images.map((img, i) => ({
        buffer: Buffer.from(img.b64_json, "base64"),
        mimeType,
        fileName: `image-${i + 1}.${outputFormat}`,
      })),
      ...(revisedPrompt ? { revisedPrompt } : {}),
    };
  },
};
