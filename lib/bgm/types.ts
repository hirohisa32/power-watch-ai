export type BgmCandidate = {
  id: string;
  key: string;
  name: string;
  filePath: string;
  durationMs: number;
  genre: string;
  mood: string;
  tags: string[];
  suitableStyles: string[];
  active: boolean;
};

export type BgmSelectionInput = {
  script: string;
  style: "cinematic_real" | "animation";
  targetDuration: number;
  storyProfile?: string;
  manualKey?: string;
};

export type RankedBgm = BgmCandidate & { score: number; reasons: string[] };
