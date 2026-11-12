import { copyBin, fileBin } from "./bins";
import { missingFields, esc } from "./format";
import { generateAll } from "./generate";
import { api, type Attendee, type DeskState, type Report } from "./api";
import { sampleBrief } from "./sample";
import { persist, state } from "./state";
import type { Block, ModuleId } from "./types";

const en = {
  kicker: "PayPal sandbox · USD",
  title: "Officer money desk",
  generate: "Generate channel copy",
  generating: "Generating…",
  noCopy: "No previews yet. Generate Instagram, Stories, LINE, and Gmail from this event. Nothing is published.",
  copy: "Copy",
  openOutputs: "Full output gallery",
  reset: "Reset money demo",
  roster: "Roster",
  invoiceTitle: "Sponsor invoice",
  createDraft: "Create draft",
  send: "Send invoice",
  donationTitle: "Sponsor donation",
  duesTitle: "Monthly dues",
  publish: "Publish plan to PayPal",
  subscribe: "Start subscription",
  reportTitle: "Reimbursement report",
  reportBuild: "Build report",
  reportCsv: "Download CSV",
  chatTitle: "Officer agent",
  sendChat: "Send",
  confirm: "Confirm",
  cancel: "Cancel",
  outbox: "Outbox",
  emptyOutbox: "No emails yet. Receipts land here when SMTP or Resend is not set.",
  webhook: "Simulate capture webhook",
  refund: "Refund",
  payout: "Pay speaker fee",
  mockPay: "Pay",
  setupOff: "Money actions are off until sandbox keys or MOCK_PAYPAL=1.",
  name: "Name",
  email: "Email",
  amount: "Amount USD",
  memo: "Memo",
  member: "Member",
  role: "Role",
  status: "Status",
  fee: "Amount",
  action: "Action",
  when: "When",
  where: "Where",
  capacity: "Seats",
  regFee: "Registration",
  speakerFee: "Speaker fee",
  duesFee: "Dues",
  prompts: "Try",
  paidWord: "paid",
  tools: "Tools",
  nothingMoved: "Nothing moves until you confirm.",
  approve: "Sandbox buyer approves in the PayPal window.",
};

const zh: typeof en = {
  kicker: "PayPal 沙盒 · 美元",
  title: "幹部金流桌",
  generate: "產出管道文案",
  generating: "產出中…",
  noCopy: "還沒有預覽。從這場活動產出 Instagram、限動、LINE 和 Gmail。不會發布。",
  copy: "複製",
  openOutputs: "完整產出",
  reset: "重置金流示範",
  roster: "名單",
  invoiceTitle: "贊助發票",
  createDraft: "建立草稿",
  send: "寄出發票",
  donationTitle: "贊助捐款",
  duesTitle: "每月社費",
  publish: "把方案送到 PayPal",
  subscribe: "建立訂閱",
  reportTitle: "報銷對帳",
  reportBuild: "產生報表",
  reportCsv: "下載 CSV",
  chatTitle: "幹部代理人",
  sendChat: "送出",
  confirm: "確認",
  cancel: "取消",
  outbox: "寄件匣",
  emptyOutbox: "還沒有信。沒有設定 SMTP 或 Resend 時，收據會出現在這裡。",
  webhook: "模擬收款 webhook",
  refund: "退款",
  payout: "付講者費",
  mockPay: "付款",
  setupOff: "還沒有沙盒金鑰，而且 MOCK_PAYPAL=0，金流按鈕先關掉。",
  name: "姓名",
  email: "Email",
  amount: "金額（美元）",
  memo: "備註",
  member: "社員",
  role: "角色",
  status: "狀態",
  fee: "金額",
  action: "動作",
  when: "時間",
  where: "地點",
  capacity: "名額",
  regFee: "報名費",
  speakerFee: "講者費",
  duesFee: "月費",
  prompts: "可以問",
  paidWord: "已付",
  tools: "工具",
  nothingMoved: "你按確認之前，錢不會動。",
  approve: "沙盒買家會在 PayPal 視窗裡同意。",
};

type Copy = typeof en;
type UiConfirm = { action: "refund" | "payout" | "send-invoice"; id: string; text: string };
type ChatConfirm = { id: string; summary: string };
type Turn = { role: "user" | "assistant"; content: string; confirm?: ChatConfirm; tools?: string[] };

