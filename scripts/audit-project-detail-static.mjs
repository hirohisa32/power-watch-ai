import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const outputDir = resolve("artifacts/ui-review/detail-ux");
const fixtureDir = join(outputDir, "fixtures");
const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = join(tmpdir(), `watch-story-static-audit-${process.pid}`);
const port = 9633 + (process.pid % 200);
const css = readFileSync(resolve("app/globals.css"), "utf8").replaceAll("@import", "/* @import");
const widths = [1280, 1366, 1440, 1920, 768, 430, 390];

mkdirSync(fixtureDir, { recursive: true });

const pages = {
  home: `<main class="content"><div class="page-head"><div><p class="eyebrow">WATCH STORY STUDIO</p><h1>動画制作を始めましょう</h1></div><button class="btn btn-primary">新しい動画を作る</button></div><div class="video-grid">${card("ジャガー・ルクルト クールド・パリ ギョーシエ仕上げ")}${card("Gold Khanjar Story")}</div></main>`,
  wizard: `<main class="content"><div class="page-head"><div><p class="eyebrow">新しい動画</p><h1>時計の物語を作る</h1></div></div><ol class="wizard-steps"><li>1 台本・設定</li><li>2 時計画像</li><li>3 内容確認</li></ol><section class="wizard-panel"><h2>台本と動画設定</h2><div class="field-grid"><label class="field field-full">動画タイトル<input value="ジャガー・ルクルト クールド・パリ ギョーシエ仕上げ"></label><label class="field field-full">台本<textarea>時計に刻まれた物語を入力します。</textarea></label></div><button class="btn btn-primary">次へ進む</button></section></main>`,
  detail: `<main class="content"><div class="page-head project-page-head"><div><p class="eyebrow">動画の詳細</p><h1>ジャガー・ルクルト “クールド・パリ ギョーシエ仕上げ” 伝説キャリバー478 18金無垢ピンクゴールド オール アラビック数字</h1></div><div class="action-stack project-primary-action"><button class="btn btn-primary">未生成シーンを作る</button><small>画像をもとに各シーンを動画化します。完成まで数分かかる場合があります。</small></div></div>${stepper(4)}<div class="production-progress"><div><strong>映像生成中</strong><span>65%</span></div><div class="progress-track"><span style="width:65%"></span></div><p>未生成シーンを作成してください。</p></div><div class="detail-grid"><section class="panel"><h2>台本</h2><p>伝説のキャリバーが生まれた背景をたどります。</p></section><aside><section class="panel"><h2>動画設定</h2><div class="key-value"><span>動画スタイル</span><span>アニメ調</span></div></section></aside></div></main>`,
  storyboard: `<main class="content storyboard-page"><div class="page-head project-page-head"><div><p class="eyebrow">動画構成 · バージョン 20</p><h1>ジャガー・ルクルト “クールド・パリ ギョーシエ仕上げ” 伝説キャリバー478 18金無垢ピンクゴールド オール アラビック数字</h1><p class="lead">シーンごとの映像、ナレーション、字幕を確認できます。</p></div></div>${stepper(4)}<div class="storyboard-toolbar" id="generate-scenes"><div><span class="duration-meter valid">60秒</span><span class="hint">4 / 8 本編シーン完成</span></div><div class="nav-actions"><button class="btn">シーンを追加</button><button class="btn">動画構成を作り直す</button><button class="btn btn-primary"><span class="button-spinner"></span>生成を開始しています…</button><small class="primary-action-help">画像をもとに各シーンを動画化します。</small></div></div><section class="generation-progress"><div><span class="generation-progress-pulse"></span><div><strong>映像を生成しています</strong><p>画像を準備しています</p></div></div><dl><div><dt>現在</dt><dd>画像を作成中</dd></div><div><dt>シーン</dt><dd>2 / 8 · 工房の記録</dd></div><div><dt>経過時間</dt><dd>00:14</dd></div></dl><div class="generation-progress-track"><span style="width:48%"></span></div></section><div class="scene-list">${sceneCard()}</div></main>`,
  drawer: `<main class="content storyboard-page">${sceneCard()}<div class="scene-drawer-backdrop"><aside class="scene-drawer"><header class="scene-drawer-head"><div><p class="eyebrow">シーン編集</p><h2>シーン 3 を編集</h2></div><button class="icon-button">×</button></header><div class="scene-drawer-body"><section class="scene-form"><div class="field-grid"><label class="field">シーンの長さ<input value="5"></label><label class="field field-full">シーンタイトル<input value="工房の記録"></label><label class="field field-full">ナレーション<textarea>職人の手が歴史をつなぎます。</textarea></label><label class="field field-full">映像イメージ<textarea>古い工房で時計師が静かに作業する。</textarea></label></div><div class="card-actions"><button class="btn btn-primary">保存</button><button class="btn">キャンセル</button></div></section></div></aside></div></main>`,
  videos: `<main class="content"><div class="page-head"><div><p class="eyebrow">完成動画</p><h1>動画一覧</h1></div></div><div class="video-grid">${card("Jaeger-LeCoultre Version 20")}${card("Gold Khanjar")}</div></main>`,
  admin: `<main class="content"><div class="page-head"><div><p class="eyebrow">管理</p><h1>管理者画面</h1></div></div><div class="admin-summary"><div><span>今月の請求予定額</span><strong>¥12,840</strong></div><div><span>完成動画数</span><strong>3本</strong></div></div><section class="panel"><h2>動画別の確定原価</h2><div class="billing-table"><table><thead><tr><th>動画</th><th>状態</th><th>USD実費</th><th>確定円額</th></tr></thead><tbody><tr><td>Jaeger-LeCoultre</td><td>完成</td><td>$4.20</td><td>¥648</td></tr></tbody></table></div></section></main>`,
};

