import type { ModuleId, ModuleMeta } from "./types";

/** Sample one-day onboarding fee, charged once per club. Not a checkout. */
export const ONBOARDING_TWD = 6800;

export const MODULES: ModuleMeta[] = [
  { id: "ig-post", tier: "included" },
  { id: "ig-story", tier: "included" },
  { id: "line", tier: "included" },
  { id: "gform", tier: "included" },
  { id: "gmail", tier: "included" },
  { id: "reminders", tier: "included" },
  { id: "linktree", tier: "addon", price: 280 },
  { id: "school", tier: "addon", price: 890 },
  { id: "certificate", tier: "addon", price: 450 },
  { id: "postevent", tier: "addon", price: 360 },
  { id: "checkin", tier: "soon" },
  { id: "approval", tier: "soon" },
  { id: "handover", tier: "soon" },
  { id: "shorturl", tier: "soon" },
];

export function defaultEnabled(): Record<ModuleId, boolean> {
  const enabled = {} as Record<ModuleId, boolean>;
  for (const mod of MODULES) enabled[mod.id] = mod.tier !== "soon";
  return enabled;
}

export function addonTotal(enabled: Record<ModuleId, boolean>): number {
  return MODULES.reduce((sum, mod) => {
    if (mod.tier === "addon" && enabled[mod.id]) return sum + (mod.price ?? 0);
    return sum;
  }, 0);
}

export function enabledIds(enabled: Record<ModuleId, boolean>): ModuleId[] {
  return MODULES.filter((mod) => mod.tier !== "soon" && enabled[mod.id]).map((mod) => mod.id);
}

const PRESETS: Record<string, ModuleId[]> = {
  all: MODULES.filter((mod) => mod.tier !== "soon").map((mod) => mod.id),
  included: MODULES.filter((mod) => mod.tier === "included").map((mod) => mod.id),
  social: ["ig-post", "ig-story", "line", "linktree"],
  admin: ["gform", "gmail", "school", "reminders", "certificate", "postevent"],
};

export function applyPreset(preset: string, enabled: Record<ModuleId, boolean>): void {
  const ids = PRESETS[preset];
  if (!ids) return;
  for (const mod of MODULES) {
    enabled[mod.id] = mod.tier !== "soon" && ids.includes(mod.id);
  }
}
