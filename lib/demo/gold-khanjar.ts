export const GOLD_KHANJAR_TITLE = "ROLEX GOLD KHANJAR Ref.1665/0 — Client Demo";

export const GOLD_KHANJAR_NARRATION = `1970年代、オマーンは新しい時代を迎えていました。

カーブース国王は、国に尽くした功労者へ、特別な時計を贈ります。

その製作を託されたのは、
英国王室とも縁の深い名門ジュエラー、アスプレイ。

選ばれたのはロレックス。

文字盤には、オマーンの威信を象徴する金色のカンジャル。

これは、ただの装飾ではありません。

ASPREYの刻印。
500万番台のシリアル。
そして、1665/0。

国家と英国、時計製造の歴史が、
この一本に刻まれています。

GOLD KHANJAR。

時を超え、物語を宿す一本です。`;

export const GOLD_KHANJAR_ASSETS: Record<string, string> = {
  "1.jpg": "Front Hero",
  "MG_1220.jpg": "Dial Gold Khanjar",
  "MG_1204.jpg": "Caseback ASPREY",
  "MG_1202.jpg": "Inside Caseback Serial 1665",
  "MG_1200.jpg": "Movement",
  "MG_1216.jpg": "Crown Profile",
  "MG_1212.jpg": "Bracelet Clasp",
};

export const GOLD_KHANJAR_IDENTITY = {
  serial: "5082955",
  reference: "1665/0",
  outerCasebackMark: "ASPREY",
  identitySource: "client-demo/gold-khanjar/assets/MG_1202.jpg",
  serialEditingAllowed: false,
} as const;

export const GOLD_KHANJAR_APPROVED_NARRATION_DURATION_SECONDS = 43.47;
export const GOLD_KHANJAR_NARRATION_START_SECONDS = 15.2;

export const GOLD_KHANJAR_TIMELINE = [
  { order: 1, start: 0, end: 15.1, duration: 15.1, kind: "FixedOpening", title: "POWER WATCH Fixed Opening", narration: false },
  { order: 6, start: 15.1, end: 17.4, duration: 2.3, kind: "StoryEntry", title: "Black → 古紙 → Ink → Map", narration: true },
  { order: 7, start: 17.4, end: 20.6, duration: 3.2, kind: "Historical", title: "1970s / OMAN", narration: true },
  { order: 8, start: 20.6, end: 23.8, duration: 3.2, kind: "Historical", title: "書簡 → カーブース時代", narration: true },
  { order: 9, start: 23.8, end: 27, duration: 3.2, kind: "Historical", title: "OMAN × UNITED KINGDOM", narration: true },
  { order: 10, start: 27, end: 30.2, duration: 3.2, kind: "Historical", title: "ASPREY / LONDON", narration: true },
  { order: 11, start: 30.2, end: 33.4, duration: 3.2, kind: "CharacterWatch", title: "贈答箱が運ばれる", narration: true },
  { order: 12, start: 33.4, end: 36.6, duration: 3.2, kind: "CharacterWatch", title: "白手袋で箱を開き、時計を持ち上げる", narration: true },
  { order: 13, start: 36.6, end: 39.8, duration: 3.2, kind: "CharacterWatch", title: "Wrist → Reaction → 視線", narration: true },
  { order: 14, start: 39.8, end: 43, duration: 3.2, kind: "ProductMacro", title: "視線先のDial Macro", narration: true },
  { order: 15, start: 43, end: 46.2, duration: 3.2, kind: "ProductMacro", title: "Gold Khanjar Focus", narration: true },
  { order: 16, start: 46.2, end: 49.4, duration: 3.2, kind: "ProductDetail", title: "Outer Caseback / ASPREY", narration: true },
  { order: 17, start: 49.4, end: 52.6, duration: 3.2, kind: "ProductDetail", title: "Inner Caseback / Serial 5082955 / 1665", narration: true },
  { order: 18, start: 52.6, end: 55.8, duration: 3.2, kind: "ProductDetail", title: "Movement / 5,000,000 Series", narration: true },
  { order: 19, start: 55.8, end: 58.67, duration: 2.87, kind: "ProductHero", title: "Full Watch Hero / Story Payoff", narration: true },
  { order: 20, start: 58.67, end: 60, duration: 1.33, kind: "Ending", title: "POWER WATCH Brand End", narration: false },
] as const;

export const GOLD_KHANJAR_NARRATION_END_SECONDS =
  GOLD_KHANJAR_NARRATION_START_SECONDS + GOLD_KHANJAR_APPROVED_NARRATION_DURATION_SECONDS;

