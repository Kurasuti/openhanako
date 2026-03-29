import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const SUPPORTED_TARGETS = new Set(["codex", "claude"]);
const SUPPORTED_MODES = new Set(["exec", "prompt"]);
const SUPPORTED_POLICIES = new Set(["local-only", "global-ok", "npx-fallback"]);
const SUPPORTED_APPROVAL_POLICIES = new Set(["inherit", "approve-all", "approve-reads", "deny-all"]);
const AGENT_NON_PROMPT_COMMANDS = new Set(["exec", "cancel", "set-mode", "set", "status", "sessions"]);

function quoteArg(arg) {
  if (!arg) return '""';
  if (/[\s"]/g.test(arg)) {
    return `"${String(arg).replace(/"/g, '\\"')}"`;
  }
  return String(arg);
}

function buildCommandPreview(command, args) {
  return `${command} ${args.map(quoteArg).join(" ")}`.trim();
}

function resolveLocalAcpxCli() {
  try {
    const pkgPath = require.resolve("acpx/package.json");
    const cliPath = path.join(path.dirname(pkgPath), "dist", "cli.js");
    return fs.existsSync(cliPath) ? cliPath : null;
  } catch {
    return null;
  }
}

function normalizePolicy(policy) {
  return SUPPORTED_POLICIES.has(policy) ? policy : "local-only";
}

function normalizeApprovalPolicy(policy) {
  const v = String(policy || "").trim();
  return SUPPORTED_APPROVAL_POLICIES.has(v) ? v : "approve-reads";
}

function normalizePinnedVersion(version) {
  const v = String(version || "").trim();
  return v || "0.3.1";
}

function normalizeTimeoutSec(timeoutSec) {
  const n = Number(timeoutSec);
  if (!Number.isFinite(n) || n <= 0) return 180;
  return Math.min(Math.max(n, 5), 3600);
}

export function resolveAcpxCandidates({ commandPolicy, pinnedVersion }) {
  const policy = normalizePolicy(commandPolicy);
  const pinned = normalizePinnedVersion(pinnedVersion);
  const candidates = [];

  const localCli = resolveLocalAcpxCli();
  if (localCli) {
    candidates.push({
      source: "local",
      command: process.execPath,
      prefixArgs: [localCli],
    });
  }

  if (policy === "global-ok" || policy === "npx-fallback") {
    candidates.push({
      source: "global",
      command: "acpx",
      prefixArgs: [],
    });
  }

  if (policy === "npx-fallback") {
    candidates.push({
      source: "npx",
      command: "npx",
      prefixArgs: ["-y", `acpx@${pinned}`, "--"],
    });
  }

  return candidates;
}

export function buildAcpxArgs({ target, mode, task, session, timeoutSec, cwd, approvalPolicy }) {
  const args = ["--format", "quiet"];
  if (cwd) args.push("--cwd", cwd);
  if (timeoutSec) args.push("--timeout", String(timeoutSec));
  approvalPolicy = normalizeApprovalPolicy(approvalPolicy);
  if (approvalPolicy === "approve-all") args.push("--approve-all");
  else if (approvalPolicy === "approve-reads") args.push("--approve-reads");
  else if (approvalPolicy === "deny-all") args.push("--deny-all");
  args.push(target);
  // Match official acpx grammar:
  //   acpx [global] <agent> [prompt|exec] [prompt options] [prompt...]
  // where top-level exec defaults to codex, so target must remain positional.
  if (mode === "exec") {
    args.push("exec");
  } else if (mode === "prompt") {
    // Prefer top-level agent session flag for broader CLI compatibility:
    //   acpx <agent> -s <name> prompt "<task>"
    if (session) args.push("-s", session);
    args.push("prompt");
  }
  args.push(task);
  return args;
}

export function buildAcpxEnsureArgs({ target, session, timeoutSec, cwd, approvalPolicy }) {
  const args = ["--format", "quiet"];
  if (cwd) args.push("--cwd", cwd);
  if (timeoutSec) args.push("--timeout", String(timeoutSec));
  approvalPolicy = normalizeApprovalPolicy(approvalPolicy);
  if (approvalPolicy === "approve-all") args.push("--approve-all");
  else if (approvalPolicy === "approve-reads") args.push("--approve-reads");
  else if (approvalPolicy === "deny-all") args.push("--deny-all");
  args.push(target, "sessions", "ensure");
  if (session) args.push("--name", session);
  return args;
}

function findSessionNameFromArgs(args, startIndex = 0) {
  for (let i = startIndex; i < args.length; i++) {
    if (args[i] === "-s" || args[i] === "--session") {
      const name = String(args[i + 1] || "").trim();
      if (name) return name;
    }
  }
  return "";
}

function inferPromptEnsureFromRawArgs(args) {
  if (!Array.isArray(args) || !args.length) return null;
  const target = String(args[0] || "").trim();
  if (!SUPPORTED_TARGETS.has(target)) return null;

  const second = String(args[1] || "").trim();
  if (!second) return null;

  if (second === "prompt") {
    return {
      target,
      session: findSessionNameFromArgs(args, 2),
    };
  }

  if (AGENT_NON_PROMPT_COMMANDS.has(second)) return null;

  // acpx <agent> "<prompt...>" or acpx <agent> --session <name> "<prompt...>"
  return {
    target,
    session: findSessionNameFromArgs(args, 1),
  };
}

function normalizeRawArgs(args) {
  if (!Array.isArray(args)) return [];
  return args
    .map((arg) => String(arg ?? "").trim())
    .filter(Boolean);
}

function hasApprovalFlag(args) {
  return args.includes("--approve-all")
    || args.includes("--approve-reads")
    || args.includes("--deny-all");
}

function terminateProcess(child) {
  try {
    child.kill("SIGTERM");
  } catch {}
  const hardKillTimer = setTimeout(() => {
    try {
      if (!child.killed) child.kill("SIGKILL");
    } catch {}
  }, 1500);
  hardKillTimer.unref();
}

async function executeCandidate(candidate, acpxArgs, { cwd, env, timeoutMs, signal, onEvent }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const args = [...candidate.prefixArgs, ...acpxArgs];
    const preview = buildCommandPreview(candidate.command, args);
    const emit = typeof onEvent === "function" ? onEvent : null;
    emit?.({
      type: "start",
      source: candidate.source,
      command: preview,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let finished = false;

    const child = spawn(candidate.command, args, {
      cwd: cwd || process.cwd(),
      env: env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    };

    const finish = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve({
        source: candidate.source,
        command: preview,
        durationMs: Date.now() - startedAt,
        ...result,
      });
    };

    const onAbort = () => {
      aborted = true;
      terminateProcess(child);
    };

    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminateProcess(child);
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      emit?.({ type: "stdout", source: candidate.source, text: String(chunk) });
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      emit?.({ type: "stderr", source: candidate.source, text: String(chunk) });
    });

    child.on("error", (err) => {
      if (err?.code === "ENOENT") {
        emit?.({
          type: "error",
          source: candidate.source,
          message: `Command not found: ${candidate.command}`,
        });
        finish({
          ok: false,
          notFound: true,
          exitCode: null,
          signal: null,
          stdout: "",
          stderr: "",
          timedOut: false,
          aborted: false,
          errorMessage: `Command not found: ${candidate.command}`,
        });
        return;
      }

      emit?.({
        type: "error",
        source: candidate.source,
        message: err?.message || "Failed to start ACPX process",
      });

      finish({
        ok: false,
        notFound: false,
        exitCode: null,
        signal: null,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
        aborted,
        errorMessage: err?.message || "Failed to start ACPX process",
      });
    });

    child.on("close", (code, closeSignal) => {
      emit?.({
        type: "exit",
        source: candidate.source,
        exitCode: code,
        signal: closeSignal,
        timedOut,
        aborted,
      });
      finish({
        ok: code === 0 && !timedOut && !aborted,
        notFound: false,
        exitCode: code,
        signal: closeSignal,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
        aborted,
        errorMessage: null,
      });
    });
  });
}

