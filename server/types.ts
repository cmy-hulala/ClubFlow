export type AttendeeRole = "attendee" | "speaker" | "donor";
export type AttendeeStatus = "unpaid" | "paid" | "refunded" | "donated";

export type Attendee = {
  id: string;
  name: string;
  email: string;
  role: AttendeeRole;
  status: AttendeeStatus;
  amountUsd: string;
  orderId?: string;
  captureId?: string;
  approveUrl?: string;
  payoutStatus?: string;
  payoutDetail?: string;
  receiptSent: boolean;
  thanksSent: boolean;
};

export type LedgerType = "capture" | "donation" | "refund" | "payout" | "invoice" | "subscription";

export type LedgerEntry = {
  id: string;
  at: string;
  type: LedgerType;
  counterparty: string;
  email: string;
  amountUsd: string;
  currency: "USD";
  status: string;
  reference: string;
  note: string;
  source: "sandbox" | "mock" | "seed" | "webhook";
};

export type InvoiceStatus = "draft" | "sent";

export type InvoiceRecord = {
  id: string;
  paypalId?: string;
  number: string;
  sponsorName: string;
  sponsorEmail: string;
  amountUsd: string;
  memo: string;
  status: InvoiceStatus;
  at: string;
};

export type PayoutRecord = {
  id: string;
  paypalBatchId?: string;
  attendeeId: string;
  name: string;
  email: string;
  amountUsd: string;
  /** PayPal payout item transaction_status, not the batch status. */
  status: string;
  batchStatus?: string;
  error?: string;
  at: string;
};

export type PlanRecord = {
  id: string;
  paypalProductId?: string;
  paypalPlanId?: string;
  name: string;
  amountUsd: string;
  interval: "MONTH";
  status: "local" | "active";
  at: string;
};

export type SubscriptionRecord = {
  id: string;
  planId: string;
  paypalId?: string;
  name: string;
  email: string;
  amountUsd: string;
  status: "approval_pending" | "active";
  approveUrl?: string;
  at: string;
};

export type OutboxMail = {
  id: string;
  at: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  kind: "receipt" | "thanks" | "invoice" | "other";
  delivered: "outbox" | "resend" | "smtp";
  error?: string;
};

export type WebhookLog = {
  id: string;
  at: string;
  type: string;
  summary: string;
  verified: boolean;
};

export type CertificateRecord = {
  id: string;
  at: string;
  attendeeId: string;
  title: string;
  pdfBase64: string;
};

export type PendingAction =
  | { id: string; action: "refund"; attendeeId: string; summary: string; at: string }
  | { id: string; action: "payout"; attendeeId: string; summary: string; at: string }
  | {
      id: string;
      action: "send_invoice";
      invoiceId?: string;
      sponsorName: string;
      sponsorEmail: string;
      amountUsd: string;
      memo: string;
      summary: string;
      at: string;
    };

export type ClubEvent = {
  id: string;
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
  contactEmail: string;
};

export type StoreData = {
  event: ClubEvent;
  attendees: Attendee[];
  ledger: LedgerEntry[];
  invoices: InvoiceRecord[];
  payouts: PayoutRecord[];
  plans: PlanRecord[];
  subscriptions: SubscriptionRecord[];
  outbox: OutboxMail[];
  webhooks: WebhookLog[];
  certificates: CertificateRecord[];
  pending: PendingAction[];
  seenEvents: string[];
};