export const GOLD_KHANJAR_SCENES = [
  [6, "CityEraEstablishing", "1970年代オマーン", "1970s\nOMAN", "1970s", "OMAN", "1970s Muscat, Oman at dusk, authentic low whitewashed buildings between rugged mountains and the sea, warm dusty atmosphere, restrained archival documentary realism, sparse period vehicles far in the distance, no readable text, no logos, no emblems, no watches, no modern skyline", "slow aerial-to-street push", "wide establishing shot", "late afternoon amber haze", "dust in the air and subtle distant movement", "sandstone, charcoal and muted amber", "restrained dissolve"],
  [7, "HistoricalCharacter", "国家と権威", "A NEW ERA", null, null, "1970s Omani palace interior, dignified Middle Eastern statesman seen from behind walking through a shadowed colonnade, historically appropriate white dishdasha and restrained turban, quiet authority, photorealistic historical documentary, no identifiable real person, no readable text, no logos, no royal crest, no watches", "measured tracking shot from behind", "medium-wide silhouette", "warm window shafts through dust", "slow deliberate walk and fabric movement", "dark wood, limestone and subdued gold", "dust dissolve"],
  [8, "HistoricalEvent", "オマーンと英国", "OMAN × UNITED KINGDOM", null, null, "1970s diplomatic meeting room connecting Oman and Britain, two senior officials in period-correct attire exchanging a restrained greeting beside a mahogany table, cinematic historical documentary, faces natural and understated, no readable documents, no text, no logos, no emblems, no watches, no modern electronics", "slow lateral dolly", "medium two-shot", "soft overcast window light and warm practicals", "subtle handshake and respectful body language", "mahogany, cream and deep green", "motion matched cut"],
  [9, "HistoricalEvent", "功労者への贈答", "A SPECIAL GIFT", null, null, "1970s ceremonial gift presentation in a refined Omani interior, gloved attendant placing a closed unbranded dark leather presentation box into the hands of a recipient, quiet state occasion, premium photorealistic documentary, no object visible inside the box, no readable text, no logos, no crest, no watch, anatomically correct hands", "slow controlled push toward the exchange", "close medium detail", "single warm key with soft falloff", "one careful handover only", "black leather, walnut and restrained gold", "subtle light transition"],
  [10, "HistoricalEvent", "英国の名門ジュエラー", "ASPREY\nLONDON", null, null, "1970s luxury London jeweller interior inspired by Bond Street craftsmanship, mahogany display cabinetry, velvet trays, brass lamps, a master craftsperson preparing an unbranded presentation box, premium archival cinema, no readable shop sign, no text, no logos, no emblems, no watch product visible, no modern objects", "slow dolly through foreground glass reflections", "wide-to-medium interior", "warm tungsten pools in a dark room", "subtle craft movement and rack focus", "burgundy, walnut, brass and black", "restrained dissolve"],
  [11, "ProductHero", "選ばれたロレックス", "ROLEX Ref.1665/0", null, null, "Provided original product photograph only; preserve every product detail exactly.", "slow diagonal dolly", "full product hero", "controlled luxury studio light", "camera and light motion only", "neutral steel, black and restrained gold", "restrained dissolve"],
  [12, "WatchMacro", "文字盤", "GOLD KHANJAR", null, null, "Provided original product photograph only; preserve every product detail exactly.", "macro push toward the dial", "dial macro", "controlled luxury studio light", "camera and light motion only", "neutral steel, black and restrained gold", "restrained dissolve"],
  [13, "ProductHero", "カンジャル", "THE EMBLEM", null, null, "Provided original product photograph only; preserve every product detail exactly.", "controlled crop toward the emblem", "emblem detail", "controlled luxury studio light", "camera and light motion only", "neutral steel, black and restrained gold", "restrained dissolve"],
  [14, "ProductHero", "裏蓋", "ASPREY", null, null, "Provided original product photograph only; preserve every product detail exactly.", "slow light sweep", "caseback macro", "controlled luxury studio light", "camera and light motion only", "neutral steel, black and restrained gold", "restrained dissolve"],
  [15, "ProductHero", "シリアル", "SERIAL / 1665", null, null, "Provided original product photograph only; preserve every product detail exactly.", "measured vertical drift", "engraving macro", "controlled luxury studio light", "camera and light motion only", "neutral steel, black and restrained gold", "restrained dissolve"],
  [16, "WatchMacro", "ムーブメント", "5,000,000 SERIES", null, null, "Provided original product photograph only; preserve every product detail exactly.", "subtle rack-focus simulation", "movement macro", "controlled luxury studio light", "camera and light motion only", "neutral steel, black and restrained gold", "restrained dissolve"],
  [17, "ProductHero", "ケースとリューズ", "CROWN / CASE", null, null, "Provided original product photograph only; preserve every product detail exactly.", "slow side-profile dolly", "case profile", "controlled luxury studio light", "camera and light motion only", "neutral steel, black and restrained gold", "restrained dissolve"],
  [18, "ProductHero", "ブレスレット", "BRACELET / CLASP", null, null, "Provided original product photograph only; preserve every product detail exactly.", "controlled pan across brushed steel", "clasp macro", "controlled luxury studio light", "camera and light motion only", "neutral steel, black and restrained gold", "restrained dissolve"],
  [19, "ProductHero", "最終商品カット", "GOLD KHANJAR", null, null, "Provided original product photograph only; preserve every product detail exactly.", "slow final hero push", "hero close-up", "controlled luxury studio light", "camera and light motion only", "neutral steel, black and restrained gold", "restrained dissolve"],
  [20, "Ending", "ブランドエンド", "", null, null, "Pure black luxury brand ending with minimal motion and no product image.", "minimal fade", "black ending", "black", "near stillness", "black", "fade to black"],
] as const;

export const GOLD_KHANJAR_STATIC_FILES = Array.from({ length: 10 }, (_, index) => `scene-${index + 11}.mp4`);