let snap: DeskState | null = null;
let report: Report | null = null;
let turns: Turn[] = [];
let draft = "";
let flash = "";
let pendingUi: UiConfirm | null = null;
let busy = false;
let seq = 0;
let generating = false;
const apiRoot = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

function L(): Copy {
  return state.lang === "zh" ? zh : en;
}

function suggestions(): string[] {
  return state.lang === "zh"
    ? ["誰還沒付報名費？", "退款給 Mia Chen", "寄出 Lane Lab 的贊助發票", "支付 Ken Lin 的講者費", "做報銷對帳"]
    : [
        "Who has not paid?",
        "Refund Mia Chen",
        "Send the Lane Lab sponsorship invoice",
        "Pay Ken Lin's speaker fee",
        "Build the reimbursement report",
      ];
}

function pinCopy(text: string): string {
  const id = `desk-c${seq++}`;
  copyBin.set(id, text);
  return id;
}

function pinFile(filename: string, dataUrl: string, alt: string): string {
  const id = `desk-f${seq++}`;
  fileBin.set(id, { filename, dataUrl, alt });
  return id;
}

function statusLabel(status: Attendee["status"]): string {
  if (state.lang === "zh") {
    if (status === "paid") return "已付";
    if (status === "unpaid") return "未付";
    if (status === "refunded") return "已退";
    return "已捐";
  }
  return status;
}

function roleLabel(role: Attendee["role"]): string {
  if (state.lang === "zh") {
    if (role === "speaker") return "講者";
    if (role === "donor") return "捐款";
    return "參加者";
  }
  return role;
}

async function load(): Promise<void> {
  try {
    snap = await api<DeskState>("/api/state");
  } catch (error) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    try {
      snap = await api<DeskState>("/api/state");
    } catch {
      throw error;
    }
  }
  paint();
}

function paint(): void {
  const root = document.querySelector("#desk");
  if (!root || !snap) return;
  const copy = L();
  const off = snap.mode === "setup";
  root.innerHTML = `<div class="desk-banner ${snap.mode}">${esc(snap.banner)}</div>
    ${flash ? `<p class="note ${flash.startsWith("!") ? "note-warn" : ""}">${esc(flash.replace(/^!/, ""))}</p>` : ""}
    <div class="desk-grid">
      ${left(copy)}
      ${middle(copy, off)}
      ${right(copy, off)}
    </div>`;
  const input = document.querySelector<HTMLTextAreaElement>("#chat-input");
  if (input) input.value = draft;
  const transcript = document.querySelector("#transcript");
  if (transcript) transcript.scrollTop = transcript.scrollHeight;
  void mountPaypal();
}

function left(copy: Copy): string {
  if (!snap) return "";
  const event = snap.event;
  return `<section class="desk-col" aria-label="${esc(copy.title)}">
    <p class="eyebrow">${esc(copy.kicker)}</p>
    <h2>${esc(copy.title)}</h2>
    <h3>${esc(event.title)}</h3>
    <p>${esc(event.clubName)}</p>
    <dl class="kv">
      <div class="kv-row"><dt>${esc(copy.when)}</dt><dd>${esc(`${event.date} ${event.startTime}–${event.endTime}`)}</dd></div>
      <div class="kv-row"><dt>${esc(copy.where)}</dt><dd>${esc(event.venue)}</dd></div>
      <div class="kv-row"><dt>${esc(copy.capacity)}</dt><dd>${esc(event.capacity)}</dd></div>
      <div class="kv-row"><dt>${esc(copy.regFee)}</dt><dd>${esc(event.registrationUsd)} USD</dd></div>
      <div class="kv-row"><dt>${esc(copy.speakerFee)}</dt><dd>${esc(event.speakerName)} · ${esc(event.speakerFeeUsd)} USD</dd></div>
      <div class="kv-row"><dt>${esc(copy.duesFee)}</dt><dd>${esc(event.duesUsd)} USD / month</dd></div>
    </dl>
    <div class="btn-row">
      <button type="button" class="btn tiny" data-desk="generate" ${generating ? "disabled" : ""}>${esc(generating ? copy.generating : copy.generate)}</button>
      <button type="button" class="btn tiny secondary" data-action="nav" data-view="outputs">${esc(copy.openOutputs)}</button>
    </div>
    <div class="desk-copy">${previews(copy)}</div>
  </section>`;
}

