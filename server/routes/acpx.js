import { Hono } from "hono";
import { safeJson } from "../hono-helpers.js";
import { runAcpxTask, runAcpxArgs } from "../../lib/acpx/acpx-runner.js";

const VALID_POLICIES = new Set(["local-only", "global-ok", "npx-fallback"]);
const VALID_TARGETS = new Set(["codex", "claude"]);

function normalizeConfig(raw) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  const commandPolicy = VALID_POLICIES.has(cfg.commandPolicy) ? cfg.commandPolicy : "local-only";
  const defaultTarget = VALID_TARGETS.has(cfg.defaultTarget) ? cfg.defaultTarget : "codex";
  const pinnedVersion = String(cfg.pinnedVersion || "0.3.1").trim() || "0.3.1";

  let timeoutSec = Number(cfg.timeoutSec);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) timeoutSec = 180;
  timeoutSec = Math.min(Math.max(timeoutSec, 5), 3600);

  return {
    enabled: cfg.enabled !== false,
    commandPolicy,
    defaultTarget,
    pinnedVersion,
    timeoutSec,
  };
}

function normalizeExecArgs(body) {
  if (Array.isArray(body?.args)) {
    return body.args.map((v) => String(v ?? "").trim()).filter(Boolean);
  }
  if (typeof body?.command === "string") {
    return body.command.trim().split(/\s+/).filter(Boolean);
  }
  return [];
}

export function createAcpxRoute(engine) {
  const route = new Hono();

  route.get("/acpx/config", async (c) => {
    const prefs = engine.getPreferences();
    return c.json({ config: normalizeConfig(prefs.acpx) });
  });

  route.put("/acpx/config", async (c) => {
    const body = await safeJson(c, null);
    if (!body || typeof body !== "object") {
      return c.json({ error: "invalid JSON body" }, 400);
    }

    const prefs = engine.getPreferences();
    prefs.acpx = normalizeConfig({ ...(prefs.acpx || {}), ...body });
    engine.savePreferences(prefs);
    return c.json({ ok: true, config: prefs.acpx });
  });

  route.post("/acpx/test", async (c) => {
    const body = await safeJson(c);
    const prefs = engine.getPreferences();
    const config = normalizeConfig(prefs.acpx);

    if (!config.enabled) {
      return c.json({ ok: false, error: "acpx integration is disabled" }, 400);
    }

    const target = body.target || config.defaultTarget;
    if (!VALID_TARGETS.has(target)) {
      return c.json({ ok: false, error: "invalid target (must be codex or claude)" }, 400);
    }

    const mode = body.mode === "prompt" ? "prompt" : "exec";
    const task = String(body.task || "Return one line: ACPX test ok.");
    const timeoutSec = Number.isFinite(body.timeoutSec) ? body.timeoutSec : Math.min(config.timeoutSec, 60);

    try {
      const result = await runAcpxTask({
        target,
        mode,
        task,
        session: body.session,
        cwd: engine.homeCwd || process.cwd(),
        timeoutSec,
        commandPolicy: config.commandPolicy,
        pinnedVersion: config.pinnedVersion,
      });

      return c.json({
        ok: result.ok,
        source: result.source,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        aborted: result.aborted,
        notFound: result.notFound,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.errorMessage,
      });
    } catch (err) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  route.post("/acpx/exec", async (c) => {
    const body = await safeJson(c);
    const prefs = engine.getPreferences();
    const config = normalizeConfig(prefs.acpx);

    if (!config.enabled) {
      return c.json({ ok: false, error: "acpx integration is disabled" }, 400);
    }

    const args = normalizeExecArgs(body);
    if (!args.length) {
      return c.json({ ok: false, error: "missing args" }, 400);
    }

    if (!VALID_TARGETS.has(args[0])) {
      return c.json({ ok: false, error: "first argument must be target: codex or claude" }, 400);
    }

    const timeoutSec = Number.isFinite(body.timeoutSec) ? body.timeoutSec : config.timeoutSec;

    try {
      const result = await runAcpxArgs({
        args,
        cwd: engine.homeCwd || process.cwd(),
        timeoutSec,
        commandPolicy: config.commandPolicy,
        pinnedVersion: config.pinnedVersion,
      });

      return c.json({
        ok: result.ok,
        args,
        source: result.source,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        aborted: result.aborted,
        notFound: result.notFound,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.errorMessage,
      });
    } catch (err) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  route.post("/acpx/exec/stream", async (c) => {
    const body = await safeJson(c);
    const prefs = engine.getPreferences();
    const config = normalizeConfig(prefs.acpx);

    if (!config.enabled) {
      return c.json({ ok: false, error: "acpx integration is disabled" }, 400);
    }

    const args = normalizeExecArgs(body);
    if (!args.length) {
      return c.json({ ok: false, error: "missing args" }, 400);
    }

    if (!VALID_TARGETS.has(args[0])) {
      return c.json({ ok: false, error: "first argument must be target: codex or claude" }, 400);
    }

    const timeoutSec = Number.isFinite(body.timeoutSec) ? body.timeoutSec : config.timeoutSec;
    const ac = new AbortController();
    const reqSignal = c.req.raw?.signal;
    if (reqSignal?.aborted) ac.abort();
    reqSignal?.addEventListener?.("abort", () => ac.abort(), { once: true });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const writeNdjson = (event) => {
          controller.enqueue(encoder.encode(`${JSON.stringify({ ts: Date.now(), ...event })}\n`));
        };

        (async () => {
          writeNdjson({ type: "phase", message: "Starting ACPX command..." });

          try {
            const result = await runAcpxArgs({
              args,
              cwd: engine.homeCwd || process.cwd(),
              timeoutSec,
              commandPolicy: config.commandPolicy,
              pinnedVersion: config.pinnedVersion,
              signal: ac.signal,
              onEvent: (event) => writeNdjson(event),
            });

            writeNdjson({
              type: "done",
              ok: result.ok,
              source: result.source,
              exitCode: result.exitCode,
              timedOut: result.timedOut,
              aborted: result.aborted,
              notFound: result.notFound,
              error: result.errorMessage || null,
            });
          } catch (err) {
            writeNdjson({
              type: "done",
              ok: false,
              error: err?.message || String(err),
            });
          } finally {
            controller.close();
          }
        })();
      },
      cancel() {
        ac.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });

  return route;
}