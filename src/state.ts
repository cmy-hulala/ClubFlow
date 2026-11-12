import { defaultEnabled } from "./catalog";
import { emptyBrief } from "./sample";
import type { Brief, Lang, ModuleId, ModuleOutput, View } from "./types";

export type BriefSource = "empty" | "sample" | "edited";

const KEY = "clubflow.demo.v1";

export type AppState = {
  lang: Lang;
  view: View;
  brief: Brief;
  briefSource: BriefSource;
  enabled: Record<ModuleId, boolean>;
  outputs: ModuleOutput[] | null;
  ranAt: number | null;
  running: boolean;
  showErrors: boolean;
  stale: boolean;
};

function sanitizeBrief(raw: unknown): Brief {
  const brief = emptyBrief();
  if (!raw || typeof raw !== "object") return brief;
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(brief) as (keyof Brief)[]) {
    const value = record[key];
    if (typeof value === "string") brief[key] = value;
  }
  return brief;
}

function sanitizeEnabled(raw: unknown): Record<ModuleId, boolean> {
  const enabled = defaultEnabled();
  if (!raw || typeof raw !== "object") return enabled;
  const record = raw as Record<string, unknown>;
  for (const id of Object.keys(enabled) as ModuleId[]) {
    if (typeof record[id] === "boolean") enabled[id] = record[id];
  }
  for (const id of ["checkin", "approval", "handover", "shorturl"] as ModuleId[]) {
    enabled[id] = false;
  }
  return enabled;
}

function isView(value: unknown): value is View {
  return value === "desk" || value === "home" || value === "brief" || value === "market" || value === "outputs";
}

export const state: AppState = {
  lang: "en",
  view: "desk",
  brief: emptyBrief(),
  briefSource: "empty",
  enabled: defaultEnabled(),
  outputs: null,
  ranAt: null,
  running: false,
  showErrors: false,
  stale: false,
};

export function loadState(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, unknown>;
    state.lang = data.lang === "en" ? "en" : "zh";
    state.view = isView(data.view) ? data.view : "home";
    state.brief = sanitizeBrief(data.brief);
    state.briefSource =
      data.briefSource === "sample" || data.briefSource === "edited" ? data.briefSource : "empty";
    state.enabled = sanitizeEnabled(data.enabled);
  } catch {
    /* keep defaults */
  }
}

export function persist(): void {
  try {
    const payload = {
      lang: state.lang,
      view: state.view,
      brief: state.brief,
      briefSource: state.briefSource,
      enabled: state.enabled,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* storage full or blocked */
  }
}

export function viewFromHash(hash: string): View | null {
  const name = hash.replace(/^#\/?/, "");
  return isView(name) ? name : null;
}
