import "@fontsource/outfit/500.css";
import "@fontsource/outfit/700.css";
import "@fontsource/noto-sans-tc/chinese-traditional-400.css";
import "@fontsource/noto-sans-tc/chinese-traditional-500.css";
import "@fontsource/noto-sans-tc/chinese-traditional-700.css";
import "./styles.css";

import { copyBin, fileBin } from "./bins";
import { applyPreset, defaultEnabled, enabledIds, MODULES } from "./catalog";
import { missingFields } from "./format";
import { generateAll } from "./generate";
import { t } from "./i18n";
import { missingSummary, render } from "./render";
import { emptyBrief, sampleBrief } from "./sample";
import { loadState, persist, state, viewFromHash } from "./state";
import type { Brief, Lang, ModuleId, View } from "./types";

let toastTimer = 0;

function toast(message: string): void {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.classList.remove("show"), 2200);
}

function go(view: View): void {
  state.view = view;
  const next = `#/${view}`;
  if (location.hash !== next) history.pushState(null, "", next);
  persist();
  render();
  document.querySelector(".main")?.scrollTo(0, 0);
}

async function copyText(text: string): Promise<void> {
  if (!text) {
    toast(t(state.lang, "nothingCopied"));
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast(t(state.lang, "copied"));
}

function downloadFile(id: string): void {
  const file = fileBin.get(id);
  if (!file?.dataUrl) {
    toast(t(state.lang, "nothingCopied"));
    return;
  }
  const link = document.createElement("a");
  link.href = file.dataUrl;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function zoomFile(id: string): void {
  const file = fileBin.get(id);
  const dialog = document.querySelector<HTMLDialogElement>("#lightbox");
  const image = document.querySelector<HTMLImageElement>("#lightbox-img");
  if (!file?.dataUrl || !dialog || !image) return;
  image.src = file.dataUrl;
  image.alt = file.alt;
  dialog.setAttribute("aria-label", t(state.lang, "lightLabel"));
  dialog.showModal();
}

function closeLight(): void {
  document.querySelector<HTMLDialogElement>("#lightbox")?.close();
}

async function runWorkflow(): Promise<void> {
  if (state.running) return;
  if (missingFields(state.brief).length) {
    state.showErrors = true;
    state.view = "brief";
    const next = "#/brief";
    if (location.hash !== next) history.pushState(null, "", next);
    persist();
    render();
    toast(t(state.lang, "fixBrief"));
    return;
  }
  const ids = enabledIds(state.enabled);
  if (!ids.length) {
    go("market");
    toast(t(state.lang, "noneEnabled"));
    return;
  }
  state.running = true;
  render({ keepScroll: true });
  try {
    state.outputs = await generateAll(state.brief, state.lang, ids);
    state.ranAt = Date.now();
    state.stale = false;
    state.view = "outputs";
    const next = "#/outputs";
    if (location.hash !== next) history.pushState(null, "", next);
  } catch (error) {
    console.error(error);
    toast(t(state.lang, "genFailed"));
  } finally {
    state.running = false;
    persist();
    render();
    document.querySelector(".main")?.scrollTo(0, 0);
  }
}

async function setLang(lang: Lang): Promise<void> {
  if (state.running || state.lang === lang) return;
  state.lang = lang;
  if (state.briefSource === "sample") state.brief = sampleBrief(lang);
  persist();
  if (state.outputs && missingFields(state.brief).length === 0 && enabledIds(state.enabled).length > 0) {
    await runWorkflow();
    return;
  }
  render();
}

function loadSample(): void {
  if (state.briefSource === "edited" && state.brief.title.trim()) {
    if (!window.confirm(t(state.lang, "replaceConfirm"))) return;
  }
  state.brief = sampleBrief(state.lang);
  state.briefSource = "sample";
  state.showErrors = false;
  if (state.outputs) state.stale = true;
  persist();
  toast(t(state.lang, "sampleLoaded"));
  go("brief");
}

function clearBrief(): void {
  state.brief = emptyBrief();
  state.briefSource = "empty";
  state.showErrors = false;
  if (state.outputs) state.stale = true;
  persist();
  render();
}

function resetAll(): void {
  if (!window.confirm(t(state.lang, "resetConfirm"))) return;
  state.brief = emptyBrief();
  state.briefSource = "empty";
  state.enabled = defaultEnabled();
  state.outputs = null;
  state.ranAt = null;
  state.stale = false;
  state.showErrors = false;
  go("home");
}

function onField(target: HTMLInputElement | HTMLTextAreaElement): void {
  const key = target.dataset.field as keyof Brief | undefined;
  if (!key) return;
  state.brief[key] = target.value;
  state.briefSource = "edited";
  if (state.outputs) state.stale = true;
  persist();
  const box = document.querySelector<HTMLElement>("#missing");
  if (box && state.showErrors) {
    const summary = missingSummary();
    box.hidden = !summary;
    box.textContent = summary;
  }
  document.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
    const field = el.dataset.field as keyof Brief;
    el.closest(".fld")?.classList.toggle("bad", state.showErrors && missingFields(state.brief).includes(field));
  });
  const stale = document.querySelector<HTMLElement>("#stale");
  if (stale && state.stale) stale.hidden = false;
}

