// plugins/image-gen/index.js
import path from "node:path";
import fs from "node:fs";
import { AdapterRegistry } from "./lib/adapter-registry.js";
import { TaskStore } from "./lib/task-store.js";
import { Poller } from "./lib/poller.js";
import { volcengineImageAdapter } from "./adapters/volcengine.js";
import { openaiImageAdapter } from "./adapters/openai.js";

export default class ImageGenPlugin {
  async onload() {
    const { dataDir, bus, log } = this.ctx;

    const generatedDir = path.join(dataDir, "generated");
    fs.mkdirSync(generatedDir, { recursive: true });

    // Infrastructure
    const registry = new AdapterRegistry();
    const store = new TaskStore(dataDir);
    const poller = new Poller({ store, registry, bus, generatedDir, log });

    // Built-in adapters
    registry.register(volcengineImageAdapter);
    registry.register({ ...volcengineImageAdapter, id: "volcengine-coding" });
    registry.register(openaiImageAdapter);

    // Attach to ctx for tools
    this.ctx._mediaGen = { registry, store, poller, generatedDir };

    // Bus handlers — adapter registration (for external plugins like dreamina)
    bus.handle("media-gen:register-adapter", ({ adapter }) => {
      registry.register(adapter);
      log.info(`adapter registered: ${adapter.id}`);
      return { ok: true };
    });

    bus.handle("media-gen:unregister-adapter", ({ adapterId }) => {
      registry.unregister(adapterId);
      log.info(`adapter unregistered: ${adapterId}`);
      return { ok: true };
    });

    // Listen for fire-and-forget unregister events (plugin teardown is sync)
    bus.subscribe((event) => {
      if (event.type === "media-gen:adapter-removed" && event.adapterId) {
        registry.unregister(event.adapterId);
        log.info(`adapter removed (event): ${event.adapterId}`);
      }
    });

    bus.handle("media-gen:list-adapters", () => {
      return { adapters: registry.list().map((a) => ({ id: a.id, name: a.name, types: a.types })) };
    });

    // Bus handlers — task CRUD (for external panels like dreamina)
    bus.handle("media-gen:get-tasks", ({ adapterId, batchId, status } = {}) => {
      let tasks = store.listAll();
      if (adapterId) tasks = tasks.filter((t) => t.adapterId === adapterId);
      if (batchId) tasks = tasks.filter((t) => t.batchId === batchId);
      if (status) tasks = tasks.filter((t) => t.status === status);
      return { tasks };
    });

    bus.handle("media-gen:get-task", ({ taskId }) => {
      return { task: store.get(taskId) };
    });

    bus.handle("media-gen:update-task", ({ taskId, fields }) => {
      const allowed = {};
      if (typeof fields?.favorited === "boolean") allowed.favorited = fields.favorited;
      store.update(taskId, allowed);
      return { ok: true };
    });

    bus.handle("media-gen:remove-task", ({ taskId }) => {
      const task = store.get(taskId);
      if (task) {
        for (const f of task.files || []) {
          try { fs.unlinkSync(path.join(generatedDir, f)); } catch { /* ok */ }
        }
        store.remove(taskId);
      }
      return { ok: true };
    });

    bus.handle("media-gen:remove-unfavorited", () => {
      const removed = store.removeUnfavorited();
      for (const t of removed) {
        for (const f of t.files || []) {
          try { fs.unlinkSync(path.join(generatedDir, f)); } catch { /* ok */ }
        }
      }
      return { ok: true, removed: removed.length };
    });

    // Start poller
    poller.start();

    // Cleanup
    this.register(() => {
      poller.stop();
      store.destroy();
      log.info("image-gen plugin unloaded");
    });

    log.info("image-gen plugin loaded (unified media-gen)");
  }
}
