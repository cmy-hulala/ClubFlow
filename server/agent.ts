import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { aiStatus, config } from "./config.js";
import { reconcile, publishDuesPlan } from "./money.js";
import { nid, nowIso, readStore, rememberPending, usd } from "./store.js";
import type { Attendee, InvoiceRecord, PendingAction } from "./types.js";

type Tool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

type ToolCall = { id: string; type?: string; function: { name: string; arguments: string } };

type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatResult = {
  reply: string;
  confirm: { id: string; summary: string; action: PendingAction["action"] } | null;
  provider: "openai" | "rules";
  tools: string[];
};

let toolkit: PayPalAgentToolkit | null = null;
let toolkitError: string | null = null;

const HELD = new Set([
  "send_invoice",
  "create_refund",
  "pay_order",
  "record_payment_for_invoice",
  "record_refund_for_invoice",
]);

export async function ensureToolkit(): Promise<PayPalAgentToolkit | null> {
  if (config.mode !== "sandbox" || !config.clientId || !config.clientSecret) return null;
  if (toolkit || toolkitError) return toolkit;
  try {
    toolkit = new PayPalAgentToolkit({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      configuration: {
        actions: {
          orders: { create: true, get: true, capture: true },
          invoices: { create: true, list: true, get: true, send: true },
          products: { create: true, list: true },
          subscriptionPlans: { create: true, list: true, show: true },
          subscriptions: { create: true, show: true, cancel: true },
          payments: { createRefund: true },
          transactions: { list: true },
        },
        context: { sandbox: true },
      },
    });
    return toolkit;
  } catch (error) {
    toolkitError = error instanceof Error ? error.message : "PayPal agent toolkit failed to load";
    return null;
  }
}

export async function agentMeta(): Promise<{ provider: "openai" | "rules"; model: string; toolkit: boolean; toolCount: number }> {
  const kit = await ensureToolkit();
  const status = aiStatus(Boolean(kit));
  const tools = await toolList();
  return { ...status, toolCount: tools.length };
}

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): Tool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, additionalProperties: false, required },
    },
  };
}

function customTools(): Tool[] {
  return [
    fn("club_list_roster", "List the event roster with payment status, amounts, and PayPal ids.", {}),
    fn("club_list_outbox", "List receipt, thank-you, and invoice emails, including ones only rendered in the in-app outbox.", {}),
    fn("club_webhook_status", "Show recent PayPal webhook events handled by ClubFlow. Payouts and webhook state are custom tools because the agent toolkit does not cover them.", {}),
    fn("club_reconcile", "Build the expense reimbursement report from Transaction Search when sandbox data exists, otherwise from the local capture and webhook ledger.", {}),
    fn("create_dues_plan", "Create or publish the monthly club dues product and subscription plan. Buyer approval still happens in PayPal.", {}),
    fn(
      "propose_refund",
      "Ask the officer to confirm a refund. Does not move money until they confirm.",
      { attendeeName: { type: "string", description: "Roster name to refund" } },
      ["attendeeName"],
    ),
    fn(
      "propose_payout",
      "Ask the officer to confirm the speaker-fee payout. Does not move money until they confirm.",
      { note: { type: "string" } },
    ),
    fn(
      "propose_send_invoice",
      "Ask the officer to confirm creating (if needed) and sending a sponsor invoice.",
      {
        sponsorName: { type: "string" },
        sponsorEmail: { type: "string" },
        amountUsd: { type: "string" },
        memo: { type: "string" },
        invoiceId: { type: "string", description: "Existing ClubFlow invoice id, if a draft already exists" },
      },
    ),
  ];
}

function cleanToolkitTools(tools: Tool[]): Tool[] {
  return tools.map((tool) => {
    const parameters = { ...tool.function.parameters };
    delete parameters.$schema;
    return { ...tool, function: { ...tool.function, parameters } };
  });
}

