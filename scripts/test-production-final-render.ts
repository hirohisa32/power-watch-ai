const projectId = process.argv[2];
const baseUrl = (process.env.PRODUCTION_APP_URL || "https://power-watch-ai.vercel.app").replace(
  /\/$/,
  "",
);

async function main() {
  if (!projectId) throw new Error("Project IDを指定してください");
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
    throw new Error("ADMIN_EMAIL / ADMIN_PASSWORD が必要です");

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  });
  if (!login.ok) throw new Error(`Production Login failed: ${login.status}`);
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Production session cookie was not returned");
  const headers = { cookie, origin: baseUrl };
  const before = await audit(headers);
  console.log(
    JSON.stringify({ step: "login", ok: true, existingRenders: before.renders.length }),
  );

  const started = await fetch(`${baseUrl}/api/projects/${projectId}/renders`, {
    method: "POST",
    headers,
  });
  const startedBody = (await started.json()) as { renderId?: string; error?: string };
  if (started.status !== 202 || !startedBody.renderId)
    throw new Error(`Final Render start failed: ${started.status} ${startedBody.error || ""}`);
  const renderId = startedBody.renderId;
  console.log(JSON.stringify({ step: "render_started", renderId }));

  let finalAudit = before;
  for (let attempt = 0; attempt < 75; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    finalAudit = await audit(headers);
    const render = finalAudit.renders.find((item) => item.id === renderId);
    console.log(JSON.stringify({ step: "render_poll", status: render?.status ?? "missing" }));
    if (render?.status === "failed")
      throw new Error(`Final Render failed: ${render.errorCode || "UNKNOWN"}`);
    if (render?.status === "completed") break;
  }

  const render = finalAudit.renders.find((item) => item.id === renderId);
  if (render?.status !== "completed") throw new Error("Final Render timed out");
  const preview = await fetch(`${baseUrl}/api/renders/${renderId}/video`, { headers: { cookie } });
  const previewBytes = new Uint8Array(await preview.arrayBuffer());
  if (!preview.ok || !previewBytes.length)
    throw new Error(`Preview failed: ${preview.status}`);
  const download = await fetch(`${baseUrl}/api/renders/${renderId}/download`, {
    headers: { cookie },
  });
  const downloadBytes = new Uint8Array(await download.arrayBuffer());
  if (!download.ok || !downloadBytes.length)
    throw new Error(`Download failed: ${download.status}`);

  const newUsageCount = Math.max(0, finalAudit.usage.length - before.usage.length);
  console.log(
    JSON.stringify({
      step: "completed",
      renderId,
      narratorVoiceId: finalAudit.project.narratorVoiceId,
      narratorSelectionReason: finalAudit.project.narratorSelectionReason,
      dialogueVoices: finalAudit.voiceAssignments
        .filter((item) => item.role === "dialogue")
        .map((item) => ({ speakerKey: item.speakerKey, voiceId: item.voiceId })),
      voiceAssignments: finalAudit.voiceAssignments.length,
      audio: finalAudit.audio[0],
      render,
      preview: {
        status: preview.status,
        contentType: preview.headers.get("content-type"),
        bytes: previewBytes.length,
      },
      download: {
        status: download.status,
        contentType: download.headers.get("content-type"),
        bytes: downloadBytes.length,
      },
      newUsageCount,
      newUsage: finalAudit.usage.slice(0, newUsageCount),
    }),
  );
}

async function audit(headers: Record<string, string>): Promise<Audit> {
  const response = await fetch(`${baseUrl}/api/projects/${projectId}/audit`, { headers });
  if (!response.ok) throw new Error(`Audit failed: ${response.status}`);
  return (await response.json()) as Audit;
}

type Audit = {
  project: {
    narratorVoiceId?: string | null;
    narratorSelectionReason?: string | null;
  };
  voiceAssignments: Array<{
    role: "narration" | "dialogue";
    speakerKey: string;
    voiceId: string;
  }>;
  audio: Array<Record<string, unknown>>;
  renders: Array<{
    id: string;
    status: "queued" | "rendering" | "completed" | "failed";
    errorCode?: string | null;
    [key: string]: unknown;
  }>;
  usage: Array<Record<string, unknown>>;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Production Final Render E2E failed");
  process.exitCode = 1;
});
