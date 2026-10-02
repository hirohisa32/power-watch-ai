import { and, desc, eq, isNotNull } from "drizzle-orm";
import { HistoricalGenerator } from "./client";
import { getDb } from "@/lib/db";
import { audioRecords, projects } from "@/lib/db/schema";
import { GOLD_KHANJAR_TITLE } from "@/lib/demo/gold-khanjar";
import { createReadUrl, privateObjectExists } from "@/lib/storage";

const scenes = ["01-oman-establishing", "02-qaboos-era", "03-diplomacy", "04-london-jeweller", "05-gift-preparation", "06-gift-delivery"] as const;
const prefix = "projects/gold-khanjar-client-final/historical-v1";

export default async function ClientFinalPage() {
  const db = getDb();
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.title, GOLD_KHANJAR_TITLE)).limit(1);
  const narration = project ? (await db.select().from(audioRecords).where(and(eq(audioRecords.projectId, project.id), eq(audioRecords.provider, "elevenlabs"), eq(audioRecords.model, "eleven_v4"), eq(audioRecords.voiceId, "Bj4Malc5SZLoXfPtxRxH"), eq(audioRecords.status, "completed"), isNotNull(audioRecords.objectKey))).orderBy(desc(audioRecords.createdAt)).limit(1))[0] : undefined;
  const narrationUrl = narration?.objectKey ? await createReadUrl(narration.objectKey, 3600, "inline") : null;
  const assets = await Promise.all(scenes.map(async (scene) => ({ scene, url: await privateObjectExists(`${prefix}/${scene}.mp4`) ? await createReadUrl(`${prefix}/${scene}.mp4`, 3600, "inline") : null })));
  return <main className="page-shell"><div className="page-heading"><div><p className="eyebrow">管理者専用</p><h1>Gold Khanjar Client Final</h1><p>承認済みNarrationを再生成せず、Historical 6 ShotだけをProduction Runwayで管理します。</p></div></div>
    <section className="panel"><h2>承認済みNarration</h2>{narrationUrl ? <a className="btn" href={narrationUrl}>ElevenLabs v4 / Voice Aを取得</a> : <p>承認済みNarrationが見つかりません。</p>}</section>
    <section className="panel"><h2>Historical Scene生成</h2><HistoricalGenerator /></section>
    <section className="panel"><h2>R2完成Asset</h2><div className="admin-table">{assets.map(({scene, url}) => <div key={scene}><span>{scene}</span><span>{url ? <a className="btn btn-secondary" href={url}>署名付きMP4</a> : "未回収"}</span></div>)}</div></section>
  </main>;
}

