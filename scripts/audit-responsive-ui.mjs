import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const baseUrl = process.env.UI_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const projectId = process.env.UI_AUDIT_PROJECT_ID ?? "781778f5-42aa-4a23-9f0f-6a8c0e95ad8a";
const outputDir = resolve("artifacts/ui-review");
const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = join(tmpdir(), `watch-story-ui-audit-${process.pid}`);
const port = 9333 + (process.pid % 300);

mkdirSync(outputDir, { recursive: true });
const env = parseEnv(readFileSync(resolve(".env.production.local"), "utf8"));
const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: baseUrl },
  body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
  redirect: "manual",
});
if (login.status !== 200) {
  const detail = await login.text();
  throw new Error(`UI audit login failed (${login.status}): ${detail.slice(0, 300)}`);
}
const cookieHeader = login.headers.get("set-cookie");
if (!cookieHeader) throw new Error("UI audit login cookie was not returned");
const [cookiePair] = cookieHeader.split(";");
const separator = cookiePair.indexOf("=");
const cookie = { name: cookiePair.slice(0, separator), value: cookiePair.slice(separator + 1) };

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
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
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send(
    "Network.setCookie",
    { ...cookie, url: baseUrl, path: "/", httpOnly: true, sameSite: "Lax" },
    sessionId,
  );

  const pages = {
    home: "/projects",
    wizard: "/projects/new",
    detail: `/projects/${projectId}`,
    storyboard: `/projects/${projectId}/storyboard`,
    videos: "/videos",
    admin: "/admin",
  };
  const widths = [1280, 1366, 1440, 1920, 768, 430, 390];
  const audit = [];

  for (const width of widths) {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: width <= 430 ? 844 : 980, deviceScaleFactor: 1, mobile: false },
      sessionId,
    );
    for (const [page, pathname] of Object.entries(pages)) {
      await cdp.send("Page.navigate", { url: `${baseUrl}${pathname}` }, sessionId);
      await wait(1400);
      const result = await cdp.send(
        "Runtime.evaluate",
        {
          expression: `(() => ({
            title: document.title,
            path: location.pathname,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            bodyScrollWidth: document.body.scrollWidth,
            hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
          }))()`,
          returnByValue: true,
        },
        sessionId,
      );
      audit.push({ width, page, ...result.result.value });

      if (["detail", "storyboard"].includes(page) && [1366, 1440, 1920, 390, 430].includes(width)) {
        const shot = await cdp.send(
          "Page.captureScreenshot",
          { format: "png", captureBeyondViewport: false },
          sessionId,
        );
        writeFileSync(join(outputDir, `storyboard-${width}.png`), Buffer.from(shot.data, "base64"));
      }
    }
  }

  writeFileSync(join(outputDir, "overflow-audit.json"), JSON.stringify(audit, null, 2));
  const failed = audit.filter((item) => item.hasHorizontalOverflow || item.path === "/login");
  console.log(JSON.stringify({ checked: audit.length, failed, outputDir }, null, 2));
  await cdp.close();
  if (failed.length) process.exitCode = 1;
} finally {
  chrome.kill();
  await wait(250);
  rmSync(profileDir, { recursive: true, force: true });
}

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const split = line.indexOf("=");
        let value = line.slice(split + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [line.slice(0, split), value];
      }),
  );
}

async function waitForJson(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
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
      const { resolve: resolvePromise, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolvePromise(message.result);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify(message));
    });
  }

  async close() {
    this.socket.close();
  }
}