async function toolList(): Promise<Tool[]> {
  const custom = customTools();
  const kit = await ensureToolkit();
  if (!kit) return custom;
  const remote = cleanToolkitTools(kit.getTools() as Tool[]);
  const names = new Set(custom.map((tool) => tool.function.name));
  return [...custom, ...remote.filter((tool) => !names.has(tool.function.name))];
}

function rosterText(): string {
  return readStore()
    .attendees.map(
      (row) =>
        `${row.name} | ${row.role} | ${row.status} | payout ${row.payoutStatus ?? "-"} ${row.payoutDetail ?? ""} | ${row.amountUsd} USD | id ${row.id} | capture ${row.captureId ?? "-"} | order ${row.orderId ?? "-"} | approve ${row.approveUrl ?? "-"}`,
    )
    .join("\n");
}

function people(text: string): Attendee[] {
  const hay = text.toLowerCase();
  const named = readStore().attendees.filter((row) => hay.includes(row.name.toLowerCase()));
  if (named.length) return named;
  return readStore().attendees.filter((row) => {
    const first = row.name.toLowerCase().split(" ")[0] ?? "";
    return first.length > 2 && new RegExp(`\\b${first}\\b`, "i").test(hay);
  });
}

function confirmOf(action: PendingAction): ChatResult["confirm"] {
  return { id: action.id, summary: action.summary, action: action.action };
}

function holdRefund(attendee: Attendee): PendingAction {
  return rememberPending({
    id: nid("cnf"),
    action: "refund",
    attendeeId: attendee.id,
    summary: `Refund ${attendee.amountUsd} USD to ${attendee.name} (${attendee.email}). Capture ${attendee.captureId}.`,
    at: nowIso(),
  });
}

function holdPayout(): PendingAction {
  const speaker = readStore().attendees.find((row) => row.role === "speaker");
  if (!speaker) throw new Error("No speaker is on the roster.");
  if (speaker.status === "paid" || speaker.payoutStatus === "SUCCESS") {
    throw new Error(`${speaker.name} has already been paid ${speaker.amountUsd} USD (payout item SUCCESS).`);
  }
  if (speaker.payoutStatus && !["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED"].includes(speaker.payoutStatus)) {
    throw new Error(
      `${speaker.name}'s payout item is ${speaker.payoutStatus}${speaker.payoutDetail ? ` (${speaker.payoutDetail})` : ""}. Do not say they were paid. Refresh payout status. UNCLAIMED often means RECEIVER_UNREGISTERED until PAYPAL_SPEAKER_EMAIL is a sandbox personal account.`,
    );
  }
  return rememberPending({
    id: nid("cnf"),
    action: "payout",
    attendeeId: speaker.id,
    summary: `Pay ${speaker.name} a ${speaker.amountUsd} USD speaker fee at ${speaker.email}. The roster is paid only if the payout item status comes back SUCCESS.`,
    at: nowIso(),
  });
}

function holdInvoice(input: {
  invoiceId?: string;
  sponsorName: string;
  sponsorEmail: string;
  amountUsd: string;
  memo: string;
}): PendingAction {
  const summary = input.invoiceId
    ? `Send invoice ${input.invoiceId} to ${input.sponsorName} for ${input.amountUsd} USD.`
    : `Create and send a ${input.amountUsd} USD invoice to ${input.sponsorName} <${input.sponsorEmail}>.`;
  return rememberPending({
    id: nid("cnf"),
    action: "send_invoice",
    invoiceId: input.invoiceId,
    sponsorName: input.sponsorName,
    sponsorEmail: input.sponsorEmail,
    amountUsd: input.amountUsd,
    memo: input.memo,
    summary,
    at: nowIso(),
  });
}

function setupBlock(): string | null {
  if (config.mode !== "setup") return null;
  return "Money actions are off. Add PayPal sandbox credentials or set MOCK_PAYPAL=1, then ask again.";
}