export async function runAcpxTask(options) {
  const target = String(options?.target || "").trim();
  const mode = String(options?.mode || "exec").trim();
  const task = String(options?.task || "").trim();
  const session = String(options?.session || "").trim();

  if (!SUPPORTED_TARGETS.has(target)) {
    throw new Error(`Unsupported ACPX target: ${target || "(empty)"}`);
  }
  if (!SUPPORTED_MODES.has(mode)) {
    throw new Error(`Unsupported ACPX mode: ${mode}`);
  }
  if (!task) {
    throw new Error("ACPX task cannot be empty");
  }

  const timeoutSec = normalizeTimeoutSec(options?.timeoutSec);
  const timeoutMs = timeoutSec * 1000;
  const cwd = options?.cwd || process.cwd();
  const policy = normalizePolicy(options?.commandPolicy);
  const pinnedVersion = normalizePinnedVersion(options?.pinnedVersion);
  const approvalPolicy = normalizeApprovalPolicy(options?.approvalPolicy);

  const acpxArgs = buildAcpxArgs({
    target,
    mode,
    task,
    session: session || undefined,
    timeoutSec,
    cwd,
    approvalPolicy,
  });

  const candidates = resolveAcpxCandidates({
    commandPolicy: policy,
    pinnedVersion,
  });

  if (!candidates.length) {
    return {
      ok: false,
      notFound: true,
      source: "none",
      command: "",
      attemptedSources: [],
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      aborted: false,
      durationMs: 0,
      errorMessage: "No ACPX command candidate found. Install local acpx or change command policy.",
    };
  }

  const attemptedSources = [];
  for (const candidate of candidates) {
    if (mode === "prompt") {
      options?.onEvent?.({
        type: "phase",
        message: "Ensuring ACPX prompt session...",
      });
      const ensureResult = await executeCandidate(
        candidate,
        buildAcpxEnsureArgs({
          target,
          session: session || undefined,
          timeoutSec,
          cwd,
          approvalPolicy,
        }),
        {
          cwd,
          env: options?.env || process.env,
          timeoutMs,
          signal: options?.signal,
          onEvent: options?.onEvent,
        },
      );
      if (ensureResult.notFound) {
        attemptedSources.push(candidate.source);
        continue;
      }
      if (!ensureResult.ok) {
        attemptedSources.push(candidate.source);
        return {
          ...ensureResult,
          attemptedSources,
          errorMessage: ensureResult.errorMessage || "Failed to ensure ACPX prompt session",
        };
      }
    }

    const result = await executeCandidate(candidate, acpxArgs, {
      cwd,
      env: options?.env || process.env,
      timeoutMs,
      signal: options?.signal,
      onEvent: options?.onEvent,
    });
    attemptedSources.push(candidate.source);
    if (result.notFound) continue;
    return { ...result, attemptedSources };
  }

  return {
    ok: false,
    notFound: true,
    source: "none",
    command: "",
    attemptedSources,
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    timedOut: false,
    aborted: false,
    durationMs: 0,
    errorMessage: `ACPX command not found (checked: ${attemptedSources.join(", ") || "none"})`,
  };
}

