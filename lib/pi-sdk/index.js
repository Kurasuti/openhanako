/**
 * PI SDK Adapter — 所有 PI SDK 导入的唯一入口
 *
 * 稳定 API 直接 re-export，不稳定 API 通过适配函数封装。
 * 消费方不应直接 import "@mariozechner/..."，全部从这里导入。
 *
 * 纪律：
 *   - 不接受 engine / agent / config 参数
 *   - 不拼 session options（compaction、thinkingLevel 等）
 *   - 不做工具过滤 / plan mode 逻辑
 *   - 不持有任何状态
 */

// ── Session 管理 ──
export { createAgentSession, SessionManager, SettingsManager } from "@mariozechner/pi-coding-agent";

// ── 内置工具常量 ──
export { codingTools, grepTool, findTool, lsTool } from "@mariozechner/pi-coding-agent";

// ── 工具工厂（沙盒用）──
export {
  createReadTool, createWriteTool, createEditTool, createBashTool,
  createGrepTool, createFindTool, createLsTool,
} from "@mariozechner/pi-coding-agent";

// ── 资源加载 ──
export { DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

// ── Utilities ──
export { formatSkillsForPrompt, getLastAssistantUsage } from "@mariozechner/pi-coding-agent";
export { AuthStorage } from "@mariozechner/pi-coding-agent";

// ── pi-ai（传递依赖，升级时需确认仍为 pi-coding-agent 的 dep）──
export { StringEnum } from "@mariozechner/pi-ai";
export { registerOAuthProvider } from "@mariozechner/pi-ai/oauth";

// ── 类型 re-export（供 JSDoc 引用）──
/** @typedef {import('@mariozechner/pi-coding-agent').ToolDefinition} ToolDefinition */

// ── 不稳定 API 适配 ──
import { ModelRegistry } from "@mariozechner/pi-coding-agent";

/**
 * ModelRegistry 工厂。
 * 0.64.0 将构造函数私有化，必须用静态方法。
 * 下次 SDK 改工厂签名，只改这里。
 * @param {import('@mariozechner/pi-coding-agent').AuthStorage} authStorage
 * @param {string} [modelsJsonPath]
 * @returns {import('@mariozechner/pi-coding-agent').ModelRegistry}
 */
export function createModelRegistry(authStorage, modelsJsonPath) {
  return ModelRegistry.create(authStorage, modelsJsonPath);
}