async function runCustom(name: string, args: Record<string, unknown>): Promise<{ content: string; confirm: PendingAction | null }> {
  const blocked = setupBlock();
  if (name === "club_list_roster") return { content: rosterText(), confirm: null };
  if (name === "club_list_outbox") {
    const mails = readStore().outbox.slice(0, 8);
    const content = mails.length
      ? mails.map((mail) => `${mail.at} | ${mail.kind} | ${mail.delivered} | ${mail.to} | ${mail.subject}`).join("\n")
      : "Outbox is empty.";
    return { content, confirm: null };
  }
  if (name === "club_webhook_status") {
    const hooks = readStore().webhooks.slice(0, 8);
    const content = hooks.length
      ? hooks.map((hook) => `${hook.at} | ${hook.type} | verified=${hook.verified} | ${hook.summary}`).join("\n")
      : "No webhook events yet. PayPal can POST PAYMENT.CAPTURE.COMPLETED to /api/paypal/webhook.";
    return { content, confirm: null };
  }
  if (name === "club_reconcile") {
    const report = await reconcile();
    return {
      content: `${report.notice}\nIn ${report.totals.inflowUsd} USD, refunds ${report.totals.refundUsd}, payouts ${report.totals.payoutUsd}, invoices sent ${report.totals.invoiceUsd}, net cash ${report.totals.netUsd}. Source ${report.source}. Rows ${report.rows.length}.`,
      confirm: null,
    };
  }
  if (name === "create_dues_plan") {
    if (blocked) return { content: blocked, confirm: null };
    const plan = await publishDuesPlan();
    return {
      content: `Dues plan ${plan.name} is ${plan.status} at ${plan.amountUsd} USD/month. PayPal plan ${plan.paypalPlanId ?? "local"}.`,
      confirm: null,
    };
  }
  if (name === "propose_refund") {
    if (blocked) return { content: blocked, confirm: null };
    const found = people(String(args.attendeeName ?? ""));
    const attendee = found[0];
    if (!attendee) return { content: `No roster match for "${String(args.attendeeName ?? "")}".\n${rosterText()}`, confirm: null };
    if (attendee.status !== "paid" && attendee.status !== "donated") {
      return { content: `${attendee.name} is ${attendee.status}, so there is nothing to refund.`, confirm: null };
    }
    const pending = holdRefund(attendee);
    return { content: `Waiting for officer confirmation: ${pending.summary}`, confirm: pending };
  }
  if (name === "propose_payout") {
    if (blocked) return { content: blocked, confirm: null };
    try {
      const pending = holdPayout();
      return { content: `Waiting for officer confirmation: ${pending.summary}`, confirm: pending };
    } catch (error) {
      return { content: error instanceof Error ? error.message : "Payout could not be proposed.", confirm: null };
    }
  }
  if (name === "propose_send_invoice") {
    if (blocked) return { content: blocked, confirm: null };
    const event = readStore().event;
    const invoiceId = typeof args.invoiceId === "string" ? args.invoiceId : undefined;
    const existing = invoiceId
      ? readStore().invoices.find((item) => item.id === invoiceId || item.paypalId === invoiceId)
      : undefined;
    const pending = holdInvoice({
      invoiceId: existing?.id,
      sponsorName: String(args.sponsorName || existing?.sponsorName || event.sponsorName),
      sponsorEmail: String(args.sponsorEmail || existing?.sponsorEmail || event.sponsorEmail),
      amountUsd: usd(String(args.amountUsd || existing?.amountUsd || event.sponsorInvoiceUsd)),
      memo: String(args.memo || existing?.memo || `Sponsorship for ${event.title}`),
    });
    return { content: `Waiting for officer confirmation: ${pending.summary}`, confirm: pending };
  }
  return { content: `Unknown club tool ${name}`, confirm: null };
}

