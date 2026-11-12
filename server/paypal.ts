import { randomUUID } from "node:crypto";
import { config } from "./config.js";

type Json = Record<string, unknown>;

let cached: { value: string; exp: number } | null = null;

function paypalMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Json;
  const details = Array.isArray(record.details) ? record.details : [];
  const first = details[0] as Json | undefined;
  const detail = typeof first?.description === "string" ? first.description : "";
  const message = typeof record.message === "string" ? record.message : "";
  const name = typeof record.name === "string" ? record.name : "";
  return [name, message, detail].filter(Boolean).join(" — ") || fallback;
}

async function token(): Promise<string> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error("PayPal sandbox credentials are missing.");
  }
  if (cached && cached.exp > Date.now() + 30_000) return cached.value;
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res = await fetch(`${config.paypalBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json()) as Json;
  if (!res.ok || typeof data.access_token !== "string") {
    throw new Error(`PayPal auth failed: ${paypalMessage(data, res.statusText)}`);
  }
  const expires = typeof data.expires_in === "number" ? data.expires_in : 300;
  cached = { value: data.access_token, exp: Date.now() + expires * 1000 };
  return data.access_token;
}

export async function paypal<T = Json>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const access = await token();
  const res = await fetch(`${config.paypalBase}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "PayPal-Request-Id": randomUUID(),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { message: text.slice(0, 500) };
    }
  }
  if (!res.ok) {
    throw new Error(`PayPal ${res.status} ${path}: ${paypalMessage(data, text.slice(0, 300) || res.statusText)}`);
  }
  return data as T;
}

export async function createOrder(input: {
  amount: string;
  customId: string;
  description: string;
}): Promise<{ id: string }> {
  const data = await paypal<{ id?: string }>("/v2/checkout/orders", {
    method: "POST",
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.customId,
          description: input.description.slice(0, 127),
          amount: { currency_code: "USD", value: input.amount },
        },
      ],
    },
  });
  if (!data.id) throw new Error("PayPal did not return an order id.");
  return { id: data.id };
}

export function captureIdOf(order: Json): string | undefined {
  const units = Array.isArray(order.purchase_units) ? order.purchase_units : [];
  for (const unit of units) {
    if (!unit || typeof unit !== "object") continue;
    const payments = (unit as Json).payments as Json | undefined;
    const captures = payments && Array.isArray(payments.captures) ? payments.captures : [];
    const first = captures[0] as Json | undefined;
    if (first && typeof first.id === "string") return first.id;
  }
  return undefined;
}

export async function captureOrder(orderId: string): Promise<{ captureId: string; raw: Json }> {
  try {
    const raw = await paypal<Json>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      body: {},
    });
    const captureId = captureIdOf(raw);
    if (!captureId) throw new Error("PayPal captured the order but returned no capture id.");
    return { captureId, raw };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/ORDER_ALREADY_CAPTURED|already been captured/i.test(message)) throw error;
    const raw = await paypal<Json>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    const captureId = captureIdOf(raw);
    if (!captureId) throw error;
    return { captureId, raw };
  }
}

export async function refundCapture(captureId: string, amount: string, note: string): Promise<{ id: string }> {
  const data = await paypal<{ id?: string }>(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    body: {
      amount: { currency_code: "USD", value: amount },
      note_to_payer: note.slice(0, 255),
    },
  });
  return { id: data.id || `refund-${captureId}` };
}

export async function createInvoice(input: {
  number: string;
  sponsorName: string;
  sponsorEmail: string;
  amount: string;
  memo: string;
  itemName: string;
}): Promise<{ id: string }> {
  const [given = "Sponsor", ...rest] = input.sponsorName.split(" ");
  const surname = rest.join(" ") || "Sponsor";
  const data = await paypal<{ id?: string }>("/v2/invoicing/invoices", {
    method: "POST",
    body: {
      detail: {
        invoice_number: input.number,
        currency_code: "USD",
        note: input.memo,
        payment_term: { term_type: "DUE_ON_RECEIPT" },
      },
      invoicer: {
        email_address: config.merchantEmail,
        name: { given_name: "ClubFlow", surname: "EIC" },
      },
      primary_recipients: [
        {
          billing_info: {
            email_address: input.sponsorEmail,
            name: { given_name: given, surname },
          },
        },
      ],
      items: [
        {
          name: input.itemName,
          quantity: "1",
          unit_amount: { currency_code: "USD", value: input.amount },
        },
      ],
    },
  });
  if (!data.id) throw new Error("PayPal did not return an invoice id.");
  return { id: data.id };
}

