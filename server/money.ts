import { config, publicBase } from "./config.js";
import { deliver } from "./mail.js";
import {
  captureOrder,
  createInvoice,
  createOrder,
  createPayout,
  createPlan,
  createProduct,
  createSubscription,
  refundCapture,
  searchTransactions,
  sendInvoice,
  type PaypalTxn,
} from "./paypal.js";
import { certificatePdf } from "./pdf.js";
import { findAttendee, nid, nowIso, readStore, updateStore, usd } from "./store.js";
import type { Attendee, InvoiceRecord, LedgerEntry, PlanRecord, StoreData } from "./types.js";

function assertReady(): void {
  if (config.mode === "setup") {
    throw new Error("PayPal is not configured. Add sandbox credentials or set MOCK_PAYPAL=1.");
  }
}

function source(): LedgerEntry["source"] {
  return config.mode === "sandbox" ? "sandbox" : "mock";
}

function requireAttendee(id: string): Attendee {
  const attendee = findAttendee(id);
  if (!attendee) throw new Error(`Attendee not found: ${id}`);
  return attendee;
}

function ledger(store: StoreData, entry: Omit<LedgerEntry, "id" | "at" | "currency"> & { at?: string }): void {
  const { at, ...rest } = entry;
  store.ledger.unshift({
    id: nid("led"),
    at: at ?? nowIso(),
    currency: "USD",
    ...rest,
  });
}

export async function openCheckout(input: {
  kind: "registration" | "donation";
  attendeeId?: string;
  donorName?: string;
  donorEmail?: string;
  amount?: string;
}): Promise<{ id: string; attendeeId: string }> {
  assertReady();
  const event = readStore().event;
  let attendeeId = input.attendeeId ?? "";
  let amount = "";
  let description = "";
  if (input.kind === "registration") {
    if (!attendeeId) throw new Error("Choose an attendee before starting checkout.");
    const attendee = requireAttendee(attendeeId);
    if (attendee.role !== "attendee") throw new Error("Only registration rows use the checkout button.");
    if (attendee.status === "paid") throw new Error(`${attendee.name} is already paid.`);
    if (attendee.status === "refunded") throw new Error(`${attendee.name} was refunded. Add them again before charging.`);
    amount = attendee.amountUsd;
    description = `Registration — ${event.title}`;
  } else {
    const name = (input.donorName ?? "").trim();
    const email = (input.donorEmail ?? "").trim();
    if (!name || !email.includes("@")) throw new Error("A donor name and email are required.");
    amount = usd(input.amount || event.donationUsd);
    description = `Donation — ${event.title}`;
    attendeeId = nid("don");
    updateStore((store) => {
      store.attendees.push({
        id: attendeeId,
        name,
        email,
        role: "donor",
        status: "unpaid",
        amountUsd: amount,
        receiptSent: false,
        thanksSent: false,
      });
    });
  }
  const orderId =
    config.mode === "sandbox"
      ? (await createOrder({ amount, customId: attendeeId, description })).id
      : `MOCK-ORDER-${nid("ord")}`;
  updateStore((store) => {
    const row = store.attendees.find((item) => item.id === attendeeId);
    if (row) row.orderId = orderId;
  });
  return { id: orderId, attendeeId };
}

async function receiptFor(attendee: Attendee, reference: string): Promise<void> {
  const event = readStore().event;
  const label = attendee.role === "donor" ? "Donation" : "Registration";
  const text = [
    `${label} receipt`,
    `${event.clubName}`,
    `${event.title}`,
    `${attendee.name} <${attendee.email}>`,
    `${attendee.amountUsd} USD`,
    `Reference ${reference}`,
    config.mode === "sandbox" ? "Paid in the PayPal sandbox." : "Recorded in ClubFlow mock mode. PayPal was not called.",
  ].join("\n");
  await deliver({
    to: attendee.email,
    subject: `Receipt — ${event.title}`,
    text,
    html: `<p><strong>${label} receipt</strong></p><p>${event.clubName}<br>${event.title}</p><p>${attendee.name} &lt;${attendee.email}&gt;<br><strong>${attendee.amountUsd} USD</strong></p><p>Reference ${reference}</p>`,
    kind: "receipt",
  });
}

