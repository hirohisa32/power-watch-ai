import { and, desc, eq, isNotNull } from "drizzle-orm";
import { HistoricalGenerator, PublishFinal } from "./client";
import { getDb } from "@/lib/db";
import { audioRecords, projects, scenes as sceneTable, videoGenerations } from "@/lib/db/schema";
import { GOLD_KHANJAR_TITLE } from "@/lib/demo/gold-khanjar";
import { createReadUrl, privateObjectExists } from "@/lib/storage";

const scenes = ["01-story-entry-oman", "02-qaboos-letter", "03-oman-uk", "04-asprey-london", "05-gift-preparation", "06-gift-reception", "07-character-reaction"] as const;
const prefix = "projects/gold-khanjar-client-final/story-v2";

export default async function ClientFinalPage() {
  const db = getDb();
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.title, GOLD_KHANJAR_TITLE)).limit(1);
  const narration = project ? (await db.select().from(audioRecords).where(and(eq(audioRecords.projectId, project.id), eq(audioRecords.provider, "elevenlabs"), eq(audioRecords.model, "eleven_v4"), eq(audioRecords.voiceId, "Bj4Malc5SZLoXfPtxRxH"), eq(audioRecords.status, "completed"), isNotNull(audioRecords.objectKey))).orderBy(desc(audioRecords.createdAt)).limit(1))[0] : undefined;
  const narrationUrl = narration?.objectKey ? await createReadUrl(narration.objectKey, 3600, "inline") : null;
  const existingScenes = project ? await db.select({ order: sceneTable.order, title: sceneTable.title, objectKey: videoGenerations.outputObjectKey, credits: videoGenerations.actualCostCredits }).from(sceneTable).leftJoin(videoGenerations, eq(sceneTable.selectedGenerationId, videoGenerations.id)).where(eq(sceneTable.projectId, project.id)) : [];
  const existingHistorical = await Promise.all(existingScenes.filter((item) => item.order >= 6 && item.order <= 10 && item.objectKey).map(async (item) => ({ ...item, url: await createReadUrl(item.objectKey!, 3600, "inline") })));
  const assets = await Promise.all(scenes.map(async (scene) => ({ scene, url: await privateObjectExists(`${prefix}/${scene}.mp4`) ? await createReadUrl(`${prefix}/${scene}.mp4`, 3600, "inline") : null })));
  return <main className="page-shell"><div className="page-heading"><div><p className="eyebrow">管理者専用</p><h1>Gold Khanjar Client Final</h1><p>承認済みNarrationを再生成せず、Historical 6 ShotだけをProduction Runwayで管理します。</p></div></div>
    <section className="panel"><h2>Client Final Production登録</h2><p>61.57秒 / 1080×1920 / H.264 / AAC Stereo</p><PublishFinal /></section>
    <section className="panel"><h2>承認済みNarration</h2>{narrationUrl ? <a className="btn" href={narrationUrl}>ElevenLabs v4 / Voice Aを取得</a> : <p>承認済みNarrationが見つかりません。</p>}</section>
    <section className="panel"><h2>Meaning-based Story Scene生成</h2><p>固定Anchorを参照する新規7 Sceneです。旧素材は再利用しません。</p><HistoricalGenerator /></section>
    <section className="panel"><h2>R2完成Asset</h2><div className="admin-table">{assets.map(({scene, url}) => <div key={scene}><span>{scene}</span><span>{url ? <a className="btn btn-secondary" href={url}>署名付きMP4</a> : "未回収"}</span></div>)}</div></section>
    <section className="panel"><h2>既存Production Historical Asset</h2><div className="admin-table">{existingHistorical.map((item) => <div key={item.order}><span>Scene {item.order} · {item.title}<small>{item.credits ?? 0} credits</small></span><a className="btn btn-secondary" href={item.url}>署名付きMP4</a></div>)}</div></section>
  </main>;
}