function previews(copy: Copy): string {
  const outputs = state.outputs;
  if (!outputs?.length) return `<p class="quiet">${esc(copy.noCopy)}</p>`;
  const chunks: string[] = [];
  for (const output of outputs) {
    if (!["ig-post", "ig-story", "line", "gmail"].includes(output.id)) continue;
    for (const block of output.blocks) chunks.push(blockHtml(block, copy));
  }
  return chunks.filter(Boolean).join("") || `<p class="quiet">${esc(copy.noCopy)}</p>`;
}

function blockHtml(block: Block, copy: Copy): string {
  if (block.type === "text") {
    return `<section class="block"><div class="block-bar"><h4>${esc(block.label)}</h4><button type="button" class="btn tiny secondary" data-action="copy" data-copy="${pinCopy(block.text)}">${esc(copy.copy)}</button></div><div class="prose">${esc(block.text.slice(0, 900))}</div></section>`;
  }
  if (block.type === "tags") {
    return `<section class="block"><div class="block-bar"><h4>${esc(block.label)}</h4><button type="button" class="btn tiny secondary" data-action="copy" data-copy="${pinCopy(block.tags.join(" "))}">${esc(copy.copy)}</button></div><div class="tags">${block.tags.map((tag) => `<span>${esc(tag)}</span>`).join("")}</div></section>`;
  }
  if (block.type === "line") {
    return `<section class="block"><div class="block-bar"><h4>${esc(block.label)}</h4><button type="button" class="btn tiny secondary" data-action="copy" data-copy="${pinCopy(block.text)}">${esc(copy.copy)}</button></div><div class="prose">${esc(block.text.slice(0, 700))}</div></section>`;
  }
  if (block.type === "mail") {
    return `<section class="block"><div class="block-bar"><h4>${esc(block.subject)}</h4><button type="button" class="btn tiny secondary" data-action="copy" data-copy="${pinCopy(block.text)}">${esc(copy.copy)}</button></div><div class="prose">${esc(block.text.slice(0, 500))}</div></section>`;
  }
  if (block.type === "image" && block.dataUrl) {
    const file = pinFile(block.filename, block.dataUrl, block.alt);
    return `<figure class="shot shot-${block.height > block.width ? "story" : "feed"}"><img src="${block.dataUrl}" alt="${esc(block.alt)}" data-action="zoom" data-file="${file}" /></figure>`;
  }
  return "";
}