async function thanksFor(attendee: Attendee, certificateId: string, base: string): Promise<void> {
  const event = readStore().event;
  const link = `${base}/api/certificates/${certificateId}.pdf`;
  const text = [
    `Thank you, ${attendee.name}.`,
    `${event.clubName} received your ${attendee.amountUsd} USD gift for ${event.title}.`,
    `Certificate: ${link}`,
  ].join("\n");
  await deliver({
    to: attendee.email,
    subject: `Thank you — ${event.clubName}`,
    text,
    html: `<p>Thank you, <strong>${attendee.name}</strong>.</p><p>${event.clubName} received your <strong>${attendee.amountUsd} USD</strong> gift for ${event.title}.</p><p><a href="${link}">Download the thank-you certificate</a></p>`,
    kind: "thanks",
  });
}

export async function captureCheckout(orderId: string, base: string): Promise<Attendee> {
  assertReady();
  const existing = readStore().attendees.find((item) => item.orderId === orderId);
  if (!existing) throw new Error(`No checkout is waiting for order ${orderId}.`);
  if (existing.status === "paid" || existing.status === "donated") return existing;
  const captureId =
    config.mode === "sandbox" ? (await captureOrder(orderId)).captureId : `MOCK-CAP-${nid("cap")}`;
  const via = source();
  updateStore((store) => {
    const row = store.attendees.find((item) => item.id === existing.id);
    if (!row) return;
    row.captureId = captureId;
    row.status = row.role === "donor" ? "donated" : "paid";
    ledger(store, {
      type: row.role === "donor" ? "donation" : "capture",
      counterparty: row.name,
      email: row.email,
      amountUsd: row.amountUsd,
      status: "COMPLETED",
      reference: captureId,
      note: row.role === "donor" ? "Sponsor or guest donation" : "Registration fee",
      source: via,
    });
    if (row.role === "donor") {
      const pdf = certificatePdf([
        eventLine(store),
        `Presented to ${row.name}`,
        `For a gift of ${row.amountUsd} USD`,
        `Event: ${store.event.title}`,
        `Date: ${store.event.date}`,
        `Reference: ${captureId}`,
        config.mode === "sandbox" ? "PayPal sandbox" : "ClubFlow mock mode",
      ]);
      store.certificates.unshift({
        id: nid("cert"),
        at: nowIso(),
        attendeeId: row.id,
        title: `Thank-you certificate — ${row.name}`,
        pdfBase64: pdf.toString("base64"),
      });
    }
  });
  const fresh = requireAttendee(existing.id);
  if (!fresh.receiptSent) {
    await receiptFor(fresh, captureId);
    updateStore((store) => {
      const row = store.attendees.find((item) => item.id === fresh.id);
      if (row) row.receiptSent = true;
    });
  }
  if (fresh.role === "donor" && !fresh.thanksSent) {
    const cert = readStore().certificates.find((item) => item.attendeeId === fresh.id);
    if (cert) {
      await thanksFor(fresh, cert.id, base);
      updateStore((store) => {
        const row = store.attendees.find((item) => item.id === fresh.id);
        if (row) row.thanksSent = true;
      });
    }
  }
  return requireAttendee(existing.id);
}

function eventLine(store: StoreData): string {
  return store.event.clubName;
}

export async function refundAttendee(attendeeId: string): Promise<Attendee> {
  assertReady();
  const attendee = requireAttendee(attendeeId);
  if (attendee.role === "speaker") throw new Error("Speaker fees are payouts. Refund applies to a captured checkout.");
  if (attendee.status !== "paid" && attendee.status !== "donated") {
    throw new Error(`${attendee.name} is ${attendee.status}. Only a captured payment can be refunded.`);
  }
  if (!attendee.captureId) throw new Error(`${attendee.name} has no capture id to refund.`);
  const captureId = attendee.captureId;
  if (config.mode === "sandbox" && captureId.startsWith("CAP-SEED")) {
    throw new Error(
      `${attendee.name} is seeded demo history, not a sandbox capture. Collect a new sandbox payment, then refund that capture.`,
    );
  }
  const refund =
    config.mode === "sandbox"
      ? await refundCapture(captureId, attendee.amountUsd, `ClubFlow refund for ${attendee.name}`)
      : { id: `MOCK-REFUND-${nid("ref")}` };
  updateStore((store) => {
    const row = store.attendees.find((item) => item.id === attendeeId);
    if (!row) return;
    row.status = "refunded";
    ledger(store, {
      type: "refund",
      counterparty: row.name,
      email: row.email,
      amountUsd: row.amountUsd,
      status: "COMPLETED",
      reference: refund.id,
      note: `Refund of capture ${captureId}`,
      source: source(),
    });
  });
  return requireAttendee(attendeeId);
}

