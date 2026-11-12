import express, { type Request, type Response } from "express";
import path from "node:path";
import { agentMeta, chat } from "./agent.js";
import { aiStatus, config, publicBase } from "./config.js";
import {
  applyWebhook,
  captureCheckout,
  deliverInvoice,
  draftInvoice,
  openCheckout,
  paySpeaker,
  publishDuesPlan,
  reconcile,
  refreshOpenPayouts,
  refreshPayoutStatuses,
  refundAttendee,
  reportCsv,
  simulateCaptureWebhook,
  subscribeMember,
} from "./money.js";
import { PaypalError, verifyWebhook } from "./paypal.js";
import { readStore, resetStore, takePending } from "./store.js";
import type { PendingAction } from "./types.js";

function snapshot() {
  const data = readStore();
  return {
    mode: config.mode,
    banner: config.banner,
    clientId: config.mode === "sandbox" ? config.clientId : null,
    event: data.event,
    attendees: data.attendees,
    ledger: data.ledger,
    invoices: data.invoices,
    payouts: data.payouts,
    plans: data.plans,
    subscriptions: data.subscriptions,
    outbox: data.outbox,
    webhooks: data.webhooks,
    certificates: data.certificates.map((item) => ({
      id: item.id,
      at: item.at,
      attendeeId: item.attendeeId,
      title: item.title,
    })),
  };
}

function fail(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Request failed";
  const paypalStatus = /PayPal (\d{3})/.exec(message);
  const status = /not found/i.test(message) ? 404 : paypalStatus ? Number(paypalStatus[1]) : 400;
  if (res.headersSent) return;
  const body: { error: string; debug_id?: string; issues?: string[] } = { error: message };
  if (error instanceof PaypalError) {
    if (error.debugId) body.debug_id = error.debugId;
    if (error.issues.length) body.issues = error.issues;
  }
  res.status(status).json(body);
}

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((error: unknown) => fail(res, error));
  };
}