function middle(copy: Copy, off: boolean): string {
  if (!snap) return "";
  const disabled = off ? "disabled" : "";
  const confirm = pendingUi
    ? `<div class="confirm-card"><p>${esc(pendingUi.text)}</p><p class="quiet">${esc(copy.nothingMoved)}</p><div class="btn-row"><button type="button" class="btn tiny" data-desk="confirm-ui" ${disabled}>${esc(copy.confirm)}</button><button type="button" class="btn tiny secondary" data-desk="cancel-ui">${esc(copy.cancel)}</button></div></div>`
    : "";
  const rows = snap.attendees
    .map((row) => {
      const cert = snap?.certificates.find((item) => item.attendeeId === row.id);
      return `<tr>
        <td><strong>${esc(row.name)}</strong><br><span class="quiet">${esc(row.email)}</span></td>
        <td>${esc(roleLabel(row.role))}</td>
        <td><span class="pill st-${esc(row.status)}">${esc(statusLabel(row.status))}</span></td>
        <td>${esc(row.amountUsd)}</td>
        <td>${actionCell(row, copy, off, cert?.id)}</td>
      </tr>`;
    })
    .join("");
  const event = snap.event;
  const plan = snap.plans[0];
  const subs = snap.subscriptions
    .map(
      (item) =>
        `<li>${esc(item.name)} · ${esc(item.amountUsd)} USD · ${esc(item.status)}${item.approveUrl ? ` · <a href="${esc(item.approveUrl)}" target="_blank" rel="noreferrer">Approve in PayPal</a>` : ""}</li>`,
    )
    .join("");
  return `<section class="desk-col" aria-label="${esc(copy.roster)}">
    ${confirm}
    <div class="desk-head"><h2>${esc(copy.roster)}</h2><button type="button" class="btn tiny secondary" data-desk="reset">${esc(copy.reset)}</button></div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>${esc(copy.name)}</th><th>${esc(copy.role)}</th><th>${esc(copy.status)}</th><th>${esc(copy.fee)}</th><th>${esc(copy.action)}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <button type="button" class="btn tiny secondary" data-desk="webhook" ${disabled}>${esc(copy.webhook)}</button>
    <form class="desk-card" data-desk-form="invoice">
      <h3>${esc(copy.invoiceTitle)}</h3>
      <label>${esc(copy.name)}<input name="sponsorName" value="${esc(event.sponsorName)}" ${disabled} /></label>
      <label>${esc(copy.email)}<input name="sponsorEmail" type="email" value="${esc(event.sponsorEmail)}" ${disabled} /></label>
      <label>${esc(copy.amount)}<input name="amount" value="${esc(event.sponsorInvoiceUsd)}" ${disabled} /></label>
      <label>${esc(copy.memo)}<input name="memo" value="${esc(`Sponsorship for ${event.title}`)}" ${disabled} /></label>
      <button type="submit" class="btn tiny" ${disabled}>${esc(copy.createDraft)}</button>
      <ul class="quiet">${snap.invoices.map((item) => `<li>${esc(item.number)} · ${esc(item.amountUsd)} USD · ${esc(item.status)} ${item.status === "draft" ? `<button type="button" class="btn tiny secondary" data-desk="ask-invoice" data-id="${esc(item.id)}" ${disabled}>${esc(copy.send)}</button>` : ""}</li>`).join("")}</ul>
    </form>
    <form id="donation-form" class="desk-card" data-desk-form="donation">
      <h3>${esc(copy.donationTitle)}</h3>
      <label>${esc(copy.name)}<input name="donorName" value="Riley Patron" ${disabled} /></label>
      <label>${esc(copy.email)}<input name="donorEmail" type="email" value="riley.patron@example.com" ${disabled} /></label>
      <label>${esc(copy.amount)}<input name="amount" value="${esc(event.donationUsd)}" ${disabled} /></label>
      ${off ? "" : snap.mode === "sandbox" ? `<div id="pp-donation"></div><p class="quiet">${esc(copy.approve)}</p>` : `<button type="submit" class="btn tiny">${esc(copy.mockPay)} ${esc(event.donationUsd)} USD</button>`}
    </form>
    <form class="desk-card" data-desk-form="dues">
      <h3>${esc(copy.duesTitle)}</h3>
      <p>${esc(plan ? `${plan.name} · ${plan.amountUsd} USD/month · ${plan.status}` : "")}</p>
      <button type="button" class="btn tiny secondary" data-desk="publish-plan" ${disabled}>${esc(copy.publish)}</button>
      <label>${esc(copy.member)}<input name="memberName" value="Noah Patel" ${disabled} /></label>
      <label>${esc(copy.email)}<input name="memberEmail" type="email" value="noah.patel@example.com" ${disabled} /></label>
      <button type="submit" class="btn tiny" ${disabled}>${esc(copy.subscribe)}</button>
      <ul>${subs}</ul>
    </form>
    <div class="desk-card">
      <h3>${esc(copy.reportTitle)}</h3>
      <div class="btn-row">
        <button type="button" class="btn tiny" data-desk="report">${esc(copy.reportBuild)}</button>
        <a class="btn tiny secondary" href="${esc(apiRoot)}/api/reports/reimbursement.csv">${esc(copy.reportCsv)}</a>
      </div>
      ${reportHtml()}
    </div>
  </section>`;
}

function actionCell(row: Attendee, copy: Copy, off: boolean, certId?: string): string {
  const disabled = off ? "disabled" : "";
  if (row.role === "speaker") {
    if (row.status === "paid") return esc(copy.paidWord);
    return `<button type="button" class="btn tiny" data-desk="ask-payout" data-id="${esc(row.id)}" ${disabled}>${esc(copy.payout)}</button>`;
  }
  if (row.role === "donor") {
    return certId ? `<a href="${esc(apiRoot)}/api/certificates/${esc(certId)}.pdf" target="_blank" rel="noreferrer">${esc(state.lang === "zh" ? "證書" : "Certificate")}</a>` : esc(statusLabel(row.status));
  }
  if (row.status === "unpaid" && snap?.mode === "sandbox") return `<div id="pp-${esc(row.id)}" class="paypal-slot"></div>`;
  if (row.status === "unpaid") return `<button type="button" class="btn tiny" data-desk="mock-pay" data-id="${esc(row.id)}" ${disabled}>${esc(copy.mockPay)} ${esc(row.amountUsd)} USD</button>`;
  if (row.status === "paid" || row.status === "donated") {
    return `<button type="button" class="btn tiny secondary" data-desk="ask-refund" data-id="${esc(row.id)}" ${disabled}>${esc(copy.refund)}</button>`;
  }
  return "—";
}