export async function draftInvoice(input: {
  sponsorName?: string;
  sponsorEmail?: string;
  amount?: string;
  memo?: string;
}): Promise<InvoiceRecord> {
  assertReady();
  const event = readStore().event;
  const sponsorName = (input.sponsorName || event.sponsorName).trim();
  const sponsorEmail = (input.sponsorEmail || event.sponsorEmail).trim();
  if (!sponsorName || !sponsorEmail.includes("@")) throw new Error("Sponsor name and email are required.");
  const amount = usd(input.amount || event.sponsorInvoiceUsd);
  const memo = (input.memo || `Sponsorship for ${event.title}`).trim();
  const number = `EIC-${Date.now().toString().slice(-8)}`;
  const paypalId = config.mode === "sandbox" ? (await createInvoice({
    number,
    sponsorName,
    sponsorEmail,
    amount,
    memo,
    itemName: `Sponsorship — ${event.title}`.slice(0, 200),
  })).id : undefined;
  const record: InvoiceRecord = {
    id: nid("inv"),
    paypalId,
    number,
    sponsorName,
    sponsorEmail,
    amountUsd: amount,
    memo,
    status: "draft",
    at: nowIso(),
  };
  updateStore((store) => {
    store.invoices.unshift(record);
  });
  return record;
}

export async function deliverInvoice(invoiceId: string): Promise<InvoiceRecord> {
  assertReady();
  const current = readStore().invoices.find((item) => item.id === invoiceId || item.paypalId === invoiceId);
  if (!current) throw new Error(`Invoice not found: ${invoiceId}`);
  if (current.status === "sent") return current;
  if (config.mode === "sandbox") {
    if (!current.paypalId) throw new Error("This draft has no PayPal invoice id.");
    await sendInvoice(current.paypalId);
  }
  const event = readStore().event;
  await deliver({
    to: current.sponsorEmail,
    subject: `Invoice ${current.number} — ${event.clubName}`,
    text: `${current.sponsorName},\n\n${current.memo}\nAmount: ${current.amountUsd} USD\nInvoice ${current.number}${current.paypalId ? `\nPayPal ${current.paypalId}` : ""}\n`,
    html: `<p>${current.sponsorName},</p><p>${current.memo}</p><p><strong>${current.amountUsd} USD</strong><br>Invoice ${current.number}</p>`,
    kind: "invoice",
  });
  updateStore((store) => {
    const row = store.invoices.find((item) => item.id === current.id);
    if (!row) return;
    row.status = "sent";
    ledger(store, {
      type: "invoice",
      counterparty: row.sponsorName,
      email: row.sponsorEmail,
      amountUsd: row.amountUsd,
      status: "SENT",
      reference: row.paypalId || row.number,
      note: row.memo,
      source: source(),
    });
  });
  const sent = readStore().invoices.find((item) => item.id === current.id);
  if (!sent) throw new Error("Invoice disappeared after send.");
  return sent;
}

export async function paySpeaker(attendeeId?: string): Promise<Attendee> {
  assertReady();
  const store = readStore();
  const speaker =
    (attendeeId ? store.attendees.find((item) => item.id === attendeeId) : undefined) ??
    store.attendees.find((item) => item.role === "speaker");
  if (!speaker || speaker.role !== "speaker") throw new Error("No speaker is on the roster.");
  if (speaker.status === "paid") throw new Error(`${speaker.name} has already been paid.`);
  const batchKey = `batch_${nid("po")}`;
  const payout =
    config.mode === "sandbox"
      ? await createPayout({
          email: speaker.email,
          amount: speaker.amountUsd,
          note: `Speaker fee for ${store.event.title}`,
          batchId: batchKey,
        })
      : { batchId: `MOCK-PAYOUT-${batchKey}` };
  updateStore((data) => {
    const row = data.attendees.find((item) => item.id === speaker.id);
    if (!row) return;
    row.status = "paid";
    row.captureId = payout.batchId;
    data.payouts.unshift({
      id: nid("pay"),
      paypalBatchId: payout.batchId,
      attendeeId: row.id,
      name: row.name,
      email: row.email,
      amountUsd: row.amountUsd,
      status: "SUCCESS",
      at: nowIso(),
    });
    ledger(data, {
      type: "payout",
      counterparty: row.name,
      email: row.email,
      amountUsd: row.amountUsd,
      status: "SUCCESS",
      reference: payout.batchId,
      note: "Speaker fee",
      source: source(),
    });
  });
  return requireAttendee(speaker.id);
}