function holdFromToolkit(name: string, args: Record<string, unknown>): { content: string; confirm: PendingAction | null } {
  const blocked = setupBlock();
  if (blocked) return { content: blocked, confirm: null };
  if (name === "create_refund") {
    const captureId = String(args.capture_id ?? "");
    const attendee = readStore().attendees.find((row) => row.captureId === captureId);
    if (!attendee) return { content: `No roster capture matches ${captureId}. Use propose_refund with the attendee name.`, confirm: null };
    if (attendee.status !== "paid" && attendee.status !== "donated") {
      return { content: `${attendee.name} is already ${attendee.status}.`, confirm: null };
    }
    const pending = holdRefund(attendee);
    return { content: `HELD for officer confirmation. ${pending.summary}`, confirm: pending };
  }
  if (name === "send_invoice" || name === "record_payment_for_invoice" || name === "record_refund_for_invoice") {
    const invoiceId = String(args.invoice_id ?? "");
    const invoice: InvoiceRecord | undefined = readStore().invoices.find(
      (item) => item.paypalId === invoiceId || item.id === invoiceId || item.number === invoiceId,
    );
    const event = readStore().event;
    const pending = holdInvoice({
      invoiceId: invoice?.id,
      sponsorName: invoice?.sponsorName || event.sponsorName,
      sponsorEmail: invoice?.sponsorEmail || event.sponsorEmail,
      amountUsd: invoice?.amountUsd || event.sponsorInvoiceUsd,
      memo: invoice?.memo || `Sponsorship for ${event.title}`,
    });
    return { content: `HELD for officer confirmation. ${pending.summary}`, confirm: pending };
  }
  if (name === "pay_order") {
    return {
      content:
        "BLOCKED. Do not capture orders from chat. The buyer approves a PayPal button on the unpaid roster row, and ClubFlow captures that order.",
      confirm: null,
    };
  }
  return { content: `BLOCKED money tool ${name}. Use a propose_* club tool so the officer can confirm.`, confirm: null };
}

function systemPrompt(): string {
  const event = readStore().event;
  return [
    "You are the ClubFlow officer copilot for one student-club event.",
    "PayPal is the system of record for money. Currency is USD. This deployment is sandbox or mock, never live.",
    "Channel copy for Instagram, LINE, and email is generated in the left panel from the event brief. Do not invent a different event.",
    "Use PayPal agent toolkit tools for PayPal reads and for creating draft orders, invoices, products, and subscription plans.",
    "The toolkit does not cover Payouts or webhooks. Use propose_payout and club_webhook_status for those.",
    "A PayPal payout batch_status of SUCCESS is not payment. The item transaction_status may be UNCLAIMED, FAILED, PENDING, or SUCCESS. Say the speaker was paid only when the item status is SUCCESS.",
    "Never claim a refund, payout, or invoice send succeeded. Call propose_refund, propose_payout, or propose_send_invoice and wait for the officer to confirm in the UI.",
    "Do not call create_refund, send_invoice, or pay_order. Those are intercepted.",
    `Event: ${event.title} on ${event.date} ${event.startTime}-${event.endTime} at ${event.venue}.`,
    `Registration ${event.registrationUsd} USD. Speaker fee ${event.speakerFeeUsd} USD for ${event.speakerName}. Dues ${event.duesUsd} USD/month. Suggested donation ${event.donationUsd} USD. Sponsor ${event.sponsorName} <${event.sponsorEmail}> invoice ${event.sponsorInvoiceUsd} USD.`,
    "Roster:",
    rosterText(),
  ].join("\n");
}