export async function runAcpxArgs(options) {
  const args = normalizeRawArgs(options?.args);
  if (!args.length) {
    throw new Error("ACPX args cannot be empty");
  }

  const timeoutSec = normalizeTimeoutSec(options?.timeoutSec);
  const timeoutMs = timeoutSec * 1000;
  const cwd = options?.cwd || process.cwd();
  const policy = normalizePolicy(options?.commandPolicy);
  const pinnedVersion = normalizePinnedVersion(options?.pinnedVersion);
  const approvalPolicy = normalizeApprovalPolicy(options?.approvalPolicy);
  const preparedArgs = hasApprovalFlag(args)
    ? args
    : (() => {
        const prefix = [];
        if (approvalPolicy === "approve-all") prefix.push("--approve-all");
        else if (approvalPolicy === "approve-reads") prefix.push("--approve-reads");
        else if (approvalPolicy === "deny-all") prefix.push("--deny-all");
        return [...prefix, ...args];
      })();

  const candidates = resolveAcpxCandidates({
    commandPolicy: policy,
    pinnedVersion,
  });

  if (!candidates.length) {
    return {
      ok: false,
      notFound: true,
      source: "none",
      command: "",
      attemptedSources: [],
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      aborted: false,
      durationMs: 0,
      errorMessage: "No ACPX command candidate found. Install local acpx or change command policy.",
    };
  }

  const attemptedSources = [];
  for (const candidate of candidates) {
    const promptEnsure = inferPromptEnsureFromRawArgs(args);
    if (promptEnsure) {
      options?.onEvent?.({
        type: "phase",
        message: "Ensuring ACPX prompt session...",
      });
      const ensureResult = await executeCandidate(
        candidate,
        buildAcpxEnsureArgs({
          target: promptEnsure.target,
          session: promptEnsure.session || undefined,
          timeoutSec,
          cwd,
          approvalPolicy,
        }),
        {
          cwd,
          env: options?.env || process.env,
          timeoutMs,
          signal: options?.signal,
          onEvent: options?.onEvent,
        },
      );
      if (ensureResult.notFound) {
        attemptedSources.push(candidate.source);
        continue;
      }
      if (!ensureResult.ok) {
        attemptedSources.push(candidate.source);
        return {
          ...ensureResult,
          attemptedSources,
          errorMessage: ensureResult.errorMessage || "Failed to ensure ACPX prompt session",
        };
      }
    }

    const result = await executeCandidate(candidate, preparedArgs, {
      cwd,
      env: options?.env || process.env,
      timeoutMs,
      signal: options?.signal,
      onEvent: options?.onEvent,
    });
    attemptedSources.push(candidate.source);
    if (result.notFound) continue;
    return { ...result, attemptedSources };
  }

  return {
    ok: false,
    notFound: true,
    source: "none",
    command: "",
    attemptedSources,
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    timedOut: false,
    aborted: false,
    durationMs: 0,
    errorMessage: `ACPX command not found (checked: ${attemptedSources.join(", ") || "none"})`,
  };
}