export async function publishDuesPlan(planId?: string): Promise<PlanRecord> {
  assertReady();
  const current =
    readStore().plans.find((item) => item.id === planId) ??
    readStore().plans.find((item) => item.status === "local") ??
    readStore().plans[0];
  if (!current) throw new Error("No dues plan is seeded.");
  if (current.paypalPlanId && current.status === "active") return current;
  if (config.mode === "sandbox") {
    const product = await createProduct(current.name, "Monthly membership dues for the club");
    const plan = await createPlan({ productId: product.id, name: current.name, amount: current.amountUsd });
    updateStore((store) => {
      const row = store.plans.find((item) => item.id === current.id);
      if (!row) return;
      row.paypalProductId = product.id;
      row.paypalPlanId = plan.id;
      row.status = "active";
    });
  } else {
    updateStore((store) => {
      const row = store.plans.find((item) => item.id === current.id);
      if (!row) return;
      row.paypalProductId = row.paypalProductId || `MOCK-PROD-${nid("prod")}`;
      row.paypalPlanId = row.paypalPlanId || `MOCK-PLAN-${nid("plan")}`;
      row.status = "active";
    });
  }
  const next = readStore().plans.find((item) => item.id === current.id);
  if (!next) throw new Error("Dues plan disappeared.");
  return next;
}

export async function subscribeMember(input: {
  planId?: string;
  name: string;
  email: string;
  base: string;
}): Promise<{ id: string; approveUrl?: string; status: string }> {
  assertReady();
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name || !email.includes("@")) throw new Error("Member name and email are required.");
  let plan = readStore().plans.find((item) => item.id === input.planId) ?? readStore().plans[0];
  if (!plan) throw new Error("Create a dues plan first.");
  if (plan.status !== "active" || !plan.paypalPlanId) plan = await publishDuesPlan(plan.id);
  if (!plan.paypalPlanId) throw new Error("The dues plan has no PayPal plan id.");
  const [given = name, ...rest] = name.split(" ");
  const surname = rest.join(" ") || "Member";
  let paypalId = `MOCK-SUB-${nid("sub")}`;
  let approveUrl: string | undefined;
  let status: "approval_pending" | "active" = "active";
  if (config.mode === "sandbox") {
    const created = await createSubscription({
      planId: plan.paypalPlanId,
      givenName: given,
      surname,
      email,
      returnUrl: `${input.base}/#/desk`,
      cancelUrl: `${input.base}/#/desk`,
    });
    paypalId = created.id;
    approveUrl = created.approveUrl;
    status = "approval_pending";
  }
  const id = nid("sub");
  updateStore((store) => {
    store.subscriptions.unshift({
      id,
      planId: plan.id,
      paypalId,
      name,
      email,
      amountUsd: plan.amountUsd,
      status,
      approveUrl,
      at: nowIso(),
    });
    if (status === "active") {
      ledger(store, {
        type: "subscription",
        counterparty: name,
        email,
        amountUsd: plan.amountUsd,
        status: "ACTIVE",
        reference: paypalId,
        note: "Monthly dues subscription (mock activation)",
        source: source(),
      });
    }
  });
  return { id, approveUrl, status };
}

export function markSubscriptionActive(paypalId: string): void {
  updateStore((store) => {
    const row = store.subscriptions.find((item) => item.paypalId === paypalId || item.id === paypalId);
    if (!row || row.status === "active") return;
    row.status = "active";
    ledger(store, {
      type: "subscription",
      counterparty: row.name,
      email: row.email,
      amountUsd: row.amountUsd,
      status: "ACTIVE",
      reference: row.paypalId || row.id,
      note: "Subscription activated",
      source: "webhook",
    });
  });
}

type WebhookResource = {
  id?: string;
  custom_id?: string;
  amount?: { value?: string };
  supplementary_data?: { related_ids?: { order_id?: string } };
  links?: { href?: string; rel?: string }[];
};

function captureIdFromResource(resource: WebhookResource): string | undefined {
  for (const link of resource.links ?? []) {
    const match = link.href?.match(/\/captures\/([^/?]+)/);
    if (match) return match[1];
  }
  return resource.id;
}