function flatHeaders(req: Request): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    out[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

async function executePending(pending: PendingAction): Promise<string> {
  if (pending.action === "refund") {
    const row = await refundAttendee(pending.attendeeId);
    return `Refunded ${row.amountUsd} USD to ${row.name}. The roster now shows refunded.`;
  }
  if (pending.action === "payout") {
    const row = await paySpeaker(pending.attendeeId);
    const detail = row.payoutDetail ? ` ${row.payoutDetail}.` : "";
    if (row.payoutStatus === "SUCCESS") {
      return `Speaker fee ${row.amountUsd} USD to ${row.name} item status SUCCESS. Reference ${row.captureId}.`;
    }
    return `Speaker payout ${row.captureId} for ${row.name}: item status ${row.payoutStatus || "PENDING"}.${detail} Batch success is not payment. The roster stays unpaid until PayPal reports item status SUCCESS. UNCLAIMED with RECEIVER_UNREGISTERED means PAYPAL_SPEAKER_EMAIL is not a sandbox personal account.`;
  }
  let invoiceId = pending.invoiceId;
  if (!invoiceId) {
    const draft = await draftInvoice({
      sponsorName: pending.sponsorName,
      sponsorEmail: pending.sponsorEmail,
      amount: pending.amountUsd,
      memo: pending.memo,
    });
    invoiceId = draft.id;
  }
  const sent = await deliverInvoice(invoiceId);
  return `Invoice ${sent.number} for ${sent.amountUsd} USD was sent to ${sent.sponsorEmail}. A copy is in the outbox.`;
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.corsOrigin) {
    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      if (req.method === "OPTIONS") {
        res.end();
        return;
      }
      next();
    });
  }

  app.post(
    "/api/paypal/webhook",
    express.raw({ type: "application/json", limit: "1mb" }),
    wrap(async (req, res) => {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      let event: { id?: string; event_type?: string; resource?: Record<string, unknown> };
      try {
        event = JSON.parse(raw || "{}") as typeof event;
      } catch {
        throw new Error("Webhook body was not JSON.");
      }
      const verdict = await verifyWebhook(flatHeaders(req), event);
      if (verdict === "failed") throw new Error("PayPal webhook signature was rejected.");
      const result = await applyWebhook(event, verdict === "verified", publicBase(req));
      res.json({ ...result, verified: verdict === "verified" });
    }),
  );

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: config.mode, ai: aiStatus(false) });
  });

  app.get(
    "/api/state",
    wrap(async (_req, res) => {
      await refreshOpenPayouts();
      const ai = await agentMeta();
      res.json({ ...snapshot(), ai });
    }),
  );

  app.post("/api/demo/reset", (_req, res) => {
    resetStore();
    res.json(snapshot());
  });

  app.post(
    "/api/checkout/orders",
    wrap(async (req, res) => {
      const body = req.body ?? {};
      const result = await openCheckout({
        kind: body.kind === "donation" ? "donation" : "registration",
        attendeeId: typeof body.attendeeId === "string" ? body.attendeeId : undefined,
        donorName: typeof body.donorName === "string" ? body.donorName : undefined,
        donorEmail: typeof body.donorEmail === "string" ? body.donorEmail : undefined,
        amount: typeof body.amount === "string" ? body.amount : undefined,
      });
      res.json({ ...result, mode: config.mode });
    }),
  );

  app.post(
    "/api/checkout/orders/:orderId/capture",
    wrap(async (req, res) => {
      const attendee = await captureCheckout(req.params.orderId, publicBase(req));
      res.json({ attendee, state: snapshot() });
    }),
  );

  app.post(
    "/api/refunds",
    wrap(async (req, res) => {
      const attendee = await refundAttendee(String(req.body?.attendeeId ?? ""));
      res.json({ attendee, state: snapshot() });
    }),
  );

  app.post(
    "/api/invoices",
    wrap(async (req, res) => {
      const invoice = await draftInvoice({
        sponsorName: typeof req.body?.sponsorName === "string" ? req.body.sponsorName : undefined,
        sponsorEmail: typeof req.body?.sponsorEmail === "string" ? req.body.sponsorEmail : undefined,
        amount: typeof req.body?.amount === "string" ? req.body.amount : undefined,
        memo: typeof req.body?.memo === "string" ? req.body.memo : undefined,
      });
      res.json({ invoice });
    }),
  );

  app.post(
    "/api/invoices/:invoiceId/send",
    wrap(async (req, res) => {
      const invoice = await deliverInvoice(req.params.invoiceId);
      res.json({ invoice, state: snapshot() });
    }),
  );

  app.post(
    "/api/payouts",
    wrap(async (req, res) => {
      const attendee = await paySpeaker(typeof req.body?.attendeeId === "string" ? req.body.attendeeId : undefined);
      res.json({ attendee, state: snapshot() });
    }),
  );

  app.post(
    "/api/payouts/refresh",
    wrap(async (req, res) => {
      const attendeeId = String(req.body?.attendeeId ?? "");
      const attendee = await refreshPayoutStatuses(attendeeId || undefined);
      if (attendeeId && !attendee) throw new Error(`Attendee not found: ${attendeeId}`);
      res.json({ attendee, state: snapshot() });
    }),
  );

  app.post(
    "/api/billing/plans",
    wrap(async (req, res) => {
      const plan = await publishDuesPlan(typeof req.body?.planId === "string" ? req.body.planId : undefined);
      res.json({ plan });
    }),
  );

  app.post(
    "/api/billing/subscriptions",
    wrap(async (req, res) => {
      const result = await subscribeMember({
        planId: typeof req.body?.planId === "string" ? req.body.planId : undefined,
        name: String(req.body?.name ?? ""),
        email: String(req.body?.email ?? ""),
        base: publicBase(req),
      });
      res.json(result);
    }),
  );

  app.post(
    "/api/paypal/webhook/simulate",
    wrap(async (req, res) => {
      const result = await simulateCaptureWebhook(String(req.body?.attendeeId ?? ""), publicBase(req));
      res.json({ ...result, state: snapshot() });
    }),
  );

  app.get(
    "/api/reports/reimbursement",
    wrap(async (_req, res) => {
      res.json(await reconcile());
    }),
  );

  app.get(
    "/api/reports/reimbursement.csv",
    wrap(async (_req, res) => {
      const report = await reconcile();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"clubflow-reimbursement.csv\"");
      res.send(reportCsv(report));
    }),
  );

  app.get(
    "/api/certificates/:file",
    (req, res) => {
      const id = req.params.file.replace(/\.pdf$/i, "");
      const cert = readStore().certificates.find((item) => item.id === id);
      if (!cert) {
        res.status(404).json({ error: "Certificate not found." });
        return;
      }
      const body = Buffer.from(cert.pdfBase64, "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${id}.pdf"`);
      res.send(body);
    },
  );

  app.post(
    "/api/agent/chat",
    wrap(async (req, res) => {
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      if (!message) throw new Error("Message is required.");
      const history = Array.isArray(req.body?.history)
        ? req.body.history
            .flatMap((item: unknown) => {
              if (!item || typeof item !== "object") return [];
              const record = item as { role?: unknown; content?: unknown };
              const content = typeof record.content === "string" ? record.content : "";
              if (!content) return [];
              return [{ role: record.role === "assistant" ? ("assistant" as const) : ("user" as const), content }];
            })
            .slice(-8)
        : [];
      res.json(await chat(message, history));
    }),
  );

  app.post(
    "/api/agent/confirm",
    wrap(async (req, res) => {
      const pending = takePending(String(req.body?.id ?? ""));
      if (!pending) throw new Error("That confirmation expired. Ask again.");
      const reply = await executePending(pending);
      res.json({ reply, state: snapshot() });
    }),
  );

  app.post("/api/agent/cancel", (req, res) => {
    takePending(String(req.body?.id ?? ""));
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV === "production") {
    const dist = path.resolve("dist");
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(path.join(dist, "index.html"), (error) => {
        if (error) next();
      });
    });
  }

  return app;
}

export const app = createApp();
