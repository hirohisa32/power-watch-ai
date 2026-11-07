"use client";

import { Check, CircleHelp, X } from "lucide-react";
import { useEffect, useState } from "react";

const STEPS = [
  ["台本・設定", "台本と動画の基本設定を確認"],
  ["画像を確認", "時計画像と画像ラベルを確認"],
  ["動画構成", "シーンごとの物語と映像内容を確認"],
  ["シーン生成", "未生成シーンを動画化"],
  ["最終動画", "音声・音楽・映像を結合"],
  ["完成", "完成動画を確認してダウンロード"],
] as const;

export function ProjectStepper({
  currentStep,
  processing = false,
}: {
  currentStep: number;
  processing?: boolean;
}) {
  const [showCoachMark, setShowCoachMark] = useState(false);

  useEffect(() => {
    const key = "watch-story-studio:workflow-guide-seen";
    if (window.localStorage.getItem(key) || currentStep >= 6) return;
    const timer = window.setTimeout(() => setShowCoachMark(true), 0);
    return () => window.clearTimeout(timer);
  }, [currentStep]);

  function dismissGuide() {
    window.localStorage.setItem("watch-story-studio:workflow-guide-seen", "1");
    setShowCoachMark(false);
  }

  return (
    <section className="project-workflow" aria-label="動画完成までのステップ">
      <div className="project-workflow-head">
        <div>
          <p className="eyebrow">動画完成までのステップ</p>
          <h2>
            {processing ? "処理を進めています" : `現在：${STEPS[currentStep - 1]?.[0] ?? "確認"}`}
          </h2>
        </div>
        <details className="workflow-help">
          <summary>
            <CircleHelp size={15} /> 使い方
          </summary>
          <ol>
            {STEPS.map(([title, description], index) => (
              <li key={title}>
                <strong>
                  {index + 1}. {title}
                </strong>
                <span>{description}</span>
              </li>
            ))}
          </ol>
        </details>
      </div>
      <ol className="workflow-steps">
        {STEPS.map(([title], index) => {
          const step = index + 1;
          const completed = step < currentStep;
          const current = step === currentStep;
          return (
            <li key={title} className={completed ? "completed" : current ? "current" : "upcoming"}>
              <span className="workflow-marker" aria-hidden="true">
                {completed ? <Check size={13} /> : current ? <i /> : step}
              </span>
              <span>
                <small>STEP {step}</small>
                <strong>{title}</strong>
                {current && <em>現在ここ</em>}
              </span>
            </li>
          );
        })}
      </ol>
      {showCoachMark && (
        <div className="workflow-coach" role="status">
          <div>
            <strong>次は「{STEPS[currentStep - 1]?.[0]}」です</strong>
            <span>{STEPS[currentStep - 1]?.[1]}</span>
          </div>
          <button type="button" aria-label="案内を閉じる" onClick={dismissGuide}>
            <X size={14} />
          </button>
        </div>
      )}
    </section>
  );
}
