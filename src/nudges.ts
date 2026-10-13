export interface NudgeState {
  version: 1;
  modelKey: string;
  level: number;
  snoozeUntil: number;
  dismissed: boolean;
  soft: number;
  strong: number;
}

export const STATE_TYPE = "context-coach-state";
export function initialState(modelKey: string): NudgeState {
  return {
    version: 1,
    modelKey,
    level: 0,
    snoozeUntil: 0,
    dismissed: false,
    soft: 120000,
    strong: 180000,
  };
}

export function parseState(
  value: unknown,
  modelKey: string,
): NudgeState | undefined {
  if (!value || typeof value !== "object") return;
  const state = value as NudgeState;
  if (
    state.version !== 1 ||
    state.modelKey !== modelKey ||
    ![0, 1, 2].includes(state.level) ||
    typeof state.dismissed !== "boolean" ||
    ![state.snoozeUntil, state.soft, state.strong].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    state.soft === 0 ||
    state.strong <= state.soft
  )
    return;
  return { ...state };
}

export function thresholds(state: NudgeState, budget: number) {
  return {
    soft: Math.min(state.soft, Math.floor(budget * 0.6)),
    strong: Math.min(state.strong, Math.floor(budget * 0.9)),
  };
}

export function nudgeLevel(
  tokens: number | null | undefined,
  budget: number,
  state: NudgeState,
): number {
  if (
    tokens == null ||
    !Number.isFinite(tokens) ||
    tokens < 0 ||
    budget <= 0 ||
    state.dismissed ||
    tokens < state.snoozeUntil
  )
    return 0;
  const limits = thresholds(state, budget);
  const level = tokens >= limits.strong ? 2 : tokens >= limits.soft ? 1 : 0;
  return level > state.level ? level : 0;
}
