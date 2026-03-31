// plugins/image-gen/index.js
import { registerAdapter } from "./adapters/registry.js";
import { volcengineAdapter } from "./adapters/volcengine.js";
import { openaiAdapter } from "./adapters/openai.js";

export default class ImageGenPlugin {
  async onload() {
    registerAdapter("volcengine", volcengineAdapter);
    registerAdapter("volcengine-coding", volcengineAdapter);
    registerAdapter("openai", openaiAdapter);
  }
}