export async function applyWebhook(event: {
  id?: string;
  event_type?: string;
  resource?: WebhookResource;
}, verified: boolean, base: string): Promise<{ duplicate: boolean; summary: string }> {
  const eventId = event.id || nid("wh");
  if (readStore().seenEvents.includes(eventId)) {
    return { duplicate: true, summary: "Duplicate webhook ignored." };
  }
  const type = event.event_type || "UNKNOWN";
  const resource = event.resource ?? {};
  let summary = type;
  if (type === "PAYMENT.CAPTURE.COMPLETED") {
    const customId = resource.custom_id;
    const orderId = resource.supplementary_data?.related_ids?.order_id;
    const attendee =
      readStore().attendees.find((item) => item.id === customId) ||
      readStore().attendees.find((item) => item.orderId && item.orderId === orderId) ||
      readStore().attendees.find((item) => item.captureId && item.captureId === resource.id);
    if (attendee && (attendee.status === "unpaid" || attendee.status === "refunded")) {
      const captureId = resource.id || `WH-CAP-${nid("cap")}`;
      updateStore((store) => {
        const row = store.attendees.find((item) => item.id === attendee.id);
        if (!row) return;
        row.captureId = captureId;
        row.status = row.role === "donor" ? "donated" : "paid";
        if (orderId) row.orderId = orderId;
        ledger(store, {
          type: row.role === "donor" ? "donation" : "capture",
          counterparty: row.name,
          email: row.email,
          amountUsd: resource.amount?.value || row.amountUsd,
          status: "COMPLETED",
          reference: captureId,
          note: "Marked paid from PayPal webhook",
          source: "webhook",
        });
      });
      const fresh = requireAttendee(attendee.id);
      if (!fresh.receiptSent) {
        await receiptFor(fresh, fresh.captureId || captureId);
        updateStore((store) => {
          const row = store.attendees.find((item) => item.id === fresh.id);
          if (row) row.receiptSent = true;
        });
      }
      summary = `Capture completed for ${fresh.name}`;
      if (fresh.role === "donor") {
        const certId = nid("cert");
        const pdf = certificatePdf([
          readStore().event.clubName,
          `Presented to ${fresh.name}`,
          `For a gift of ${fresh.amountUsd} USD`,
          `Event: ${readStore().event.title}`,
          `Reference: ${fresh.captureId || captureId}`,
        ]);
        updateStore((store) => {
          store.certificates.unshift({
            id: certId,
            at: nowIso(),
            attendeeId: fresh.id,
            title: `Thank-you certificate — ${fresh.name}`,
            pdfBase64: pdf.toString("base64"),
          });
        });
        if (!fresh.thanksSent) {
          await thanksFor(requireAttendee(fresh.id), certId, base);
          updateStore((store) => {
            const row = store.attendees.find((item) => item.id === fresh.id);
            if (row) row.thanksSent = true;
          });
        }
      }
    } else {
      summary = attendee ? `Capture already applied for ${attendee.name}` : "Capture webhook had no matching roster row";
    }
  } else if (type === "PAYMENT.CAPTURE.REFUNDED") {
    const captureId = captureIdFromResource(resource);
    const attendee = readStore().attendees.find((item) => item.captureId === captureId);
    if (attendee && attendee.status !== "refunded") {
      updateStore((store) => {
        const row = store.attendees.find((item) => item.id === attendee.id);
        if (!row) return;
        row.status = "refunded";
        ledger(store, {
          type: "refund",
          counterparty: row.name,
          email: row.email,
          amountUsd: row.amountUsd,
          status: "COMPLETED",
          reference: captureId || "webhook-refund",
          note: "Refund synced from PayPal webhook",
          source: "webhook",
        });
      });
      summary = `Refund synced for ${attendee.name}`;
    } else {
      summary = "Refund webhook had no open capture on the roster";
    }
  } else if (type === "BILLING.SUBSCRIPTION.ACTIVATED") {
    if (resource.id) markSubscriptionActive(resource.id);
    summary = `Subscription ${resource.id || ""} activated`;
  } else if (type === "CHECKOUT.ORDER.APPROVED") {
    summary = `Order ${resource.id || ""} approved. Capture still runs from the checkout button.`;
  } else {
    summary = `Stored ${type}`;
  }
  updateStore((store) => {
    store.seenEvents.push(eventId);
    store.webhooks.unshift({ id: eventId, at: nowIso(), type, summary, verified });
  });
  return { duplicate: false, summary };
}

