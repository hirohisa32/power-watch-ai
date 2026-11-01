import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");
const studioLayout = readFileSync(resolve(root, "app/(studio)/layout.tsx"), "utf8");
const storyboardEditor = readFileSync(
  resolve(root, "app/(studio)/projects/[id]/storyboard/storyboard-editor.tsx"),
  "utf8",
);

describe("WATCH STORY STUDIO responsive layout", () => {
  it("uses the neutral tool brand independently from video brands", () => {
    expect(studioLayout).toContain("WATCH STORY");
    expect(studioLayout).toContain("STUDIO");
    expect(studioLayout).not.toContain("POWER</span> WATCH");
  });

  it("uses a bounded shared container with responsive gutters", () => {
    expect(css).toContain("--container: 1480px");
    expect(css).toContain("--page-gutter: clamp(");
    expect(css).toContain("width: min(var(--container)");
    expect(css).toContain("minmax(0, 1fr)");
  });

  it("supports all required narrow breakpoints without hiding body overflow", () => {
    expect(css).toContain("@media (max-width: 1280px)");
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("@media (max-width: 620px)");
    expect(css).toContain("@media (max-width: 410px)");
    expect(css).not.toMatch(/body\s*\{[^}]*overflow-x:\s*hidden/s);
  });

  it("moves detailed scene actions into an accessible drawer", () => {
    expect(storyboardEditor).toContain('role="dialog"');
    expect(storyboardEditor).toContain('aria-modal="true"');
    expect(storyboardEditor).toContain("scene-drawer");
    expect(storyboardEditor).toContain("Quick actions");
    expect(css).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("keeps generation progress visible and persisted from server state", () => {
    expect(storyboardEditor).toContain("generation-progress-track");
    expect(storyboardEditor).toContain("PIPELINE_STAGE_LABELS");
    expect(storyboardEditor).toContain("router.refresh()");
  });
});
