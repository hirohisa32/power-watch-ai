import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const subnav = readFileSync("app/(studio)/projects/[id]/project-subnav.tsx", "utf8");
const detail = readFileSync("app/(studio)/projects/[id]/page.tsx", "utf8");
const storyboard = readFileSync("app/(studio)/projects/[id]/storyboard/page.tsx", "utf8");
const storyboardEditor = readFileSync(
  "app/(studio)/projects/[id]/storyboard/storyboard-editor.tsx",
  "utf8",
);

describe("completed project navigation", () => {
  it("keeps overview, storyboard, settings, completed video and video list reachable", () => {
    expect(subnav).toContain('label: "概要"');
    expect(subnav).toContain('label: "動画構成"');
    expect(subnav).toContain('label: "設定"');
    expect(subnav).toContain('label: "完成動画"');
    expect(subnav).toContain("?section=settings#project-settings");
    expect(subnav).toContain("?section=completed#completed-video");
    expect(subnav).toContain('href="/videos"');
  });

  it("renders the same navigation on detail and storyboard direct URLs", () => {
    expect(detail).toContain("<ProjectSubnav");
    expect(detail).toContain('section === "settings" ? "settings" : "overview"');
    expect(storyboard).toContain("<ProjectSubnav");
    expect(storyboard).toContain('section === "completed" ? "completed" : "storyboard"');
  });

  it("keeps completion content gated by the unified completed phase", () => {
    expect(detail).toContain('workflow.phase === "COMPLETED" && completedRender');
    expect(detail).toContain("完成動画を見る");
    expect(storyboardEditor).toContain(
      "!hasCompletedRender && completedSceneCount < bodySceneIds.size",
    );
  });
});
