export interface BoundaryState {
  version: 1;
  modelKey: string;
  minimumTokens: number;
  snoozeUntil: number;
  dismissed: boolean;
  lastSuggestedAt: number;
}

export const STATE_TYPE = "context-coach-boundary-state";
export function initialState(modelKey: string): BoundaryState {
  return {
    version: 1,
    modelKey,
    minimumTokens: 120000,
    snoozeUntil: 0,
    dismissed: false,
    lastSuggestedAt: 0,
  };
}

export function parseState(
  value: unknown,
  modelKey: string,
): BoundaryState | undefined {
  if (!value || typeof value !== "object") return;
  const state = value as BoundaryState;
  if (
    state.version !== 1 ||
    state.modelKey !== modelKey ||
    typeof state.dismissed !== "boolean" ||
    ![state.minimumTokens, state.snoozeUntil, state.lastSuggestedAt].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    state.minimumTokens === 0
  )
    return;
  return { ...state };
}

export function effectiveMinimum(state: BoundaryState, budget: number): number {
  return Math.min(state.minimumTokens, Math.floor(budget * 0.6));
}

/** Context is only a gate: the caller must separately supply a task boundary. */
export function canSuggest(
  tokens: number | null | undefined,
  budget: number,
  state: BoundaryState,
): boolean {
  return (
    tokens != null &&
    Number.isFinite(tokens) &&
    tokens >= 0 &&
    budget > 0 &&
    !state.dismissed &&
    tokens >= effectiveMinimum(state, budget) &&
    tokens >= state.snoozeUntil &&
    (state.lastSuggestedAt === 0 || tokens >= state.lastSuggestedAt + 20000)
  );
}