function reportHtml(): string {
  if (!report) return "";
  const rows = report.rows
    .slice(0, 12)
    .map(
      (row) =>
        `<tr><td>${esc(row.type)}</td><td>${esc(row.counterparty)}</td><td>${esc(row.amountUsd)}</td><td>${esc(row.source)}</td></tr>`,
    )
    .join("");
  return `<p class="quiet">${esc(report.notice)}</p>
    <p><strong>Net ${esc(report.totals.netUsd)} USD</strong> · in ${esc(report.totals.inflowUsd)} · refunds ${esc(report.totals.refundUsd)} · payouts ${esc(report.totals.payoutUsd)} · invoices ${esc(report.totals.invoiceUsd)}</p>
    <p class="quiet">${esc(report.source)}${report.paypalRows.length ? ` · PayPal rows ${report.paypalRows.length}` : ""}</p>
    <table class="data"><tbody>${rows}</tbody></table>`;
}

function right(copy: Copy, off: boolean): string {
  if (!snap) return "";
  const ai = snap.ai.provider === "openai" ? snap.ai.model : state.lang === "zh" ? "規則解析（沒有模型金鑰）" : "rules parser (no model key)";
  const toolkit = snap.ai.toolkit ? " · PayPal agent toolkit" : "";
  const bubbles = turns
    .map((turn) => {
      const confirm = turn.confirm
        ? `<div class="confirm-card"><p>${esc(turn.confirm.summary)}</p><div class="btn-row"><button type="button" class="btn tiny" data-desk="agent-confirm" data-id="${esc(turn.confirm.id)}" ${off ? "disabled" : ""}>${esc(copy.confirm)}</button><button type="button" class="btn tiny secondary" data-desk="agent-cancel" data-id="${esc(turn.confirm.id)}">${esc(copy.cancel)}</button></div></div>`
        : "";
      const tools = turn.tools?.length ? `<p class="quiet">${esc(copy.tools)}: ${esc(turn.tools.join(", "))}</p>` : "";
      return `<article class="bubble ${turn.role}"><p>${esc(turn.content)}</p>${tools}${confirm}</article>`;
    })
    .join("");
  const mails = snap.outbox
    .slice(0, 6)
    .map(
      (mail) =>
        `<details><summary>${esc(mail.kind)} · ${esc(mail.to)}</summary><p><strong>${esc(mail.subject)}</strong></p><pre class="code">${esc(mail.text)}</pre><p class="quiet">${esc(mail.delivered)}</p></details>`,
    )
    .join("");
  const hooks = snap.webhooks
    .slice(0, 4)
    .map((hook) => `<li>${esc(hook.type)} · ${esc(hook.summary)}${hook.verified ? " · verified" : ""}</li>`)
    .join("");
  return `<section class="desk-col" aria-label="${esc(copy.chatTitle)}">
    <p class="eyebrow">${esc(ai)}${esc(toolkit)}${snap.ai.toolCount ? ` · ${snap.ai.toolCount}` : ""}</p>
    <h2>${esc(copy.chatTitle)}</h2>
    <div class="prompts">${suggestions().map((prompt) => `<button type="button" class="btn tiny secondary" data-desk="prompt" data-prompt="${esc(prompt)}">${esc(prompt)}</button>`).join("")}</div>
    <div class="transcript" id="transcript">${bubbles || `<p class="quiet">${esc(copy.nothingMoved)}</p>`}</div>
    <form data-desk-form="chat" class="chat-form">
      <textarea id="chat-input" name="message" rows="3" placeholder="${esc(state.lang === "zh" ? "例如：退款給 Mia Chen" : "Example: Refund Mia Chen")}"></textarea>
      <button type="submit" class="btn tiny" ${busy ? "disabled" : ""}>${esc(copy.sendChat)}</button>
    </form>
    <h3>${esc(copy.outbox)}</h3>
    ${mails || `<p class="quiet">${esc(copy.emptyOutbox)}</p>`}
    ${hooks ? `<ul class="quiet">${hooks}</ul>` : ""}
  </section>`;
}