function isModuleId(value: string): value is ModuleId {
  return MODULES.some((mod) => mod.id === value);
}

function isView(value: string): value is View {
  return value === "home" || value === "brief" || value === "market" || value === "outputs";
}

document.body.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const el = target.closest<HTMLElement>("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  if (action === "nav") {
    const view = el.dataset.view ?? "";
    if (isView(view)) go(view);
    return;
  }
  if (action === "lang") {
    const lang = el.dataset.lang;
    if (lang === "zh" || lang === "en") void setLang(lang);
    return;
  }
  if (action === "run") {
    void runWorkflow();
    return;
  }
  if (action === "load-sample") {
    loadSample();
    return;
  }
  if (action === "clear-brief") {
    clearBrief();
    return;
  }
  if (action === "reset") {
    resetAll();
    return;
  }
  if (action === "toggle") {
    const id = el.dataset.id ?? "";
    if (!isModuleId(id)) return;
    const mod = MODULES.find((item) => item.id === id);
    if (!mod || mod.tier === "soon") return;
    state.enabled[id] = !state.enabled[id];
    if (state.outputs) state.stale = true;
    persist();
    render({ keepScroll: true });
    return;
  }
  if (action === "preset") {
    const preset = el.dataset.preset ?? "";
    applyPreset(preset, state.enabled);
    if (state.outputs) state.stale = true;
    persist();
    render({ keepScroll: true });
    return;
  }
  if (action === "copy") {
    const text = copyBin.get(el.dataset.copy ?? "") ?? "";
    void copyText(text);
    return;
  }
  if (action === "download") {
    downloadFile(el.dataset.file ?? "");
    return;
  }
  if (action === "zoom") {
    zoomFile(el.dataset.file ?? "");
    return;
  }
  if (action === "close-light") {
    closeLight();
    return;
  }
  if (action === "jump") {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(el.dataset.target ?? "")?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }
});

document.body.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) onField(target);
});

document.body.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) onField(target);
});

document.body.addEventListener("submit", (event) => {
  event.preventDefault();
});

document.body.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    void runWorkflow();
  }
});

document.querySelector("#lightbox")?.addEventListener("click", (event) => {
  const dialog = event.currentTarget;
  if (event.target === dialog && dialog instanceof HTMLDialogElement) dialog.close();
});

window.addEventListener("hashchange", () => {
  const view = viewFromHash(location.hash);
  if (!view || view === state.view) return;
  state.view = view;
  persist();
  render();
});

loadState();
const initial = viewFromHash(location.hash);
if (initial) state.view = initial;
else history.replaceState(null, "", `#/${state.view}`);
render();
