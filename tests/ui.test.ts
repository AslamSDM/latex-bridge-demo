// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { act } from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const OLD_HTML =
  '<p data-chunk-id="74c123ae-7a80-44ec-a535-d216fcb42efd">We establish sharp spectral gap estimates, extending the classical Kesten bound <span data-latex="\\rho = \\frac{2\\sqrt{|S|-1}}{|S|}" data-type="inline-math">rho</span> to non-abelian settings.</p>';
const NEW_HTML =
  '<p data-chunk-id="74c123ae-7a80-44ec-a535-d216fcb42efd">We establish sharp spectral gap estimates, extending the classical Kesten bound <span data-latex="\\rho = \\frac{2\\sqrt{|S|-1}}{|S|}" data-type="inline-math">rho</span> to non-abelian settings, and we record the exact constant.</p>';

let posted: Record<string, unknown>[] = [];

function post(data: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { data }));
}

async function mountApp(): Promise<void> {
  posted = [];
  (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
    postMessage: (m: Record<string, unknown>) => posted.push(m),
    getState: () => undefined,
    setState: () => {},
  });
  vi.resetModules();
  await act(async () => {
    await import("../src/webview/app.tsx");
  });
}

describe("webview app", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  it("renders the shell and disables actions until a project is opened", async () => {
    await mountApp();
    expect(document.querySelector("h1")?.textContent).toBe("LaTeX Bridge");
    expect(document.querySelector(".badge.phase-ready")?.textContent).toContain("ready");
    expect(document.querySelector('button[disabled]')?.textContent).toContain("Upload to SuperDocs");
  });

  it("shows the picked project dir and enables upload", async () => {
    await mountApp();
    await act(async () => {
      post({ type: "projectOpened", path: "/tmp/math-paper" });
    });
    expect(document.querySelector("input")?.getAttribute("value")).toBe("/tmp/math-paper");
    const upload = Array.from(document.querySelectorAll(".project button")).find(
      (b) => b.textContent?.includes("Upload")
    ) as HTMLButtonElement;
    expect(upload.disabled).toBe(false);
  });

  it("renders sessionCreated with ingest warnings", async () => {
    await mountApp();
    await act(async () => {
      post({
        type: "sessionCreated",
        sessionId: "sess-123456789012345678901234",
        chunksCount: 48,
        warnings: [{ code: "TEX_PICTURE_PLACEHOLDER", message: "A vector drawing (TikZ/PSTricks) became a placeholder." }],
        changes: [],
      });
    });
    expect(document.querySelector(".badge")?.textContent).toContain("session");
    const badges = document.querySelectorAll(".badge");
    expect(Array.from(badges).some((b) => b.textContent?.includes("48 sections"))).toBe(true);
    const warning = document.querySelector(".warnings .warning");
    expect(warning?.textContent).toContain("TEX_PICTURE_PLACEHOLDER");
  });

  it("renders review cards with old/new diff when awaiting approval, math preserved", async () => {
    await mountApp();
    await act(async () => {
      post({
        type: "awaiting_approval",
        changes: [
          {
            change_id: "c1",
            operation: "edit",
            chunk_id: "74ef444a",
            old_html: OLD_HTML,
            new_html: NEW_HTML,
            ai_explanation: "Tighten the abstract and cite the bound.",
          },
        ],
      });
    });
    expect(document.querySelector(".badge.phase-awaiting")).toBeTruthy();
    const cards = document.querySelectorAll(".review .card");
    expect(cards.length).toBe(1);
    const card = cards[0];
    expect(card.querySelector(".explain")?.textContent).toContain("Tighten the abstract");
    expect(card.querySelector(".diff-old")?.textContent).toContain("Kesten bound");
    expect(card.querySelector(".diff-new")?.innerHTML).toContain('data-latex="\\rho');
    expect(card.querySelector(".diff-new")?.textContent).toContain("exact constant");
  });

  it("accept/deny toggles and submit posts the decision subset", async () => {
    await mountApp();
    await act(async () => {
      post({
        type: "awaiting_approval",
        changes: [
          { change_id: "c1", operation: "edit", chunk_id: "chunk-a", old_html: OLD_HTML, new_html: NEW_HTML },
          { change_id: "c2", operation: "insert", chunk_id: "chunk-b", old_html: "<p>old</p>", new_html: "<p>new</p>" },
        ],
      });
    });
    const cardButtons = document.querySelectorAll(".review .card .decide button");
    const submit = document.querySelector(".review .submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    (cardButtons[0] as HTMLButtonElement).click();
    (cardButtons[3] as HTMLButtonElement).click();
    await act(async () => {});
    expect(submit.disabled).toBe(false);
    submit.click();
    expect(posted.at(-1)).toEqual({
      type: "submitDecisions",
      decisions: [
        { changeId: "c1", approved: true },
        { changeId: "c2", approved: false },
      ],
    });
  });

  it("shows the AI response after editCompleted", async () => {
    await mountApp();
    await act(async () => {
      post({ type: "editCompleted", response: "Done — tightened the abstract.", changes: [] });
    });
    expect(document.querySelector(".result p")?.textContent).toContain("tightened the abstract");
  });

  it("shows export path and export warnings", async () => {
    await mountApp();
    await act(async () => {
      post({ type: "sessionCreated", sessionId: "s1", chunksCount: 1, warnings: [], changes: [] });
    });
    await act(async () => {
      post({
        type: "exportCompleted",
        path: "/tmp/paper.docx",
        warnings: [{ code: "EQ_MATH", message: "Some math was simplified." }],
      });
    });
    expect(document.querySelector(".ok")?.textContent).toContain("/tmp/paper.docx");
    const warnings = document.querySelectorAll(".warnings .warning");
    expect(warnings[warnings.length - 1]?.textContent).toContain("EQ_MATH");
  });

  it("shows error phase with the message", async () => {
    await mountApp();
    await act(async () => {
      post({ type: "error", message: "Instance at graph capacity" });
    });
    expect(document.querySelector(".badge.phase-error")).toBeTruthy();
    expect(document.querySelector(".warnings .warning")?.textContent).toContain("graph capacity");
  });
});
