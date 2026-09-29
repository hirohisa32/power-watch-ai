import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .email("メールアドレスを確認してください")
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(8, "パスワードを確認してください").max(128),
});

export const projectInputSchema = z.object({
  title: z.string().trim().min(1, "プロジェクト名を入力してください").max(120),
  script: z.string().trim().min(20, "台本は20文字以上で入力してください").max(30000),
  style: z.enum(["cinematic_real", "animation"]),
  language: z.enum(["ja", "en", "zh"]),
  targetDuration: z.union([z.literal(60), z.literal(90)]),
  narratorVoiceId: z.string().trim().min(3).max(100).optional(),
});

export const assetLabelSchema = z.string().trim().min(1).max(50);

export const watchImageSchema = z.object({
  type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z
    .number()
    .positive()
    .max(15 * 1024 * 1024),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