for (const [name, content] of Object.entries(pages)) {
  writeFileSync(join(fixtureDir, `${name}.html`), document(content), "utf8");
}

class Cdp {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolvePromise, reject) => {
      socket.addEventListener("open", resolvePromise, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new Cdp(socket);
  }
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async close() {
    this.socket.close();
  }
}

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

try {
  const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const cdp = await Cdp.connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  const results = [];
  for (const width of widths) {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: width <= 430 ? 844 : 980, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    for (const name of Object.keys(pages)) {
      await cdp.send(
        "Page.navigate",
        { url: pathToFileURL(join(fixtureDir, `${name}.html`)).href },
        sessionId,
      );
      await wait(160);
      const evaluation = await cdp.send(
        "Runtime.evaluate",
        {
          expression: `(() => { const title = document.querySelector('h1'); const drawer = document.querySelector('.scene-drawer'); const primary = [...document.querySelectorAll('.btn-primary')].filter((el) => getComputedStyle(el).display !== 'none'); const rect = drawer?.getBoundingClientRect(); return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, titleLines: title ? Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight)) : 0, stepper: Boolean(document.querySelector('.workflow-steps .current')), primaryCtas: primary.length, loading: Boolean(document.querySelector('.button-spinner, .generation-progress')), promptExposed: /Generation ID|Scene ID|detectedRole|Human Lock|Confidence|visualPrompt/i.test(document.body.innerText), drawerInsideViewport: rect ? rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1 : true }; })()`,
          returnByValue: true,
        },
        sessionId,
      );
      results.push({ width, page: name, ...evaluation.result.value });
      if (["detail", "storyboard", "drawer"].includes(name) && [1440, 430, 390].includes(width)) {
        const shot = await cdp.send(
          "Page.captureScreenshot",
          { format: "png", captureBeyondViewport: false },
          sessionId,
        );
        writeFileSync(join(outputDir, `${name}-${width}.png`), Buffer.from(shot.data, "base64"));
      }
    }
  }
  writeFileSync(join(outputDir, "static-layout-audit.json"), JSON.stringify(results, null, 2));
  const failed = results.filter(
    (item) =>
      item.overflow ||
      item.promptExposed ||
      !item.drawerInsideViewport ||
      (item.page === "detail" && item.titleLines > 3),
  );
  console.log(JSON.stringify({ checked: results.length, failed, outputDir }, null, 2));
  await cdp.close();
  if (failed.length) process.exitCode = 1;
} finally {
  chrome.kill();
  await wait(800);
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

function document(content) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div class="shell"><header class="topbar"><span class="brand">WATCH STORY STUDIO</span><nav class="main-nav"><a>ホーム</a><a>新しい動画</a><a>動画一覧</a></nav><span class="user-menu">管理</span></header>${content}</div></body></html>`;
}
function card(title) {
  return `<article class="video-card"><p class="eyebrow">アニメーション</p><h2 class="project-title">${title}</h2><p class="hint">60秒 · 完成</p><button class="btn">詳細を見る</button></article>`;
}
function sceneCard() {
  return `<article class="scene-card"><div class="scene-number"><span>シーン</span>03</div><div class="scene-main"><div class="scene-heading"><div><span class="pill">シーン 3</span><h2>伝説のキャリバーを生んだ工房</h2></div><span class="scene-duration">5s</span></div><div class="scene-copy"><div><span>ナレーション</span><p>職人の手が歴史をつなぎます。</p></div><div><span>字幕</span><p>伝説のキャリバー</p></div><div><span>映像イメージ</span><p>古い工房で時計師が静かに作業する。</p></div></div><div class="generation-panel"><div class="generation-head"><span>生成動画</span><span class="generation-status completed">完了</span></div><div class="card-actions"><button class="btn btn-secondary">修正・再生成</button></div></div></div></article>`;
}
function stepper(current) {
  const labels = ["台本・設定", "画像を確認", "動画構成", "シーン生成", "最終動画", "完成"];
  return `<section class="project-workflow"><div class="project-workflow-head"><div><p class="eyebrow">動画完成までのステップ</p><h2>現在：${labels[current - 1]}</h2></div><span>使い方</span></div><ol class="workflow-steps">${labels.map((label, i) => `<li class="${i + 1 < current ? "completed" : i + 1 === current ? "current" : "upcoming"}"><span class="workflow-marker">${i + 1 < current ? "✓" : i + 1}</span><span><small>STEP ${i + 1}</small><strong>${label}</strong>${i + 1 === current ? "<em>現在ここ</em>" : ""}</span></li>`).join("")}</ol></section>`;
}
async function waitForJson(url) {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await wait(100);
  }
  throw new Error("Chrome DevTools did not become ready");
}
function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
