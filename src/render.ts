import { addonTotal, enabledIds, MODULES, ONBOARDING_TWD } from "./catalog";
import { copyBin, fileBin, resetBins } from "./bins";
import { esc, fieldLabel, missingFields, ntd, whenLine } from "./format";
import { moduleCopy, t, tf, type MsgKey } from "./i18n";
import { state } from "./state";
import type { Block, Brief, ModuleId, Paper, TimelineItem } from "./types";

let seq = 0;

function pinCopy(text: string): string {
  const id = `c${seq++}`;
  copyBin.set(id, text);
  return id;
}

function pinFile(filename: string, dataUrl: string, alt: string): string {
  const id = `f${seq++}`;
  fileBin.set(id, { filename, dataUrl, alt });
  return id;
}

function mark(): string {
  return `<svg class="mark-svg" viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="6" width="15" height="3.4" rx="1.6" fill="#e6c27a"/><rect x="4" y="14" width="11" height="3.4" rx="1.6" fill="#8fd0b8"/><rect x="4" y="22" width="13" height="3.4" rx="1.6" fill="#f4efe6"/><path d="M21 16h8M25 12.2 29 16l-4 3.8" fill="none" stroke="#f4efe6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function copyButton(text: string, label: string): string {
  return `<button type="button" class="btn tiny secondary" data-action="copy" data-copy="${pinCopy(text)}">${esc(label)}</button>`;
}

const REQUIRED = new Set<keyof Brief>([
  "title",
  "description",
  "audience",
  "speakerName",
  "date",
  "startTime",
  "endTime",
  "venue",
  "capacity",
  "signupDeadline",
  "clubName",
]);

function field(
  key: keyof Brief,
  opts: { type?: string; hint?: string; multiline?: boolean; wide?: boolean; max?: number; placeholder?: string },
): string {
  const lang = state.lang;
  const missing = state.showErrors && missingFields(state.brief).includes(key);
  const value = state.brief[key];
  const max = opts.max ? ` maxlength="${opts.max}"` : "";
  const control = opts.multiline
    ? `<textarea data-field="${key}"${max} placeholder="${esc(opts.placeholder ?? "")}">${esc(value)}</textarea>`
    : `<input data-field="${key}" type="${opts.type ?? "text"}" value="${esc(value)}"${max} placeholder="${esc(opts.placeholder ?? "")}" ${opts.type === "number" ? 'min="1" max="5000" inputmode="numeric"' : ""} autocomplete="off" />`;
  return `<label class="fld ${opts.wide ? "wide" : ""} ${missing ? "bad" : ""}">
    <span class="fld-label">${esc(fieldLabel(key, lang))}${REQUIRED.has(key) ? `<em>${esc(t(lang, "requiredMark"))}</em>` : ""}</span>
    ${control}
    ${opts.hint ? `<small>${esc(opts.hint)}</small>` : ""}
  </label>`;
}

function timelineHtml(items: TimelineItem[]): string {
  return `<ol class="timeline">${items
    .map(
      (item) => `<li class="due due-${item.kind}">
        <div class="due-when">${esc(item.when)}<b>${esc(item.status)}</b></div>
        <div><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p></div>
      </li>`,
    )
    .join("")}</ol>`;
}

function paperPlain(paper: Paper): string {
  const lines = [paper.kicker, paper.title, `${paper.deadline} · ${paper.status}`, ""];
  for (const row of paper.rows) lines.push(`${row.k}：${row.v}`);
  if (paper.table) {
    lines.push("", paper.table.caption, paper.table.headers.join(" | "));
    for (const row of paper.table.rows) lines.push(row.join(" | "));
  }
  if (paper.bullets) {
    lines.push("", paper.bullets.title);
    for (const item of paper.bullets.items) lines.push(`- ${item}`);
  }
  lines.push("", paper.foot);
  return lines.join("\n");
}

function paperHtml(paper: Paper): string {
  const rows = paper.rows
    .map((row) => `<div class="kv-row"><dt>${esc(row.k)}</dt><dd>${esc(row.v)}</dd></div>`)
    .join("");
  const table = paper.table
    ? `<h5>${esc(paper.table.caption)}</h5><table class="data"><thead><tr>${paper.table.headers
        .map((header) => `<th>${esc(header)}</th>`)
        .join("")}</tr></thead><tbody>${paper.table.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`
    : "";
  const bullets = paper.bullets
    ? `<h5>${esc(paper.bullets.title)}</h5><ul>${paper.bullets.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
    : "";
  return `<article class="paper">
    <header class="paper-top">
      <span>${esc(paper.index)}</span>
      <span class="pill due-${paper.kind}">${esc(paper.status)}</span>
    </header>
    <p class="doc-kicker">${esc(paper.kicker)}</p>
    <h4>${esc(paper.title)}</h4>
    <p class="deadline due-${paper.kind}">${esc(paper.deadline)}</p>
    <div class="paper-actions">${copyButton(paperPlain(paper), t(state.lang, "copy"))}</div>
    <dl class="kv">${rows}</dl>
    ${table}
    ${bullets}
    <p class="paper-foot">${esc(paper.foot)}</p>
  </article>`;
}

function frameFor(width: number, height: number): string {
  if (height > width * 1.4) return "story";
  if (width > height) return "cert";
  return "feed";
}

function blockHtml(block: Block): string {
  const lang = state.lang;
  if (block.type === "note") {
    if (!block.text.trim()) return "";
    return `<p class="note note-${block.tone}">${esc(block.text)}</p>`;
  }
  if (block.type === "text") {
    return `<section class="block">
      <div class="block-bar"><h4>${esc(block.label)}</h4>${copyButton(block.text, t(lang, "copy"))}</div>
      <div class="prose">${esc(block.text)}</div>
    </section>`;
  }
  if (block.type === "tags") {
    return `<section class="block">
      <div class="block-bar"><h4>${esc(block.label)}</h4>${copyButton(block.tags.join(" "), t(lang, "copyTags"))}</div>
      <div class="tags">${block.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>
    </section>`;
  }
  if (block.type === "kv") {
    const plain = block.rows.map((row) => `${row.k}：${row.v}`).join("\n");
    return `<section class="block">
      <div class="block-bar"><h4>${esc(block.label)}</h4>${copyButton(plain, t(lang, "copy"))}</div>
      <dl class="kv">${block.rows.map((row) => `<div class="kv-row"><dt>${esc(row.k)}</dt><dd>${esc(row.v)}</dd></div>`).join("")}</dl>
    </section>`;
  }
  if (block.type === "fields") {
    const plain = [
      block.intro,
      "",
      ...block.fields.map((fieldItem) => {
        const flag = fieldItem.required ? t(lang, "formYes") : t(lang, "formNo");
        const options = fieldItem.options ? ` (${fieldItem.options.join(" / ")})` : "";
        const help = fieldItem.help ? ` — ${fieldItem.help}` : "";
        return `${fieldItem.name} · ${fieldItem.kind} · ${flag}${options}${help}`;
      }),
    ].join("\n");
    return `<section class="block">
      <div class="block-bar"><h4>${esc(block.label)}</h4>${copyButton(plain, t(lang, "copy"))}</div>
      <table class="data">
        <thead><tr><th>${esc(lang === "zh" ? "欄位" : "Field")}</th><th>${esc(lang === "zh" ? "類型" : "Type")}</th><th>${esc(lang === "zh" ? "必填" : "Required")}</th><th>${esc(lang === "zh" ? "選項 / 說明" : "Options / help")}</th></tr></thead>
        <tbody>${block.fields
          .map((fieldItem) => {
            const extra = [fieldItem.options?.join(" / "), fieldItem.help].filter(Boolean).join(" · ");
            return `<tr><td>${esc(fieldItem.name)}</td><td>${esc(fieldItem.kind)}</td><td>${esc(fieldItem.required ? t(lang, "formYes") : t(lang, "formNo"))}</td><td>${esc(extra)}</td></tr>`;
          })
          .join("")}</tbody>
      </table>
    </section>`;
  }
  if (block.type === "links") {
    const plain = block.links.map((link) => `${link.order}. ${link.title}\n${link.url}\n${link.note}`).join("\n\n");
    return `<section class="block">
      <div class="block-bar"><h4>${esc(block.label)}</h4><span class="btn-row">${copyButton(plain, t(lang, "copyAllLinks"))}${copyButton(block.json, t(lang, "copyJson"))}</span></div>
      <ol class="links">${block.links
        .map(
          (link) => `<li>
            <span class="order">${link.order}</span>
            <div><strong>${esc(link.title)}</strong><a href="${esc(link.url)}" target="_blank" rel="noreferrer noopener">${esc(link.url)}</a><p>${esc(link.note)}</p></div>
          </li>`,
        )
        .join("")}</ol>
      <pre class="code">${esc(block.json)}</pre>
    </section>`;
  }
  if (block.type === "mail") {
    return `<section class="block">
      <div class="block-bar"><h4>${esc(t(lang, "subjectLabel"))}</h4>${copyButton(block.subject, t(lang, "copySubject"))}</div>
      <p class="subject-line">${esc(block.subject)}</p>
      <div class="block-bar"><h4>${esc(block.note)}</h4><span class="btn-row">${copyButton(block.html, t(lang, "copyHtml"))}${copyButton(block.text, t(lang, "copyPlain"))}</span></div>
      <div class="mail-preview">${block.html}</div>
    </section>`;
  }
  if (block.type === "line") {
    return `<section class="block">
      <div class="block-bar"><h4>${esc(block.label)}</h4>${copyButton(block.text, t(lang, "copy"))}</div>
      <div class="phone">
        <div class="phone-top">${esc(lang === "zh" ? "官方帳號 · 群發預覽" : "Official account · broadcast preview")}</div>
        <div class="bubble">${esc(block.text)}</div>
      </div>
    </section>`;
  }
  if (block.type === "calendar") {
    return `<section class="block"><h4>${esc(block.label)}</h4>${timelineHtml(block.items)}</section>`;
  }
  if (block.type === "papers") {
    return `<section class="block">
      <h4>${esc(block.intro)}</h4>
      ${timelineHtml(block.timeline)}
      ${block.papers.map((paper) => paperHtml(paper)).join("")}
    </section>`;
  }
  const fileId = pinFile(block.filename, block.dataUrl, block.alt);
  const frame = frameFor(block.width, block.height);
  const visual = block.dataUrl
    ? `<img src="${block.dataUrl}" alt="${esc(block.alt)}" width="${block.width}" height="${block.height}" data-action="zoom" data-file="${fileId}" />`
    : `<div class="fallback">${esc(block.fallback)}</div>`;
  return `<section class="block">
    <div class="block-bar"><h4>${esc(block.label)}</h4>
      <span class="btn-row">
        <button type="button" class="btn tiny secondary" data-action="zoom" data-file="${fileId}">${esc(t(lang, "zoom"))}</button>
        <button type="button" class="btn tiny secondary" data-action="download" data-file="${fileId}">${esc(t(lang, "download"))}</button>
      </span>
    </div>
    <figure class="shot shot-${frame}">${visual}</figure>
  </section>`;
}

function navButton(view: "home" | "brief" | "market" | "outputs", key: MsgKey): string {
  const current = state.view === view;
  return `<button type="button" class="nav-btn ${current ? "active" : ""}" data-action="nav" data-view="${view}" ${current ? 'aria-current="page"' : ""}>${esc(t(state.lang, key))}</button>`;
}

function shell(): string {
  const lang = state.lang;
  const count = enabledIds(state.enabled).length;
  return `<div class="app">
    <aside class="rail">
      <div class="brand">
        ${mark()}
        <span><strong>ClubFlow</strong><em>${esc(t(lang, "brandSub"))}</em></span>
      </div>
      <section class="club-card">
        <p class="eyebrow">${esc(t(lang, "railKicker"))}</p>
        <h2>${esc(t(lang, "clubZh"))}</h2>
        <p>${esc(t(lang, "clubEn"))}</p>
        <p class="quiet">${esc(t(lang, "campus"))}</p>
        <p class="lock">${esc(t(lang, "noPassword"))}</p>
      </section>
      <nav class="nav" aria-label="ClubFlow">
        ${navButton("home", "navHome")}
        ${navButton("brief", "navBrief")}
        ${navButton("market", "navMarket")}
        ${navButton("outputs", "navOutputs")}
      </nav>
      <section class="officers">
        <p class="eyebrow">${esc(t(lang, "officers"))}</p>
        <p><b>${esc(t(lang, "officerPresident"))}</b>　陳予安</p>
        <p><b>${esc(t(lang, "officerLead"))}</b>　黃以恩</p>
        <p class="quiet">${esc(t(lang, "fictional"))}</p>
      </section>
      <p class="rail-foot">${esc(t(lang, "workspaceFoot"))}</p>
      <button type="button" class="btn tiny ghost" data-action="reset">${esc(t(lang, "reset"))}</button>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="topbar-inner">
          <p class="ready">${esc(tf(lang, "readyCount", { n: count }))}</p>
          <div class="top-actions">
            <div class="lang" role="group" aria-label="Language">
              <button type="button" class="${lang === "zh" ? "active" : ""}" data-action="lang" data-lang="zh" aria-pressed="${lang === "zh"}">${esc(t(lang, "langZh"))}</button>
              <button type="button" class="${lang === "en" ? "active" : ""}" data-action="lang" data-lang="en" aria-pressed="${lang === "en"}">${esc(t(lang, "langEn"))}</button>
            </div>
            <button type="button" class="btn" id="run-btn" data-action="run" ${state.running ? "disabled" : ""}>${esc(state.running ? t(lang, "running") : t(lang, "run"))}</button>
          </div>
        </div>
      </header>
      <div class="content">${viewHtml()}</div>
    </div>
  </div>`;
}

function viewHtml(): string {
  if (state.view === "brief") return briefHtml();
  if (state.view === "market") return marketHtml();
  if (state.view === "outputs") return outputsHtml();
  return homeHtml();
}

function homeHtml(): string {
  const lang = state.lang;
  const filled = missingFields(state.brief).length === 0;
  const channels: ModuleId[] = ["ig-post", "ig-story", "linktree", "line", "gform", "gmail", "school", "certificate"];
  const week = filled
    ? `<div class="week filled">
        <p class="eyebrow">${esc(t(lang, "thisWeek"))}</p>
        <h3>${esc(state.brief.title)}</h3>
        <p>${esc(state.brief.speakerName)} · ${esc(whenLine(state.brief, lang))}</p>
        <p>${esc(state.brief.venue)}</p>
        <div class="btn-row">
          <button type="button" class="btn secondary" data-action="nav" data-view="brief">${esc(t(lang, "continueEdit"))}</button>
          <button type="button" class="btn" data-action="run">${esc(t(lang, "run"))}</button>
        </div>
      </div>`
    : `<div class="week">
        <p class="eyebrow">${esc(t(lang, "thisWeek"))}</p>
        <h3>${esc(t(lang, "emptyWeek"))}</h3>
        <p>${esc(t(lang, "emptyWeekHint"))}</p>
        <button type="button" class="btn" data-action="load-sample">${esc(t(lang, "loadSample"))}</button>
        <p class="quiet">${esc(t(lang, "sampleNote"))}</p>
      </div>`;
  return `<section class="view">
    <div class="hero">
      <div>
        <p class="eyebrow">${esc(t(lang, "heroEyebrow"))}</p>
        <h1>${esc(t(lang, "heroTitle"))}</h1>
        <p class="lead">${esc(t(lang, "heroLead"))}</p>
      </div>
      ${week}
    </div>
    <div class="stats">
      <article><b>${esc(t(lang, "statChannels"))}</b><span>${esc(t(lang, "statChannelsSub"))}</span></article>
      <article><b>${esc(t(lang, "statBrief"))}</b><span>${esc(t(lang, "statBriefSub"))}</span></article>
      <article><b>${esc(t(lang, "statPasswords"))}</b><span>${esc(t(lang, "statPasswordsSub"))}</span></article>
    </div>
    <section class="panel">
      <h2>${esc(t(lang, "channelsTitle"))}</h2>
      <div class="flow">
        <span class="source">${esc(t(lang, "channelBrief"))}</span>
        <span class="arrow" aria-hidden="true">→</span>
        <div class="chips">${channels.map((id) => `<span>${esc(moduleCopy(lang, id).name)}</span>`).join("")}</div>
      </div>
    </section>
    <div class="split">
      <section class="panel">
        <h2>${esc(t(lang, "howTitle"))}</h2>
        <ol class="steps">
          <li>${esc(t(lang, "how1"))}</li>
          <li>${esc(t(lang, "how2"))}</li>
          <li>${esc(t(lang, "how3"))}</li>
        </ol>
      </section>
      <section class="panel">
        <h2>${esc(t(lang, "modelTitle"))}</h2>
        <p>${esc(t(lang, "modelBody"))}</p>
        <button type="button" class="btn secondary" data-action="nav" data-view="market">${esc(t(lang, "openMarket"))}</button>
      </section>
    </div>
    <section class="panel past">
      <h2>${esc(t(lang, "pastTitle"))}</h2>
      <p>${esc(t(lang, "pastItem"))}</p>
      <p class="quiet">${esc(t(lang, "pastStatic"))}</p>
    </section>
    <p class="foot-note">${esc(t(lang, "openSource"))}</p>
  </section>`;
}

function briefHtml(): string {
  const lang = state.lang;
  const missing = missingFields(state.brief);
  const missingBox =
    state.showErrors && missing.length
      ? `<p class="note note-warn" id="missing">${esc(tf(lang, "needFields", { list: missing.map((key) => fieldLabel(key, lang)).join(lang === "zh" ? "、" : ", ") }))}</p>`
      : `<p class="note note-warn" id="missing" hidden></p>`;
  const sampleHint = state.briefSource === "sample" ? `<p class="note">${esc(t(lang, "hintSample"))} ${esc(t(lang, "sampleNote"))}</p>` : "";
  return `<section class="view">
    <div class="view-head">
      <div>
        <p class="eyebrow">${esc(t(lang, "navBrief"))}</p>
        <h1>${esc(t(lang, "briefTitle"))}</h1>
        <p class="lead">${esc(t(lang, "briefLead"))}</p>
      </div>
      <div class="btn-row">
        <button type="button" class="btn" data-action="load-sample">${esc(t(lang, "loadSample"))}</button>
        <button type="button" class="btn secondary" data-action="clear-brief">${esc(t(lang, "clearBrief"))}</button>
      </div>
    </div>
    ${missingBox}
    ${sampleHint}
    <form class="brief" autocomplete="off">
      <h2>${esc(t(lang, "sectionStory"))}</h2>
      <div class="form-grid">
        ${field("title", { wide: true, max: 140, placeholder: lang === "zh" ? "這一場對外的名稱" : "The public name of this event" })}
        ${field("description", { wide: true, multiline: true, max: 900, placeholder: lang === "zh" ? "一段話：這場要幫同學解決什麼" : "One paragraph: what this helps students do" })}
        ${field("audience", { wide: true, max: 280, placeholder: lang === "zh" ? "誰該來" : "Who should come" })}
      </div>
      <h2>${esc(t(lang, "sectionSpeaker"))}</h2>
      <div class="form-grid">
        ${field("speakerName", { max: 60 })}
        ${field("speakerRole", { max: 80 })}
        ${field("speakerBio", { wide: true, multiline: true, max: 600 })}
      </div>
      <h2>${esc(t(lang, "sectionLogistics"))}</h2>
      <div class="form-grid">
        ${field("date", { type: "date" })}
        ${field("startTime", { type: "time" })}
        ${field("endTime", { type: "time" })}
        ${field("venue", { max: 180 })}
        ${field("capacity", { type: "number" })}
        ${field("signupDeadline", { type: "datetime-local" })}
      </div>
      <h2>${esc(t(lang, "sectionClub"))}</h2>
      <div class="form-grid">
        ${field("clubName", { max: 100 })}
        ${field("contactEmail", { type: "email", max: 80 })}
        ${field("contactPhone", { max: 80 })}
        ${field("socialHandle", { max: 40, placeholder: "@club" })}
        ${field("signupUrl", { wide: true, max: 200, hint: t(lang, "hintUrl") })}
      </div>
    </form>
  </section>`;
}

function marketHtml(): string {
  const lang = state.lang;
  const included = MODULES.filter((mod) => mod.tier === "included").length;
  const addons = MODULES.filter((mod) => mod.tier === "addon").length;
  const soon = MODULES.filter((mod) => mod.tier === "soon").length;
  const addon = addonTotal(state.enabled);
  const addonRows = MODULES.filter((mod) => mod.tier === "addon" && state.enabled[mod.id]);
  return `<section class="view">
    <div class="view-head">
      <div>
        <p class="eyebrow">${esc(t(lang, "navMarket"))}</p>
        <h1>${esc(t(lang, "marketTitle"))}</h1>
        <p class="lead">${esc(t(lang, "marketLead"))}</p>
      </div>
    </div>
    <p class="counts">
      <span>${esc(tf(lang, "includedN", { n: included }))}</span>
      <span>${esc(tf(lang, "addonN", { n: addons }))}</span>
      <span>${esc(tf(lang, "soonN", { n: soon }))}</span>
    </p>
    <div class="presets">
      ${(["all", "included", "social", "admin"] as const)
        .map((preset) => {
          const label = preset === "all" ? "presetAll" : preset === "included" ? "presetIncluded" : preset === "social" ? "presetSocial" : "presetAdmin";
          return `<button type="button" class="btn tiny secondary" data-action="preset" data-preset="${preset}">${esc(t(lang, label))}</button>`;
        })
        .join("")}
    </div>
    <div class="market-layout">
      <div class="mod-grid">
        ${MODULES.map((mod) => moduleCard(mod.id)).join("")}
      </div>
      <aside class="quote">
        <p class="eyebrow">${esc(t(lang, "buyerNote"))}</p>
        <h2>${esc(t(lang, "quoteTitle"))}</h2>
        <div class="quote-line"><span>${esc(t(lang, "onboardingName"))}</span><b>${esc(ntd(ONBOARDING_TWD))}</b></div>
        <p class="quiet">${esc(t(lang, "onboardingOnce"))}</p>
        <p class="quiet">${esc(t(lang, "quoteCustom"))}</p>
        <h3>${esc(t(lang, "quoteAddons"))}</h3>
        ${
          addonRows.length
            ? addonRows
                .map((mod) => `<div class="quote-line"><span>${esc(moduleCopy(lang, mod.id).name)}</span><b>${esc(ntd(mod.price ?? 0))}</b></div>`)
                .join("")
            : `<p class="quiet">${esc(t(lang, "quoteNone"))}</p>`
        }
        <div class="quote-line total"><span>${esc(t(lang, "thisEventAdd"))}</span><b>${esc(ntd(addon))}</b></div>
        <div class="quote-line total"><span>${esc(t(lang, "totalLabel"))}</span><b>${esc(ntd(ONBOARDING_TWD + addon))}</b></div>
        <p class="quiet">${esc(t(lang, "quoteNoCharge"))}</p>
      </aside>
    </div>
  </section>`;
}

function moduleCard(id: ModuleId): string {
  const lang = state.lang;
  const mod = MODULES.find((item) => item.id === id);
  if (!mod) return "";
  const copy = moduleCopy(lang, id);
  const on = Boolean(state.enabled[id]);
  const tierLabel = mod.tier === "included" ? t(lang, "tierIncluded") : mod.tier === "addon" ? t(lang, "tierAddon") : t(lang, "tierSoon");
  const price =
    mod.tier === "addon" && mod.price
      ? `<span class="price">${esc(ntd(mod.price))}${esc(t(lang, "perEvent"))}</span>`
      : "";
  const toggle =
    mod.tier === "soon"
      ? `<button type="button" class="switch" disabled>${esc(t(lang, "locked"))}</button>`
      : `<button type="button" class="switch ${on ? "on" : ""}" role="switch" aria-checked="${on}" data-action="toggle" data-id="${id}">${esc(on ? t(lang, "on") : t(lang, "off"))}</button>`;
  return `<article class="mod tier-${mod.tier} ${on ? "on" : ""}" data-module="${id}">
    <div class="mod-top"><span class="badge tier-${mod.tier}">${esc(tierLabel)}</span>${price}</div>
    <h3>${esc(copy.name)}</h3>
    <p>${esc(copy.blurb)}</p>
    ${toggle}
  </article>`;
}

function outputsHtml(): string {
  const lang = state.lang;
  if (!state.outputs || state.outputs.length === 0) {
    return `<section class="view empty-out">
      <p class="eyebrow">${esc(t(lang, "navOutputs"))}</p>
      <h1>${esc(t(lang, "outEmptyTitle"))}</h1>
      <p class="lead">${esc(t(lang, "outEmptyBody"))}</p>
      <div class="btn-row">
        <button type="button" class="btn" data-action="load-sample">${esc(t(lang, "loadSample"))}</button>
        <button type="button" class="btn secondary" data-action="nav" data-view="brief">${esc(t(lang, "goBrief"))}</button>
      </div>
    </section>`;
  }
  const off = MODULES.filter((mod) => mod.tier !== "soon" && !state.enabled[mod.id]);
  const skipped = off.length
    ? `<p class="quiet">${esc(tf(lang, "skipped", { list: off.map((mod) => moduleCopy(lang, mod.id).name).join(lang === "zh" ? "、" : ", ") }))}</p>`
    : "";
  const ran = state.ranAt
    ? `<p class="quiet">${esc(tf(lang, "ranAt", { time: new Date(state.ranAt).toLocaleString(lang === "zh" ? "zh-Hant" : "en-US") }))}</p>`
    : "";
  const jumps = state.outputs
    .map((output) => {
      const name = moduleCopy(lang, output.id).name;
      return `<button type="button" class="chip-btn" data-action="jump" data-target="out-${output.id}">${esc(name)}</button>`;
    })
    .join("");
  const cards = state.outputs
    .map((output) => {
      const meta = MODULES.find((mod) => mod.id === output.id);
      const tier = meta?.tier === "addon" ? t(lang, "tierAddon") : t(lang, "tierIncluded");
      return `<article class="out-card" id="out-${output.id}">
        <header class="out-head">
          <div>
            <p class="eyebrow">${esc(tier)}</p>
            <h2>${esc(moduleCopy(lang, output.id).name)}</h2>
          </div>
          <span class="pill">${esc(t(lang, "previewOnly"))}</span>
        </header>
        ${output.blocks.map((block) => blockHtml(block)).join("")}
      </article>`;
    })
    .join("");
  return `<section class="view">
    <div class="view-head">
      <div>
        <p class="eyebrow">${esc(t(lang, "navOutputs"))}</p>
        <h1>${esc(t(lang, "outTitle"))}</h1>
        ${ran}
      </div>
    </div>
    <p class="banner" id="success">${esc(tf(lang, "successBanner", { n: state.outputs.length }))}</p>
    <p class="banner warn" id="stale" ${state.stale ? "" : "hidden"}>${esc(t(lang, "stale"))}</p>
    ${skipped}
    <div class="jumps" aria-label="${esc(t(lang, "jump"))}">${jumps}</div>
    ${cards}
  </section>`;
}

export function render(options?: { keepScroll?: boolean }): void {
  const scroller = document.querySelector(".main");
  const y = options?.keepScroll ? (scroller?.scrollTop ?? 0) : 0;
  resetBins();
  seq = 0;
  document.documentElement.lang = state.lang === "zh" ? "zh-Hant" : "en";
  document.title = t(state.lang, "docTitle");
  const app = document.querySelector("#app");
  if (!app) return;
  app.innerHTML = shell();
  if (options?.keepScroll) {
    const next = document.querySelector(".main");
    if (next) next.scrollTop = y;
  }
}

export function missingSummary(): string {
  const lang = state.lang;
  const missing = missingFields(state.brief);
  if (!missing.length) return "";
  return tf(lang, "needFields", {
    list: missing.map((key) => fieldLabel(key, lang)).join(lang === "zh" ? "、" : ", "),
  });
}
