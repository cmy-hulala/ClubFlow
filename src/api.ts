const root = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${root}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  let data: { error?: string } = {};
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string };
    } catch {
      data = { error: text.slice(0, 300) };
    }
  }
  if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
  return data as T;
}

export type MoneyMode = "sandbox" | "mock" | "setup";

export type Attendee = {
  id: string;
  name: string;
  email: string;
  role: "attendee" | "speaker" | "donor";
  status: "unpaid" | "paid" | "refunded" | "donated";
  amountUsd: string;
  orderId?: string;
  captureId?: string;
};

export type DeskState = {
  mode: MoneyMode;
  banner: string;
  clientId: string | null;
  ai: { provider: "openai" | "rules"; model: string; toolkit: boolean; toolCount: number };
  event: {
    title: string;
    clubName: string;
    date: string;
    startTime: string;
    endTime: string;
    venue: string;
    capacity: number;
    registrationUsd: string;
    speakerFeeUsd: string;
    duesUsd: string;
    sponsorName: string;
    sponsorEmail: string;
    sponsorInvoiceUsd: string;
    donationUsd: string;
    speakerName: string;
  };
  attendees: Attendee[];
  invoices: {
    id: string;
    number: string;
    sponsorName: string;
    sponsorEmail: string;
    amountUsd: string;
    memo: string;
    status: "draft" | "sent";
    paypalId?: string;
  }[];
  plans: { id: string; name: string; amountUsd: string; status: string; paypalPlanId?: string }[];
  subscriptions: { id: string; name: string; email: string; amountUsd: string; status: string; approveUrl?: string }[];
  outbox: { id: string; at: string; to: string; subject: string; text: string; kind: string; delivered: string }[];
  webhooks: { id: string; type: string; summary: string; verified: boolean }[];
  certificates: { id: string; attendeeId: string; title: string }[];
  ledger: { id: string; type: string; counterparty: string; amountUsd: string; status: string; source: string; note: string; at: string }[];
};

export type Report = {
  source: string;
  notice: string;
  totals: { inflowUsd: string; refundUsd: string; payoutUsd: string; invoiceUsd: string; netUsd: string };
  rows: { at: string; type: string; counterparty: string; amountUsd: string; status: string; reference: string; source: string; note: string }[];
  paypalRows: { id: string; at: string; amountUsd: string; status: string; note: string }[];
};