let sdkPromise: Promise<void> | null = null;
let sdkClient = "";

function loadSdk(clientId: string): Promise<void> {
  if (window.paypal && sdkClient === clientId) return Promise.resolve();
  if (sdkPromise && sdkClient === clientId) return sdkPromise;
  sdkClient = clientId;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal JS SDK failed to load."));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

async function mountPaypal(): Promise<void> {
  if (!snap || snap.mode !== "sandbox" || !snap.clientId) return;
  try {
    await loadSdk(snap.clientId);
  } catch (error) {
    flash = `!${error instanceof Error ? error.message : "PayPal JS SDK failed to load."}`;
    return;
  }
  if (!window.paypal) return;
  const paypal = window.paypal;
  for (const row of snap.attendees) {
    if (row.role !== "attendee" || row.status !== "unpaid") continue;
    const slot = document.querySelector(`#pp-${CSS.escape(row.id)}`);
    if (!slot || slot.childElementCount) continue;
    paypal
      .Buttons({
        style: { layout: "horizontal", height: 32, label: "pay" },
        createOrder: () => createOrder({ kind: "registration", attendeeId: row.id }),
        onApprove: (data: { orderID: string }) => capture(data.orderID),
        onError: (error: unknown) => fail(error),
      })
      .render(`#pp-${CSS.escape(row.id)}`);
  }
  const donation = document.querySelector("#pp-donation");
  if (donation && !donation.childElementCount) {
    paypal
      .Buttons({
        style: { layout: "horizontal", height: 32, label: "donate" },
        createOrder: () => {
          const form = document.querySelector<HTMLFormElement>("#donation-form");
          const data = form ? new FormData(form) : new FormData();
          return createOrder({
            kind: "donation",
            donorName: String(data.get("donorName") ?? ""),
            donorEmail: String(data.get("donorEmail") ?? ""),
            amount: String(data.get("amount") ?? ""),
          });
        },
        onApprove: (data: { orderID: string }) => capture(data.orderID),
        onError: (error: unknown) => fail(error),
      })
      .render("#pp-donation");
  }
}

async function createOrder(body: Record<string, string>): Promise<string> {
  const created = await api<{ id: string }>("/api/checkout/orders", { method: "POST", body: JSON.stringify(body) });
  return created.id;
}

async function capture(orderId: string): Promise<void> {
  await api(`/api/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", body: "{}" });
  flash = state.lang === "zh" ? "付款已入帳，收據在右邊寄件匣。" : "Payment captured. The receipt is in the outbox.";
  await load();
}

function fail(error: unknown): void {
  flash = `!${error instanceof Error ? error.message : "Something went wrong."}`;
  const root = document.querySelector("#desk");
  if (!snap && root) {
    root.innerHTML = `<p class="note note-warn">${esc(flash.replace(/^!/, ""))}</p><p class="quiet">The API should be on port 8787. Run npm run dev, then reload.</p>`;
    return;
  }
  paint();
}

async function act(run: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    await run();
  } catch (error) {
    flash = `!${error instanceof Error ? error.message : "Something went wrong."}`;
  } finally {
    busy = false;
  }
  try {
    await load();
  } catch (error) {
    fail(error);
  }
}

async function onDesk(name: string, el: HTMLElement): Promise<void> {
  if (!snap) return;
  if (name === "generate") {
    generating = true;
    paint();
    try {
      if (missingFields(state.brief).length) {
        state.brief = sampleBrief(state.lang);
        state.briefSource = "sample";
        state.showErrors = false;
      }
      const ids: ModuleId[] = ["ig-post", "ig-story", "line", "gmail"];
      state.outputs = await generateAll(state.brief, state.lang, ids);
      state.ranAt = Date.now();
      state.stale = false;
      persist();
      flash = state.lang === "zh" ? "文案好了，沒有發布到任何管道。" : "Channel copy is ready. Nothing was published.";
    } catch (error) {
      flash = `!${error instanceof Error ? error.message : "Copy failed."}`;
    } finally {
      generating = false;
      paint();
    }
    return;
  }
  if (name === "reset") {
    if (!window.confirm(state.lang === "zh" ? "重置名單、發票和寄件匣？" : "Reset the roster, invoices, and outbox?")) return;
    report = null;
    pendingUi = null;
    await act(async () => {
      await api("/api/demo/reset", { method: "POST", body: "{}" });
      flash = state.lang === "zh" ? "已回到示範資料。" : "Demo money data is back to the seed.";
    });
    return;
  }
  if (name === "mock-pay") {
    const attendeeId = el.dataset.id ?? "";
    await act(async () => {
      const created = await api<{ id: string }>("/api/checkout/orders", {
        method: "POST",
        body: JSON.stringify({ kind: "registration", attendeeId }),
      });
      await api(`/api/checkout/orders/${encodeURIComponent(created.id)}/capture`, { method: "POST", body: "{}" });
      flash = state.lang === "zh" ? "模擬付款完成，收據在寄件匣。" : "Mock payment captured. Receipt is in the outbox.";
    });
    return;
  }
  if (name === "ask-refund") {
    const row = snap.attendees.find((item) => item.id === el.dataset.id);
    if (!row) return;
    pendingUi = { action: "refund", id: row.id, text: `${L().refund} ${row.amountUsd} USD → ${row.name}?` };
    paint();
    return;
  }
  if (name === "ask-payout") {
    const row = snap.attendees.find((item) => item.id === el.dataset.id);
    if (!row) return;
    pendingUi = { action: "payout", id: row.id, text: `${L().payout}: ${row.amountUsd} USD → ${row.name} (${row.email})?` };
    paint();
    return;
  }
  if (name === "ask-invoice") {
    const invoice = snap.invoices.find((item) => item.id === el.dataset.id);
    if (!invoice) return;
    pendingUi = {
      action: "send-invoice",
      id: invoice.id,
      text: `${L().send} ${invoice.number} · ${invoice.amountUsd} USD → ${invoice.sponsorEmail}?`,
    };
    paint();
    return;
  }
  if (name === "cancel-ui") {
    pendingUi = null;
    paint();
    return;
  }
  if (name === "confirm-ui" && pendingUi) {
    const current = pendingUi;
    pendingUi = null;
    await act(async () => {
      if (current.action === "refund") {
        await api("/api/refunds", { method: "POST", body: JSON.stringify({ attendeeId: current.id }) });
        flash = state.lang === "zh" ? "已退款，名單已更新。" : "Refunded. The roster is updated.";
      } else if (current.action === "payout") {
        await api("/api/payouts", { method: "POST", body: JSON.stringify({ attendeeId: current.id }) });
        flash = state.lang === "zh" ? "講者費已送出。" : "Speaker payout submitted.";
      } else {
        await api(`/api/invoices/${encodeURIComponent(current.id)}/send`, { method: "POST", body: "{}" });
        flash = state.lang === "zh" ? "發票已寄出，副本在寄件匣。" : "Invoice sent. A copy is in the outbox.";
      }
    });
    return;
  }
  if (name === "webhook") {
    const target = snap.attendees.find((row) => row.role === "attendee" && row.status === "unpaid");
    if (!target) {
      flash = state.lang === "zh" ? "沒有未付的參加者可以模擬。" : "No unpaid attendee left to simulate.";
      paint();
      return;
    }
    await act(async () => {
      await api("/api/paypal/webhook/simulate", { method: "POST", body: JSON.stringify({ attendeeId: target.id }) });
      flash = state.lang === "zh" ? `已用 webhook 把 ${target.name} 標成已付。` : `Webhook handler marked ${target.name} paid.`;
    });
    return;
  }
  if (name === "publish-plan") {
    await act(async () => {
      await api("/api/billing/plans", { method: "POST", body: "{}" });
      flash = state.lang === "zh" ? "月費方案已建立。" : "Dues plan published.";
    });
    return;
  }
  if (name === "report") {
    await act(async () => {
      report = await api<Report>("/api/reports/reimbursement");
      flash = state.lang === "zh" ? "對帳表在名單下方，也可以下載 CSV。" : "Report is under the roster. CSV is ready too.";
    });
    return;
  }
  if (name === "prompt") {
    draft = el.dataset.prompt ?? "";
    paint();
    document.querySelector<HTMLTextAreaElement>("#chat-input")?.focus();
    return;
  }
  if (name === "agent-cancel") {
    await api("/api/agent/cancel", { method: "POST", body: JSON.stringify({ id: el.dataset.id }) });
    const turn = [...turns].reverse().find((item) => item.confirm?.id === el.dataset.id);
    if (turn) turn.confirm = undefined;
    paint();
    return;
  }
  if (name === "agent-confirm") {
    const id = el.dataset.id ?? "";
    await act(async () => {
      const result = await api<{ reply: string }>("/api/agent/confirm", { method: "POST", body: JSON.stringify({ id }) });
      const turn = [...turns].reverse().find((item) => item.confirm?.id === id);
      if (turn) turn.confirm = undefined;
      turns.push({ role: "assistant", content: result.reply });
      flash = result.reply;
    });
  }
}

async function onSubmit(form: HTMLFormElement): Promise<void> {
  const kind = form.dataset.deskForm;
  const data = new FormData(form);
  if (kind === "chat") {
    const message = String(data.get("message") ?? "").trim();
    if (!message) return;
    draft = "";
    turns.push({ role: "user", content: message });
    paint();
    await act(async () => {
      const history = turns.slice(0, -1).map((turn) => ({ role: turn.role, content: turn.content }));
      const result = await api<{ reply: string; confirm: ChatConfirm | null; provider: string; tools: string[] }>("/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({ message, history }),
      });
      turns.push({
        role: "assistant",
        content: result.reply,
        confirm: result.confirm ?? undefined,
        tools: result.tools,
      });
    });
    return;
  }
  if (kind === "invoice") {
    await act(async () => {
      await api("/api/invoices", {
        method: "POST",
        body: JSON.stringify({
          sponsorName: String(data.get("sponsorName") ?? ""),
          sponsorEmail: String(data.get("sponsorEmail") ?? ""),
          amount: String(data.get("amount") ?? ""),
          memo: String(data.get("memo") ?? ""),
        }),
      });
      flash = state.lang === "zh" ? "發票草稿好了。寄出前還要再確認一次。" : "Invoice draft created. Sending still needs a confirm.";
    });
    return;
  }
  if (kind === "donation") {
    if (snap?.mode === "sandbox") return;
    await act(async () => {
      const created = await api<{ id: string }>("/api/checkout/orders", {
        method: "POST",
        body: JSON.stringify({
          kind: "donation",
          donorName: String(data.get("donorName") ?? ""),
          donorEmail: String(data.get("donorEmail") ?? ""),
          amount: String(data.get("amount") ?? ""),
        }),
      });
      await api(`/api/checkout/orders/${encodeURIComponent(created.id)}/capture`, { method: "POST", body: "{}" });
      flash = state.lang === "zh" ? "捐款已入帳，感謝信和證書在寄件匣。" : "Donation captured. Thank-you email and certificate are ready.";
    });
    return;
  }
  if (kind === "dues") {
    await act(async () => {
      const result = await api<{ status: string; approveUrl?: string }>("/api/billing/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          name: String(data.get("memberName") ?? ""),
          email: String(data.get("memberEmail") ?? ""),
        }),
      });
      flash = result.approveUrl
        ? state.lang === "zh"
          ? "訂閱已建立，請用 PayPal 連結完成同意。"
          : "Subscription created. The member still approves the PayPal link."
        : state.lang === "zh"
          ? "模擬訂閱已生效。"
          : "Mock subscription is active.";
    });
  }
}

export function mountDesk(): void {
  const root = document.querySelector("#desk");
  if (!root) return;
  if (root.getAttribute("data-bound") !== "1") {
    root.setAttribute("data-bound", "1");
    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest<HTMLElement>("[data-desk]");
      if (!el || !root.contains(el)) return;
      event.preventDefault();
      event.stopPropagation();
      void onDesk(el.dataset.desk ?? "", el);
    });
    root.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.dataset.deskForm) return;
      event.preventDefault();
      event.stopPropagation();
      void onSubmit(form);
    });
    root.addEventListener("input", (event) => {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement && target.id === "chat-input") draft = target.value;
    });
  }
  if (!snap) {
    load().catch(fail);
    return;
  }
  paint();
}

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: Record<string, unknown>) => { render: (selector: string) => Promise<void> };
    };
  }
}
