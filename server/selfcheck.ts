import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.MOCK_PAYPAL = "1";
process.env.OPENAI_API_KEY = "";
process.env.CLUBFLOW_STORE = path.join(os.tmpdir(), `clubflow-selfcheck-${process.pid}.json`);
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;

const { app } = await import("./app.js");

const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address() as AddressInfo;
const base = `http://127.0.0.1:${address.port}`;

async function api(pathname: string, init?: RequestInit) {
  const res = await fetch(`${base}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`FAIL ${name}: ${message}`);
  }
}

await check("paypal errors keep issue and debug_id", async () => {
  const { formatPaypalError, paypalFailure, PaypalError } = await import("./paypal.js");
  const { requireMerchantEmail } = await import("./config.js");
  const text = formatPaypalError(
    {
      name: "UNPROCESSABLE_ENTITY",
      message: "The requested action could not be performed.",
      debug_id: "dbg123",
      details: [{ issue: "ORDER_NOT_APPROVED", description: "Payer has not yet approved the Order." }],
    },
    "fallback",
  );
  assert(text.message.includes("ORDER_NOT_APPROVED"), text.message);
  assert(text.message.includes("debug_id=dbg123"), text.message);
  assert(text.issues.includes("ORDER_NOT_APPROVED"), text.issues.join(","));
  const denied = new PaypalError("PayPal 403 /v2/invoicing/invoices: NOT_AUTHORIZED — debug_id=dbg403", "dbg403", ["NOT_AUTHORIZED"]);
  const friendly = paypalFailure(denied, "Invoicing");
  assert(/Invoicing checkbox/i.test(friendly.message), friendly.message);
  assert(friendly.message.includes("debug_id=dbg403"), friendly.message);
  const { invoiceIdFrom } = await import("./paypal.js");
  const fromLink = invoiceIdFrom({
    rel: "self",
    href: "https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-ABC-123",
    method: "GET",
  });
  assert(fromLink === "INV2-ABC-123", String(fromLink));
  const fromLocation = invoiceIdFrom({}, "https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-LOC");
  assert(fromLocation === "INV2-LOC", String(fromLocation));
  assert(invoiceIdFrom({ id: "INV2-FULL" }) === "INV2-FULL", "id field");
  const taiwan = paypalFailure(
    new PaypalError(
      "PayPal 406 /v2/invoicing/invoices: TAIWAN_MERCHANT_TAIWAN_PAYER_RESTRICTED — debug_id=dbg406",
      "dbg406",
      ["TAIWAN_MERCHANT_TAIWAN_PAYER_RESTRICTED"],
    ),
    "Invoicing",
  );
  assert(/non-Taiwan recipient\/buyer sandbox account/.test(taiwan.message), taiwan.message);
  assert(taiwan.message.includes("TAIWAN_MERCHANT_TAIWAN_PAYER_RESTRICTED"), taiwan.message);
  assert(taiwan.message.includes("lane.lab@example.com"), taiwan.message);
  let missingEmail = false;
  try {
    requireMerchantEmail();
  } catch (error) {
    missingEmail = error instanceof Error && error.message.includes("PAYPAL_MERCHANT_EMAIL");
  }
  assert(missingEmail, "invoicing should require PAYPAL_MERCHANT_EMAIL");
});

await check("health is mock", async () => {
  const res = await api("/api/health");
  assert(res.status === 200, `status ${res.status}`);
  const body = res.body as { mode?: string };
  assert(body.mode === "mock", `mode ${body.mode}`);
});

await check("seeded roster", async () => {
  const res = await api("/api/state");
  const body = res.body as { attendees: { id: string; status: string }[]; ai: { provider: string } };
  assert(body.attendees.some((row) => row.id === "att_mia" && row.status === "paid"), "mia not paid");
  assert(body.attendees.some((row) => row.id === "att_jonah" && row.status === "unpaid"), "jonah not unpaid");
  assert(body.ai.provider === "rules", "expected rules agent");
});

await check("registration checkout and receipt", async () => {
  const created = await api("/api/checkout/orders", {
    method: "POST",
    body: JSON.stringify({ kind: "registration", attendeeId: "att_jonah" }),
  });
  const order = created.body as { id?: string; approveUrl?: string };
  assert(created.status === 200 && order.id, JSON.stringify(created.body));
  assert(order.approveUrl?.includes("checkoutnow?token="), JSON.stringify(created.body));
  assert(order.approveUrl?.includes(order.id), order.approveUrl);
  const captured = await api(`/api/checkout/orders/${order.id}/capture`, { method: "POST", body: "{}" });
  const state = (captured.body as { attendee?: { status?: string }; state?: { outbox: { to: string; kind: string }[] } }).state;
  assert((captured.body as { attendee?: { status?: string } }).attendee?.status === "paid", "jonah not paid");
  assert(state?.outbox.some((mail) => mail.to === "jonah.wu@example.com" && mail.kind === "receipt"), "missing receipt");
  const again = await api(`/api/checkout/orders/${order.id}/capture`, { method: "POST", body: "{}" });
  assert(again.status === 200, "second capture should be idempotent");
});

await check("webhook marks alex paid", async () => {
  const opened = await api("/api/checkout/orders", {
    method: "POST",
    body: JSON.stringify({ kind: "registration", attendeeId: "att_alex" }),
  });
  const orderId = (opened.body as { id: string }).id;
  const hook = await api("/api/paypal/webhook", {
    method: "POST",
    body: JSON.stringify({
      id: "WH-SELFCHECK-ALEX",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "MOCK-WHCAP-ALEX",
        custom_id: "att_alex",
        amount: { value: "12.00", currency_code: "USD" },
        supplementary_data: { related_ids: { order_id: orderId } },
      },
    }),
  });
  assert(hook.status === 200, JSON.stringify(hook.body));
  const dup = await api("/api/paypal/webhook", {
    method: "POST",
    body: JSON.stringify({ id: "WH-SELFCHECK-ALEX", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} }),
  });
  assert((dup.body as { duplicate?: boolean }).duplicate === true, "duplicate webhook not ignored");
  const state = await api("/api/state");
  const alex = (state.body as { attendees: { id: string; status: string }[] }).attendees.find((row) => row.id === "att_alex");
  assert(alex?.status === "paid", "alex not paid via webhook");
});

await check("invoice create and send", async () => {
  const draft = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ sponsorName: "Lane Lab", sponsorEmail: "lane.lab@example.com", amount: "500.00", memo: "Workshop sponsorship" }),
  });
  const invoice = draft.body as { invoice?: { id: string; status: string } };
  assert(invoice.invoice?.status === "draft", "draft missing");
  const sent = await api(`/api/invoices/${invoice.invoice?.id}/send`, { method: "POST", body: "{}" });
  assert((sent.body as { invoice?: { status?: string } }).invoice?.status === "sent", "not sent");
});

await check("donation certificate and thanks", async () => {
  const created = await api("/api/checkout/orders", {
    method: "POST",
    body: JSON.stringify({ kind: "donation", donorName: "Riley Patron", donorEmail: "riley.patron@example.com", amount: "25.00" }),
  });
  const order = created.body as { id?: string };
  const captured = await api(`/api/checkout/orders/${order.id}/capture`, { method: "POST", body: "{}" });
  const state = (captured.body as { state?: { certificates: { id: string }[]; outbox: { kind: string; to: string }[]; attendees: { name: string; status: string }[] } }).state;
  const cert = state?.certificates[0];
  assert(cert, "certificate missing");
  assert(state?.attendees.some((row) => row.name === "Riley Patron" && row.status === "donated"), "donor not donated");
  assert(state?.outbox.some((mail) => mail.kind === "thanks" && mail.to === "riley.patron@example.com"), "thanks missing");
  const pdf = await fetch(`${base}/api/certificates/${cert.id}.pdf`);
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert(pdf.status === 200 && bytes.subarray(0, 4).toString() === "%PDF", "pdf bytes missing");
});

await check("speaker payout", async () => {
  const res = await api("/api/payouts", { method: "POST", body: JSON.stringify({ attendeeId: "spk_ken" }) });
  assert((res.body as { attendee?: { status?: string; payoutStatus?: string } }).attendee?.status === "paid", JSON.stringify(res.body));
  assert((res.body as { attendee?: { payoutStatus?: string } }).attendee?.payoutStatus === "SUCCESS", JSON.stringify(res.body));
  const again = await api("/api/payouts", { method: "POST", body: JSON.stringify({ attendeeId: "spk_ken" }) });
  assert(again.status === 400, "second payout should fail");
});

await check("dues plan and subscription", async () => {
  const plan = await api("/api/billing/plans", { method: "POST", body: "{}" });
  const planId = (plan.body as { plan?: { id: string; status: string; paypalPlanId?: string } }).plan;
  assert(planId?.status === "active" && planId.paypalPlanId, "plan not active");
  const sub = await api("/api/billing/subscriptions", {
    method: "POST",
    body: JSON.stringify({ planId: planId?.id, name: "Noah Patel", email: "noah.patel@example.com" }),
  });
  assert((sub.body as { status?: string }).status === "active", JSON.stringify(sub.body));
});

await check("refund syncs roster", async () => {
  const res = await api("/api/refunds", { method: "POST", body: JSON.stringify({ attendeeId: "att_mia" }) });
  assert((res.body as { attendee?: { status?: string } }).attendee?.status === "refunded", JSON.stringify(res.body));
  const again = await api("/api/refunds", { method: "POST", body: JSON.stringify({ attendeeId: "att_sofia" }) });
  assert(again.status === 400, "already-refunded row should not refund twice");
});

await check("reimbursement csv uses local ledger", async () => {
  const res = await api("/api/reports/reimbursement");
  const body = res.body as { source?: string; rows?: unknown[]; notice?: string; totals?: { netUsd: string } };
  assert(body.source === "local-ledger", body.source);
  assert((body.rows?.length ?? 0) > 3, "ledger too small");
  assert(body.notice?.toLowerCase().includes("local"), "notice should mention local ledger");
  const csv = await fetch(`${base}/api/reports/reimbursement.csv`);
  const text = await csv.text();
  assert(csv.status === 200 && text.includes("Mia Chen") && text.includes("local-ledger"), text.slice(0, 200));
});

await check("agent refund requires confirm", async () => {
  const asked = await api("/api/agent/chat", {
    method: "POST",
    body: JSON.stringify({ message: "Who has not paid the registration fee?" }),
  });
  const reply = (asked.body as { reply?: string; provider?: string }).reply ?? "";
  assert((asked.body as { provider?: string }).provider === "rules", "provider");
  assert(/unpaid|Jonah|speaker|Ken/i.test(reply), reply);
  const proposed = await api("/api/agent/chat", {
    method: "POST",
    body: JSON.stringify({ message: "Refund Priya Shah" }),
  });
  const confirm = (proposed.body as { confirm?: { id: string } | null }).confirm;
  assert(confirm?.id, JSON.stringify(proposed.body));
  const done = await api("/api/agent/confirm", { method: "POST", body: JSON.stringify({ id: confirm?.id }) });
  assert(/Priya/.test((done.body as { reply?: string }).reply ?? ""), JSON.stringify(done.body));
  const state = await api("/api/state");
  const priya = (state.body as { attendees: { id: string; status: string }[] }).attendees.find((row) => row.id === "att_priya");
  assert(priya?.status === "refunded", "priya not refunded");
});

await check("webhook refund sync", async () => {
  const state = await api("/api/state");
  const jonah = (state.body as { attendees: { id: string; captureId?: string; status: string }[] }).attendees.find((row) => row.id === "att_jonah");
  assert(jonah?.status === "paid" && jonah.captureId, "jonah should still be paid before webhook refund");
  const hook = await api("/api/paypal/webhook", {
    method: "POST",
    body: JSON.stringify({
      id: "WH-SELFCHECK-REFUND-JONAH",
      event_type: "PAYMENT.CAPTURE.REFUNDED",
      resource: { links: [{ href: `https://api.sandbox.paypal.com/v2/payments/captures/${jonah?.captureId}`, rel: "up" }] },
    }),
  });
  assert(hook.status === 200, JSON.stringify(hook.body));
  const after = await api("/api/state");
  const next = (after.body as { attendees: { id: string; status: string }[] }).attendees.find((row) => row.id === "att_jonah");
  assert(next?.status === "refunded", "webhook did not sync refund");
});

server.close();
if (failures.length) {
  console.error(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nAll mock flows passed.");
