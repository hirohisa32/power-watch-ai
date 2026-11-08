import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync("app/(studio)/projects/project-card-actions.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

describe("project card actions", () => {
  it("keeps one primary action and moves management actions into a Japanese menu", () => {
    expect(actions).toContain("project-card-primary");
    expect(actions).toContain('aria-label="その他の操作"');
    expect(actions).toContain("名前を変更");
    expect(actions).toContain("複製");
    expect(actions).toContain("削除");
    expect(actions).not.toContain(">Duplicate<");
    expect(actions).not.toContain(">Rename<");
    expect(actions).not.toContain(">Delete<");
    expect(actions).not.toContain(">More<");
  });

  it("names the project in the destructive confirmation", () => {
    expect(actions).toContain("`「${title}」を削除します。");
    expect(actions).toContain("本当に削除しますか？");
    expect(actions).toContain("project-card-menu-danger");
  });

  it("provides a mobile-safe menu target without hiding overflow", () => {
    expect(styles).toMatch(/\.project-card-more\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
    expect(styles).not.toMatch(/\.video-card\s*\{[^}]*overflow-x:\s*hidden/s);
  });
});