export async function simulateCaptureWebhook(attendeeId: string, base: string): Promise<{ summary: string }> {
  assertReady();
  const attendee = requireAttendee(attendeeId);
  if (attendee.role !== "attendee" && attendee.role !== "donor") {
    throw new Error("Webhook simulation targets a registration or donation row.");
  }
  if (attendee.status === "paid" || attendee.status === "donated") {
    throw new Error(`${attendee.name} is already ${attendee.status}.`);
  }
  if (!attendee.orderId) {
    await openCheckout({ kind: attendee.role === "donor" ? "donation" : "registration", attendeeId });
  }
  const fresh = requireAttendee(attendeeId);
  const result = await applyWebhook(
    {
      id: `WH-SIM-${nid("sim")}`,
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: `MOCK-WHCAP-${nid("cap")}`,
        custom_id: fresh.id,
        amount: { value: fresh.amountUsd },
        supplementary_data: { related_ids: { order_id: fresh.orderId } },
      },
    },
    false,
    base,
  );
  return { summary: result.summary };
}

export type Report = {
  source: "local-ledger" | "paypal-reporting+local-ledger";
  notice: string;
  generatedAt: string;
  paypalError?: string;
  paypalRows: PaypalTxn[];
  rows: LedgerEntry[];
  totals: { inflowUsd: string; refundUsd: string; payoutUsd: string; invoiceUsd: string; netUsd: string };
};

function money(n: number): string {
  return n.toFixed(2);
}

export async function reconcile(): Promise<Report> {
  const rows = readStore().ledger;
  let paypalRows: PaypalTxn[] = [];
  let paypalError: string | undefined;
  if (config.mode === "sandbox") {
    try {
      paypalRows = await searchTransactions();
    } catch (error) {
      paypalError = error instanceof Error ? error.message : "Transaction Search failed";
    }
  }
  const inflow = rows.filter((row) => row.type === "capture" || row.type === "donation").reduce((sum, row) => sum + Number(row.amountUsd), 0);
  const refunded = rows.filter((row) => row.type === "refund").reduce((sum, row) => sum + Number(row.amountUsd), 0);
  const payouts = rows.filter((row) => row.type === "payout").reduce((sum, row) => sum + Number(row.amountUsd), 0);
  const invoices = rows.filter((row) => row.type === "invoice").reduce((sum, row) => sum + Number(row.amountUsd), 0);
  const emptyPaypal = config.mode === "sandbox" && !paypalError && paypalRows.length === 0;
  const notice = config.mode !== "sandbox"
    ? "PayPal Transaction Search runs only against the sandbox. This reimbursement pack uses the local capture, webhook, refund, and payout ledger."
    : paypalError
      ? `Transaction Search was not available (${paypalError}). Sandbox reporting often lags for hours and needs the Transaction Search permission. The pack below is the local ledger.`
      : emptyPaypal
        ? "Transaction Search returned no rows. Sandbox reporting often lags for hours after a capture. The pack below is the local ledger of captures and webhooks."
        : "Transaction Search returned rows. They are listed beside the local ledger, which is still the book the club files for reimbursement.";
  return {
    source: paypalRows.length ? "paypal-reporting+local-ledger" : "local-ledger",
    notice,
    generatedAt: nowIso(),
    paypalError,
    paypalRows,
    rows,
    totals: {
      inflowUsd: money(inflow),
      refundUsd: money(refunded),
      payoutUsd: money(payouts),
      invoiceUsd: money(invoices),
      netUsd: money(inflow - refunded - payouts),
    },
  };
}

export function reportCsv(report: Report): string {
  const lines = [
    "section,date,type,counterparty,email,amount_usd,currency,status,reference,note,source",
  ];
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  for (const row of report.rows) {
    lines.push(
      ["local-ledger", row.at, row.type, row.counterparty, row.email, row.amountUsd, row.currency, row.status, row.reference, row.note, row.source]
        .map(cell)
        .join(","),
    );
  }
  for (const row of report.paypalRows) {
    lines.push(
      ["paypal-transaction-search", row.at, "transaction", "", row.email, row.amountUsd, "USD", row.status, row.id, row.note, "paypal"]
        .map(cell)
        .join(","),
    );
  }
  lines.push(cell(`notice: ${report.notice}`));
  return lines.join("\n");
}

export function appBaseFallback(): string {
  return publicBase();
}
