import { describe, expect, it } from "vitest";
import { buildAcpxArgs, buildAcpxEnsureArgs } from "../lib/acpx/acpx-runner.js";

describe("acpx-runner buildAcpxArgs", () => {
  it("builds agent-scoped exec command with target preserved", () => {
    const args = buildAcpxArgs({
      target: "claude",
      mode: "exec",
      task: "say hello",
      cwd: "G:/repo",
      timeoutSec: 30,
    });

    expect(args).toEqual([
      "--format",
      "quiet",
      "--cwd",
      "G:/repo",
      "--timeout",
      "30",
      "--approve-reads",
      "claude",
      "exec",
      "say hello",
    ]);
  });

  it("builds prompt command and includes session only in prompt mode", () => {
    const args = buildAcpxArgs({
      target: "codex",
      mode: "prompt",
      task: "review this patch",
      session: "backend",
      cwd: "G:/repo",
      timeoutSec: 45,
    });

    expect(args).toEqual([
      "--format",
      "quiet",
      "--cwd",
      "G:/repo",
      "--timeout",
      "45",
      "--approve-reads",
      "codex",
      "-s",
      "backend",
      "prompt",
      "review this patch",
    ]);
  });

  it("ignores session in exec mode to avoid invalid option forwarding", () => {
    const args = buildAcpxArgs({
      target: "codex",
      mode: "exec",
      task: "summarize project",
      session: "backend",
      cwd: "G:/repo",
      timeoutSec: 20,
    });

    expect(args).toEqual([
      "--format",
      "quiet",
      "--cwd",
      "G:/repo",
      "--timeout",
      "20",
      "--approve-reads",
      "codex",
      "exec",
      "summarize project",
    ]);
  });

  it("builds prompt-session ensure command for target/cwd", () => {
    const args = buildAcpxEnsureArgs({
      target: "claude",
      session: "test-hanako",
      cwd: "G:/repo",
      timeoutSec: 30,
    });

    expect(args).toEqual([
      "--format",
      "quiet",
      "--cwd",
      "G:/repo",
      "--timeout",
      "30",
      "--approve-reads",
      "claude",
      "sessions",
      "ensure",
      "--name",
      "test-hanako",
    ]);
  });

  it("supports explicit approval policy flags", () => {
    const args = buildAcpxArgs({
      target: "claude",
      mode: "exec",
      task: "say hello",
      cwd: "G:/repo",
      timeoutSec: 30,
      approvalPolicy: "approve-all",
    });

    expect(args).toEqual([
      "--format",
      "quiet",
      "--cwd",
      "G:/repo",
      "--timeout",
      "30",
      "--approve-all",
      "claude",
      "exec",
      "say hello",
    ]);
  });
});
