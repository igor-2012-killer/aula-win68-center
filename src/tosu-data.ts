export interface TosuSnapshot {
  state: string;
  client: string | null;
  version: string | null;
  map: string | null;
  accuracy: number | null;
  misses: number | null;
  hasJudgements: boolean;
  mapChecksum: string | null;
  mapTimeMs: number | null;
  paused: boolean | null;
  rate: number | null;
  mode: number | null;
  modsChecksum: string | null;
  modsName: string | null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Decode tosu v2 data conservatively: missing or malformed fields stay unknown. */
export function parseTosuSnapshot(input: unknown): TosuSnapshot | null {
  const root = object(input);
  if (!root) return null;
  const state = string(object(root.state)?.name);
  if (!state) return null;
  const beatmap = object(root.beatmap);
  const artist = string(beatmap?.artist);
  const title = string(beatmap?.title);
  const difficulty = string(beatmap?.version);
  const map = title ? `${artist ? `${artist} — ` : ""}${title}${difficulty ? ` [${difficulty}]` : ""}` : null;
  const clientSettings = object(object(root.settings)?.client);
  const play = object(root.play);
  const game = object(root.game);
  const beatmapTime = object(beatmap?.time);
  const mods = object(play?.mods);
  const hits = object(play?.hits);
  const accuracy = number(play?.accuracy);
  const misses = number(hits?.["0"]);
  const counts = ["0", "50", "100", "300"].map((key) => number(hits?.[key]));
  const hasJudgements = counts.every((value) => value !== null && Number.isInteger(value) && value >= 0)
    && counts.reduce<number>((sum, value) => sum + (value ?? 0), 0) > 0;
  return {
    state, client: string(root.client), version: string(clientSettings?.version), map,
    accuracy: accuracy !== null && accuracy >= 0 && accuracy <= 100 ? accuracy : null,
    misses: misses !== null && Number.isInteger(misses) && misses >= 0 ? misses : null,
    hasJudgements,
    mapChecksum: string(beatmap?.checksum),
    mapTimeMs: number(beatmapTime?.live),
    paused: typeof game?.paused === "boolean" ? game.paused : null,
    rate: number(mods?.rate),
    mode: number(object(play?.mode)?.number),
    modsChecksum: string(mods?.checksum),
    modsName: typeof mods?.name === "string" ? mods.name : null,
  };
}

/** Menu resets and initial zero-hit frames must not replace observed play data. */
export function retainLastPlay(previous: TosuSnapshot | null, next: TosuSnapshot): TosuSnapshot | null {
  return next.state === "play" && next.hasJudgements ? next : previous;
}
