export const spriteNumbers = {
  maxTokens: { label: "Max completion tokens", min: 0, max: 32768, help: "0 uses the provider default." },
  historyTurns: { label: "History turns", min: 0, max: 20 },
  historyChars: { label: "Characters per history message", min: 64, max: 8192 },
  roomEntries: { label: "Room entries per list", min: 1, max: 500 },
  timeoutSeconds: { label: "Request timeout (seconds)", min: 5, max: 120 },
  stdoutChars: { label: "Summary stdout characters", min: 0, max: 65536 },
  stderrChars: { label: "Summary stderr characters", min: 0, max: 65536 },
  maxSteps: { label: "Max actions per goal", min: 1, max: 30 },
  deadlineSeconds: { label: "Goal timeout (seconds)", min: 10, max: 300 },
  toolResultChars: { label: "Characters per tool result", min: 128, max: 8192 },
} as const;

export type SpriteNumber = keyof typeof spriteNumbers;
export type SpriteOptions = Record<SpriteNumber, number> & {
  mode: "simple" | "advanced";
  summarize: boolean;
  temperature?: number;
  effort?: "none" | "low" | "medium" | "high";
  instructions: string;
};

export const defaultSpriteOptions: SpriteOptions = {
  maxTokens: 0, historyTurns: 4, historyChars: 1000, roomEntries: 40, timeoutSeconds: 25,
  stdoutChars: 4000, stderrChars: 2000, maxSteps: 8, deadlineSeconds: 90, toolResultChars: 1600,
  mode: "simple", summarize: true, instructions: "",
};

export function sampling(options: SpriteOptions) {
  return {
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.effort ? { reasoning_effort: options.effort } : {}),
  };
}