async function rules(message: string): Promise<ChatResult> {
  const text = message.trim();
  const lower = text.toLowerCase();
  const tools: string[] = [];
  const finish = (reply: string, confirm: PendingAction | null = null, tool?: string): ChatResult => ({
    reply,
    confirm: confirm ? confirmOf(confirm) : null,
    provider: "rules",
    tools: tool ? [...tools, tool] : tools,
  });
  if (!text) return finish("Ask about unpaid attendees, a refund, the sponsor invoice, the speaker payout, dues, or the reimbursement report.");
  if (/\brefund\b/.test(lower)) {
    const blocked = setupBlock();
    if (blocked) return finish(blocked);
    const found = people(text);
    if (found.length !== 1) {
      const paid = readStore().attendees.filter((row) => row.status === "paid" || row.status === "donated");
      return finish(
        found.length > 1
          ? `Which person should be refunded? ${found.map((row) => row.name).join(", ")}.`
          : `Name the person to refund. Captured payments: ${paid.map((row) => `${row.name} (${row.amountUsd} USD)`).join(", ") || "none"}.`,
      );
    }
    const attendee = found[0];
    if (!attendee) return finish("Name the person to refund.");
    if (attendee.status !== "paid" && attendee.status !== "donated") {
      return finish(`${attendee.name} is ${attendee.status}, so there is no capture to refund.`);
    }
    return finish(`Confirm this refund before any money moves.`, holdRefund(attendee), "propose_refund");
  }
  if (/\bpayout\b|\bspeaker fee\b|\bpay the speaker\b|\bpay ken\b/.test(lower)) {
    const blocked = setupBlock();
    if (blocked) return finish(blocked);
    try {
      return finish("Confirm the speaker payout before any money moves.", holdPayout(), "propose_payout");
    } catch (error) {
      return finish(error instanceof Error ? error.message : "No payout was proposed.");
    }
  }
  if (/\binvoice\b|\bsponsor\b/.test(lower)) {
    const blocked = setupBlock();
    if (blocked) return finish(blocked);
    const event = readStore().event;
    const amount = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
    const pending = holdInvoice({
      sponsorName: event.sponsorName,
      sponsorEmail: event.sponsorEmail,
      amountUsd: amount ? usd(amount[1] ?? event.sponsorInvoiceUsd) : event.sponsorInvoiceUsd,
      memo: `Sponsorship for ${event.title}`,
    });
    return finish("Confirm before the invoice is sent.", pending, "propose_send_invoice");
  }
  if (/\bdues\b|\bsubscription\b|\brecurring\b/.test(lower)) {
    const blocked = setupBlock();
    if (blocked) return finish(blocked);
    const plan = await publishDuesPlan();
    return finish(
      `Published ${plan.name} at ${plan.amountUsd} USD per month (${plan.status}). PayPal plan ${plan.paypalPlanId ?? "local"}. A member still approves the subscription from the dues card.`,
      null,
      "create_dues_plan",
    );
  }
  if (/\breconcil|\breimburse|\bexpense|\btransaction search|\bledger\b|\breport\b/.test(lower)) {
    const report = await reconcile();
    return finish(
      `${report.notice}\nInflow ${report.totals.inflowUsd} USD, refunds ${report.totals.refundUsd}, payouts ${report.totals.payoutUsd}, invoices sent ${report.totals.invoiceUsd}, net cash ${report.totals.netUsd}. Source: ${report.source}.`,
      null,
      "club_reconcile",
    );
  }
  if (/\bunpaid\b|\bnot paid\b|\bhasn't paid\b|\bhas not paid\b|\bwho owes\b|\bowes\b|\boutstanding\b/.test(lower)) {
    const rows = readStore().attendees.filter((row) => row.status === "unpaid");
    return finish(
      rows.length
        ? `Still unpaid:\n${rows.map((row) => `${row.name} (${row.role}) ${row.amountUsd} USD`).join("\n")}`
        : "Nobody is unpaid.",
      null,
      "club_list_roster",
    );
  }
  if (/\boutbox\b|\breceipt\b|\bthank-you\b|\bthank you email\b/.test(lower)) {
    const mails = readStore().outbox.slice(0, 5);
    return finish(
      mails.length
        ? `Latest outbox:\n${mails.map((mail) => `${mail.kind} → ${mail.to}: ${mail.subject} (${mail.delivered})`).join("\n")}`
        : "The outbox is empty.",
      null,
      "club_list_outbox",
    );
  }
  if (/\bwebhook\b/.test(lower)) {
    const hooks = readStore().webhooks.slice(0, 5);
    return finish(
      hooks.length
        ? `Recent webhooks:\n${hooks.map((hook) => `${hook.type}: ${hook.summary}`).join("\n")}`
        : "No webhooks yet. Point PayPal at /api/paypal/webhook for PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, CHECKOUT.ORDER.APPROVED, and BILLING.SUBSCRIPTION.ACTIVATED. Without PAYPAL_WEBHOOK_ID, events are stored as unverified.",
      null,
      "club_webhook_status",
    );
  }
  if (/\bdonat/.test(lower)) {
    const event = readStore().event;
    return finish(
      `Suggested donation is ${event.donationUsd} USD. Use the donation card on the desk. After capture, ClubFlow writes a thank-you email and a PDF certificate.`,
    );
  }
  if (/\binstagram\b|\bcaption\b|\bline\b|\bchannel copy\b|\bgmail\b/.test(lower)) {
    return finish(
      "Channel copy is still generated on the left of the money desk from the single event brief (Instagram, Stories, LINE, Gmail). Press Generate channel copy. Nothing is posted.",
    );
  }
  const unpaid = readStore().attendees.filter((row) => row.status === "unpaid").length;
  return finish(
    `I can list who has not paid (${unpaid} unpaid), refund a captured payment, send the ${readStore().event.sponsorName} invoice, pay the speaker, publish monthly dues, or build the reimbursement report. Money leaves only after you confirm. Try: "Who has not paid?" or "Refund Mia Chen".`,
  );
}

