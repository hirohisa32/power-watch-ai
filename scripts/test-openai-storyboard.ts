import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { buildStoryboardPrompt } from "../lib/storyboard/prompt";
import {
  storyboardOutputSchema,
  totalStoryboardDuration,
  validateStoryboard,
} from "../lib/storyboard/schema";

if (!process.env.OPENAI_API_KEY)
  throw new Error("OPENAI_API_KEY is required for this manual paid integration test");
const model = process.env.OPENAI_MODEL ?? "gpt-6-sol";
const prompt = buildStoryboardPrompt({
  script:
    "1967年、精密なクロノグラフはサーキットで一秒を競う人々を支えた。機械式時計の文字盤とプッシャーには、速度と挑戦の記憶が刻まれている。やがてその時計は、計測機器を超えて挑戦する精神の象徴となった。",
  style: "cinematic_real",
  language: "ja",
  targetDuration: 60,
  assetLabels: ["Front", "45 degree", "Dial Macro"],
});
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60_000,
  maxRetries: 0,
});
const { data: response, request_id } = await client.responses
  .parse({
    model,
    store: false,
    input: [
      { role: "developer", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    text: { format: zodTextFormat(storyboardOutputSchema, "watch_storyboard") },
    max_output_tokens: 16_000,
  })
  .withResponse();
if (!response.output_parsed) throw new Error("OpenAI returned no parsed storyboard");
const validated = validateStoryboard(response.output_parsed, 60, [
  "Front",
  "45 degree",
  "Dial Macro",
]);
console.log({
  requestId: request_id,
  model: response.model,
  scenes: validated.scenes.length,
  duration: totalStoryboardDuration(validated),
  usage: response.usage,
});
