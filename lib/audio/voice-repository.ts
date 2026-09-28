import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { voicePresets } from "@/lib/db/schema";

export const voicePresetInputSchema = z.object({
  key: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/),
  voiceId: z.string().trim().min(3).max(100),
  name: z.string().trim().min(1).max(100),
  gender: z.enum(["male", "female", "neutral"]).default("male"),
  roles: z.array(z.enum(["narration", "dialogue"])).min(1).max(2),
  tones: z.array(z.string().trim().min(1).max(40)).max(12),
  languages: z.array(z.enum(["ja", "en", "zh"])).min(1).max(3),
  approved: z.boolean().default(true),
  priority: z.number().int().min(-100).max(100).default(0),
});

export async function listVoicePresets() {
  return getDb().select().from(voicePresets).orderBy(asc(voicePresets.key));
}

export async function saveVoicePreset(value: unknown) {
  const input = voicePresetInputSchema.parse(value);
  const db = getDb();
  if (input.approved) {
    const approved = await db
      .select({ key: voicePresets.key })
      .from(voicePresets)
      .where(eq(voicePresets.approved, true));
    if (approved.length >= 5 && !approved.some((item) => item.key === input.key)) {
      const error = new Error("承認済みVoice Presetは初期版では最大5件です");
      error.name = "VoicePresetError";
      throw error;
    }
  }
  const [preset] = await db
    .insert(voicePresets)
    .values(input)
    .onConflictDoUpdate({
      target: voicePresets.key,
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  return preset;
}