export async function sendInvoice(invoiceId: string): Promise<void> {
  await paypal(`/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`, {
    method: "POST",
    body: { send_to_recipient: true, send_to_invoicer: false },
  });
}

export async function createPayout(input: {
  email: string;
  amount: string;
  note: string;
  batchId: string;
}): Promise<{ batchId: string }> {
  const data = await paypal<{ batch_header?: { payout_batch_id?: string } }>("/v1/payments/payouts", {
    method: "POST",
    body: {
      sender_batch_header: {
        sender_batch_id: input.batchId,
        email_subject: "Speaker fee from NYCU EIC",
        email_message: input.note,
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: input.amount, currency: "USD" },
          note: input.note.slice(0, 400),
          sender_item_id: input.batchId,
          receiver: input.email,
        },
      ],
    },
  });
  return { batchId: data.batch_header?.payout_batch_id || input.batchId };
}

export async function createProduct(name: string, description: string): Promise<{ id: string }> {
  const data = await paypal<{ id?: string }>("/v1/catalogs/products", {
    method: "POST",
    body: { name, description, type: "SERVICE", category: "SOFTWARE" },
  });
  if (!data.id) throw new Error("PayPal did not return a product id.");
  return { id: data.id };
}

export async function createPlan(input: { productId: string; name: string; amount: string }): Promise<{ id: string }> {
  const data = await paypal<{ id?: string }>("/v1/billing/plans", {
    method: "POST",
    body: {
      product_id: input.productId,
      name: input.name,
      description: "Recurring club dues collected by ClubFlow",
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: input.amount, currency_code: "USD" } },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 2,
      },
    },
  });
  if (!data.id) throw new Error("PayPal did not return a plan id.");
  return { id: data.id };
}

export async function createSubscription(input: {
  planId: string;
  givenName: string;
  surname: string;
  email: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; approveUrl?: string }> {
  const data = await paypal<{ id?: string; links?: { rel?: string; href?: string }[] }>("/v1/billing/subscriptions", {
    method: "POST",
    body: {
      plan_id: input.planId,
      subscriber: {
        name: { given_name: input.givenName, surname: input.surname },
        email_address: input.email,
      },
      application_context: {
        brand_name: "ClubFlow",
        user_action: "SUBSCRIBE_NOW",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    },
  });
  const approve = data.links?.find((link) => link.rel === "approve")?.href;
  if (!data.id) throw new Error("PayPal did not return a subscription id.");
  return { id: data.id, approveUrl: approve };
}

export type PaypalTxn = {
  id: string;
  at: string;
  amountUsd: string;
  status: string;
  note: string;
  email: string;
};

export async function searchTransactions(): Promise<PaypalTxn[]> {
  const end = new Date(Date.now() - 60 * 60 * 1000);
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const stamp = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "-0000");
  const query = new URLSearchParams({
    start_date: stamp(start),
    end_date: stamp(end),
    fields: "transaction_info",
    page_size: "100",
  });
  const data = await paypal<{ transaction_details?: Json[] }>(`/v1/reporting/transactions?${query.toString()}`);
  const rows = Array.isArray(data.transaction_details) ? data.transaction_details : [];
  return rows.map((row) => {
    const info = (row.transaction_info ?? {}) as Json;
    const amount = (info.transaction_amount ?? {}) as Json;
    const payer = (row.payer_info ?? {}) as Json;
    return {
      id: String(info.transaction_id ?? ""),
      at: String(info.transaction_initiation_date ?? ""),
      amountUsd: String(amount.value ?? ""),
      status: String(info.transaction_status ?? ""),
      note: String(info.transaction_subject ?? info.transaction_note ?? ""),
      email: String(payer.email_address ?? ""),
    };
  });
}

export async function verifyWebhook(
  headers: Record<string, string | undefined>,
  event: unknown,
): Promise<"verified" | "unverified" | "failed"> {
  if (config.mode !== "sandbox" || !config.webhookId) return "unverified";
  const data = await paypal<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: config.webhookId,
      webhook_event: event,
    },
  });
  return data.verification_status === "SUCCESS" ? "verified" : "failed";
}
