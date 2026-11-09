import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateStoryBodyDuration,
  effectiveSystemAssetDurationSeconds,
} from "@/lib/storyboard/duration";

const root = resolve(import.meta.dirname, "..");
const newProjectForm = readFileSync(
  resolve(root, "app/(studio)/projects/new/new-project-form.tsx"),
  "utf8",
);
const assetManager = readFileSync(
  resolve(root, "app/(studio)/projects/[id]/asset-metadata-manager.tsx"),
  "utf8",
);
const storyboardEditor = readFileSync(
  resolve(root, "app/(studio)/projects/[id]/storyboard/storyboard-editor.tsx"),
  "utf8",
);
const storyboardButton = readFileSync(
  resolve(root, "app/(studio)/projects/[id]/storyboard-button.tsx"),
  "utf8",
);
const storyboardRoute = readFileSync(
  resolve(root, "app/api/projects/[id]/storyboard/route.ts"),
  "utf8",
);
const globalCss = readFileSync(resolve(root, "app/globals.css"), "utf8");

describe("新規動画作成UX", () => {
  it("完成尺からOpeningとEndingを差し引いて本編尺を決める", () => {
    const opening = { durationMs: 15_100 };
    const ending = {
      durationMs: 8_000,
      recommendedStartMs: 1_000,
      recommendedEndMs: 7_000,
      recommendedDurationMs: 4_000,
    };
    expect(effectiveSystemAssetDurationSeconds(ending)).toBe(4);
    expect(calculateStoryBodyDuration(60, opening, ending)).toBe(41);
    expect(calculateStoryBodyDuration(90, opening, ending)).toBe(71);
  });

  it("60秒と90秒を用途説明付きで選べる", () => {
    expect(newProjectForm).toContain("SNS向け。テンポよく商品ストーリーを伝えます。");
    expect(newProjectForm).toContain("歴史や背景まで、より深く紹介します。");
    expect(newProjectForm).toContain("完成動画全体の長さ");
    expect(globalCss).toMatch(
      /\.duration-selector input\s*\{[^}]*width:\s*1px;[^}]*height:\s*1px;/s,
    );
  });

  it("保存中から画面移動まで現在地を表示する", () => {
    expect(newProjectForm).toContain("設定を保存しています");
    expect(newProjectForm).toContain("保存完了");
    expect(newProjectForm).toContain("画像確認画面へ移動しています");
    expect(newProjectForm).toContain("通常より時間がかかっています");
  });

  it("失敗時は保存済みであることと再試行導線を表示する", () => {
    expect(storyboardButton).toContain("動画構成の作成に失敗しました");
    expect(storyboardButton).toContain("入力内容は保存されています。");
    expect(storyboardButton).toContain("もう一度試す");
  });

  it("成功済みStoryboardは再生成せず既存結果を返す", () => {
    expect(storyboardRoute).toContain("const existing = await getActiveStoryboard(id)");
    expect(storyboardRoute).toContain("deduplicated: true");
  });

  it("確定画像は簡潔にし、生成進捗にはETAと工程を表示する", () => {
    expect(assetManager).toContain("AI判定の詳細を見る");
    expect(assetManager).toContain("asset.mismatch && !asset.humanLocked");
    expect(storyboardEditor).toContain("完了見込み");
    expect(storyboardEditor).toContain("PRODUCTION_STAGES");
    expect(storyboardEditor).toContain("完了見込みは過去の処理時間から算出した目安です");
  });
});