async function withModel(message: string, history: ChatTurn[]): Promise<ChatResult> {
  const kit = await ensureToolkit();
  const tools = await toolList();
  const messages: Record<string, unknown>[] = [
    { role: "system", content: systemPrompt() },
    ...history.slice(-8).map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user", content: message },
  ];
  const used: string[] = [];
  for (let step = 0; step < 4; step += 1) {
    const res = await fetch(`${config.openaiBase}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: config.openaiModel, temperature: 0.2, messages, tools }),
    });
    const data = (await res.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
    };
    if (!res.ok) {
      throw new Error(data.error?.message || `Model request failed (${res.status})`);
    }
    const assistant = data.choices?.[0]?.message;
    if (!assistant) throw new Error("The model returned no message.");
    messages.push(assistant as unknown as Record<string, unknown>);
    const calls = assistant.tool_calls ?? [];
    if (!calls.length) {
      return {
        reply: assistant.content?.trim() || "I could not draft a reply. Try a shorter request.",
        confirm: null,
        provider: "openai",
        tools: used,
      };
    }
    for (const call of calls) {
      used.push(call.function.name);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      let content = "";
      let confirm: PendingAction | null = null;
      if (HELD.has(call.function.name)) {
        const held = holdFromToolkit(call.function.name, args);
        content = held.content;
        confirm = held.confirm;
      } else if (customTools().some((tool) => tool.function.name === call.function.name)) {
        const ran = await runCustom(call.function.name, args);
        content = ran.content;
        confirm = ran.confirm;
      } else if (kit) {
        try {
          const result = await kit.handleToolCall({
            id: call.id,
            type: "function",
            function: { name: call.function.name, arguments: JSON.stringify(args) },
          });
          content = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
        } catch (error) {
          content = error instanceof Error ? error.message : "PayPal tool failed";
        }
      } else {
        content = "That PayPal toolkit tool is available only when sandbox credentials are set.";
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
      if (confirm) {
        return {
          reply: `${confirm.summary} Nothing has moved yet. Confirm below to run it.`,
          confirm: confirmOf(confirm),
          provider: "openai",
          tools: used,
        };
      }
    }
  }
  return {
    reply: "I paused after several PayPal lookups. Ask the next step directly.",
    confirm: null,
    provider: "openai",
    tools: used,
  };
}

export async function chat(message: string, history: ChatTurn[]): Promise<ChatResult> {
  if (!config.openaiKey) return rules(message);
  try {
    return await withModel(message, history);
  } catch (error) {
    const fallback = await rules(message);
    const reason = error instanceof Error ? error.message : "model error";
    return {
      ...fallback,
      reply: `The model call failed (${reason}), so this answer used the built-in intent parser.\n\n${fallback.reply}`,
    };
  }
}
