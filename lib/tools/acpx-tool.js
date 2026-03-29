import { Type } from "@sinclair/typebox";
import { runAcpxTask } from "../acpx/acpx-runner.js";

const VALID_POLICIES = new Set(["local-only", "global-ok", "npx-fallback"]);
const VALID_TARGETS = new Set(["codex", "claude"]);
const VALID_APPROVAL_POLICIES = new Set(["inherit", "approve-all", "approve-reads", "deny-all"]);

function normalizeConfig(raw) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  const policy = VALID_POLICIES.has(cfg.commandPolicy) ? cfg.commandPolicy : "local-only";
  const target = VALID_TARGETS.has(cfg.defaultTarget) ? cfg.defaultTarget : "codex";
  const pinnedVersion = String(cfg.pinnedVersion || "0.3.1").trim() || "0.3.1";
  const approvalPolicy = VALID_APPROVAL_POLICIES.has(cfg.approvalPolicy) ? cfg.approvalPolicy : "approve-reads";

  let timeoutSec = Number(cfg.timeoutSec);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) timeoutSec = 180;
  timeoutSec = Math.min(Math.max(timeoutSec, 5), 3600);

  return {
    enabled: cfg.enabled !== false,
    commandPolicy: policy,
    defaultTarget: target,
    pinnedVersion,
    approvalPolicy,
    timeoutSec,
  };
}

function formatFailure(result) {
  const lines = ["ACPX call failed."];
  if (result.notFound) {
    lines.push("No usable acpx command was found.");
    if (result.attemptedSources?.length) {
      lines.push(`Checked: ${result.attemptedSources.join(", ")}`);
    }
    lines.push("Install local acpx dependency or allow npx/global fallback.");
    return lines.join("\n");
  }

  if (result.timedOut) lines.push("Reason: timeout.");
  if (result.aborted) lines.push("Reason: aborted.");
  if (result.exitCode !== null && result.exitCode !== undefined) {
    lines.push(`Exit code: ${result.exitCode}`);
  }
  if (result.signal) lines.push(`Signal: ${result.signal}`);
  if (result.source) lines.push(`Source: ${result.source}`);
  if (result.command) lines.push(`Command: ${result.command}`);
  if (result.errorMessage) lines.push(`Error: ${result.errorMessage}`);
  if (result.stderr) lines.push(`stderr:\n${result.stderr}`);
  return lines.join("\n");
}

export function createAcpxTool(deps = {}) {
  return {
    name: "acpx",
    label: "Delegate via ACPX",
    description:
      "Delegate a coding task to ACPX targets (codex/claude) and return the final text result.",
    parameters: Type.Object({
      task: Type.String({
        description: "Task text for the external coding agent.",
      }),
      target: Type.Optional(
        Type.Union([Type.Literal("codex"), Type.Literal("claude")], {
          description: "Target external coding agent. Defaults to settings.defaultTarget.",
        }),
      ),
      mode: Type.Optional(
        Type.Union([Type.Literal("exec"), Type.Literal("prompt")], {
          description: "exec is one-shot. prompt uses persisted session behavior.",
        }),
      ),
      session: Type.Optional(
        Type.String({
          description: "Optional session name used by ACPX (-s) when mode is prompt.",
        }),
      ),
      timeoutSec: Type.Optional(
        Type.Number({
          minimum: 5,
          maximum: 3600,
          description: "Timeout seconds for this single ACPX call.",
        }),
      ),
    }),

    execute: async (_toolCallId, params, signal) => {
      const cfg = normalizeConfig(deps.getConfig?.());
      if (!cfg.enabled) {
        return {
          content: [
            {
              type: "text",
              text: "ACPX integration is disabled in settings (acpx.enabled=false).",
            },
          ],
        };
      }

      const target = params.target || cfg.defaultTarget;
      const mode = params.mode || "exec";
      const timeoutSec = Number.isFinite(params.timeoutSec) ? params.timeoutSec : cfg.timeoutSec;
      const cwd = deps.getCwd?.() || process.cwd();

      const result = await runAcpxTask({
        target,
        mode,
        task: params.task,
        session: params.session,
        cwd,
        timeoutSec,
        commandPolicy: cfg.commandPolicy,
        pinnedVersion: cfg.pinnedVersion,
        approvalPolicy: cfg.approvalPolicy,
        signal,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text", text: formatFailure(result) }],
          details: {
            ok: false,
            source: result.source,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            aborted: result.aborted,
            notFound: result.notFound,
            stdout: result.stdout || "",
            stderr: result.stderr || "",
            error: result.errorMessage || null,
          },
        };
      }

      const text = result.stdout || "(ACPX completed with no text output)";
      return {
        content: [{ type: "text", text }],
        details: {
          ok: true,
          source: result.source,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          aborted: result.aborted,
          stdout: result.stdout || "",
          stderr: result.stderr || "",
        },
      };
    },
  };
}
