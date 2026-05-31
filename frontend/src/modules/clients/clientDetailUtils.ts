import { Circuito, ExerciseEntry, PlanContent } from "../../api";

export type MeasureRow = {
  key: string;
  value: string;
};

export function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatBirthDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  const age = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `${date.toLocaleDateString()} (age ${age})`;
}

export function statusClass(status: string): string {
  if (status === "approved") return "status-approved";
  if (status === "draft") return "status-draft";
  return "status-review";
}

export function prettyDayLabel(dayKey: string): string {
  if (!dayKey) return "Day";
  const match = dayKey.match(/^dia[_-]?(\d+)$/i);
  if (match) return `Día ${match[1]}`;
  return dayKey;
}

export function nextDayKey(existing: string[]): string {
  let maxNumber = 0;
  for (const key of existing) {
    const match = key.match(/^dia[_-]?(\d+)$/i);
    if (match) {
      const value = parseInt(match[1], 10);
      if (!Number.isNaN(value) && value > maxNumber) maxNumber = value;
    }
  }
  return `dia_${maxNumber + 1}`;
}

export function defaultExercise(): ExerciseEntry {
  return { ejercicio: "", repeticiones: 10, peso: "", media_url: "" };
}

/** Legacy plans stored ``url_video`` + ``image_url`` separately. Migrate either
 *  one into the unified ``media_url`` field, preferring an explicit
 *  ``image_url`` override when ``url_video`` is empty. */
function pickMediaUrl(exercise: Record<string, unknown>): string {
  const media = typeof exercise.media_url === "string" ? exercise.media_url.trim() : "";
  if (media) return media;
  const video = typeof exercise.url_video === "string" ? exercise.url_video.trim() : "";
  if (video) return video;
  const image = typeof exercise.image_url === "string" ? exercise.image_url.trim() : "";
  return image;
}

export function defaultCircuito(): Circuito {
  return { series: 3, exercises: [defaultExercise()] };
}

export function normalizeContent(content: unknown): PlanContent {
  if (!content || typeof content !== "object") return {};
  const normalized: PlanContent = {};
  for (const [day, value] of Object.entries(content as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    if (value.length === 0) {
      normalized[day] = [];
      continue;
    }
    const firstItem = value[0];
    const isCircuitShape =
      firstItem &&
      typeof firstItem === "object" &&
      "exercises" in (firstItem as Record<string, unknown>) &&
      Array.isArray((firstItem as { exercises?: unknown }).exercises);

    if (isCircuitShape) {
      normalized[day] = (value as Array<Record<string, unknown>>).map((circuito) => ({
        series: typeof circuito.series === "number" ? circuito.series : 3,
        exercises: (Array.isArray(circuito.exercises) ? circuito.exercises : []).map(
          (exercise: Record<string, unknown>) => ({
            ejercicio: typeof exercise.ejercicio === "string" ? exercise.ejercicio : "",
            repeticiones: Number(exercise.repeticiones) || 0,
            peso: typeof exercise.peso === "string" ? exercise.peso : "",
            media_url: pickMediaUrl(exercise),
          }),
        ),
      }));
    } else {
      const legacy = value as Array<Record<string, unknown>>;
      const firstSeries = legacy[0]?.series;
      const wrappedSeries =
        typeof firstSeries === "number" && firstSeries > 0 ? firstSeries : 3;
      normalized[day] = [
        {
          series: wrappedSeries,
          exercises: legacy.map((exercise) => ({
            ejercicio: typeof exercise.ejercicio === "string" ? exercise.ejercicio : "",
            repeticiones: Number(exercise.repeticiones) || 0,
            peso: typeof exercise.peso === "string" ? exercise.peso : "",
            media_url: pickMediaUrl(exercise),
          })),
        },
      ];
    }
  }
  return normalized;
}

export function cleanContent(content: PlanContent): PlanContent {
  const cleaned: PlanContent = {};
  for (const [day, circuitos] of Object.entries(content)) {
    cleaned[day] = circuitos.map((circuito) => ({
      series: typeof circuito.series === "number" ? circuito.series : 0,
      exercises: circuito.exercises.map((exercise) => ({
        ejercicio: exercise.ejercicio,
        repeticiones: exercise.repeticiones,
        peso: exercise.peso,
        media_url: (exercise.media_url ?? "").trim(),
      })),
    }));
  }
  return cleaned;
}

export function measuresToRows(measures: Record<string, number | string>): MeasureRow[] {
  return Object.entries(measures).map(([key, value]) => ({ key, value: String(value) }));
}

export function computeMeasuresChanges(
  original: MeasureRow[],
  current: MeasureRow[],
): { diff: Record<string, number | string>; removed: string[] } {
  const originalMap = new Map(
    original.filter((row) => row.key.trim() !== "").map((row) => [row.key.trim(), row.value]),
  );
  const currentKeys = new Set(
    current.filter((row) => row.key.trim() !== "").map((row) => row.key.trim()),
  );

  const diff: Record<string, number | string> = {};
  for (const row of current) {
    const key = row.key.trim();
    if (!key) continue;
    if (row.value.trim() === "") continue;
    const before = originalMap.get(key);
    if (before === row.value) continue;
    const numeric = Number(row.value);
    diff[key] = !Number.isNaN(numeric) ? numeric : row.value;
  }

  const removed: string[] = [];
  for (const key of originalMap.keys()) {
    if (!currentKeys.has(key)) removed.push(key);
  }

  return { diff, removed };
}
