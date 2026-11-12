import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "./config.js";
import type { PendingAction, StoreData } from "./types.js";

export function nid(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function usd(value: string | number): string {
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0.01 || n > 10000) {
    throw new Error("Amount must be a USD value from 0.01 to 10000.00.");
  }
  return n.toFixed(2);
}

function storePath(): string {
  if (process.env.CLUBFLOW_STORE) return process.env.CLUBFLOW_STORE;
  if (process.env.VERCEL) return path.join(os.tmpdir(), "clubflow-store.json");
  return path.resolve("data/store.json");
}

export function seedStore(): StoreData {
  const fee = "12.00";
  const event = {
    id: "evt_first_funding",
    title: "From zero to one: how a campus team lands its first check",
    clubName: "NYCU Entrepreneurship & Innovation Club",
    date: "2026-11-21",
    startTime: "14:00",
    endTime: "16:30",
    venue: "NYCU Kuang-Fu Campus, Engineering Building 3, Room EC 201",
    capacity: 80,
    registrationUsd: fee,
    speakerFeeUsd: "150.00",
    duesUsd: "8.00",
    sponsorName: "Lane Lab",
    sponsorEmail: "lane.lab@example.com",
    sponsorInvoiceUsd: "500.00",
    donationUsd: "25.00",
    speakerName: "Ken Lin",
    contactEmail: "eic.nycu@example.com",
  };
  const at = "2026-11-08T03:00:00.000Z";
  return {
    event,
    attendees: [
      {
        id: "att_mia",
        name: "Mia Chen",
        email: "mia.chen@example.com",
        role: "attendee",
        status: "paid",
        amountUsd: fee,
        orderId: "ORDER-SEED-MIA",
        captureId: "CAP-SEED-MIA",
        receiptSent: true,
        thanksSent: false,
      },
      {
        id: "att_jonah",
        name: "Jonah Wu",
        email: "jonah.wu@example.com",
        role: "attendee",
        status: "unpaid",
        amountUsd: fee,
        receiptSent: false,
        thanksSent: false,
      },
      {
        id: "att_priya",
        name: "Priya Shah",
        email: "priya.shah@example.com",
        role: "attendee",
        status: "paid",
        amountUsd: fee,
        orderId: "ORDER-SEED-PRIYA",
        captureId: "CAP-SEED-PRIYA",
        receiptSent: true,
        thanksSent: false,
      },
      {
        id: "att_alex",
        name: "Alex Kim",
        email: "alex.kim@example.com",
        role: "attendee",
        status: "unpaid",
        amountUsd: fee,
        receiptSent: false,
        thanksSent: false,
      },
      {
        id: "att_sofia",
        name: "Sofia Alvarez",
        email: "sofia.alvarez@example.com",
        role: "attendee",
        status: "refunded",
        amountUsd: fee,
        orderId: "ORDER-SEED-SOFIA",
        captureId: "CAP-SEED-SOFIA",
        receiptSent: true,
        thanksSent: false,
      },
      {
        id: "spk_ken",
        name: "Ken Lin",
        email: config.speakerEmail,
        role: "speaker",
        status: "unpaid",
        amountUsd: event.speakerFeeUsd,
        receiptSent: false,
        thanksSent: false,
      },
    ],
    ledger: [
      {
        id: "led_mia",
        at,
        type: "capture",
        counterparty: "Mia Chen",
        email: "mia.chen@example.com",
        amountUsd: fee,
        currency: "USD",
        status: "COMPLETED",
        reference: "CAP-SEED-MIA",
        note: "Seeded registration fee",
        source: "seed",
      },
      {
        id: "led_priya",
        at,
        type: "capture",
        counterparty: "Priya Shah",
        email: "priya.shah@example.com",
        amountUsd: fee,
        currency: "USD",
        status: "COMPLETED",
        reference: "CAP-SEED-PRIYA",
        note: "Seeded registration fee",
        source: "seed",
      },
      {
        id: "led_sofia_in",
        at,
        type: "capture",
        counterparty: "Sofia Alvarez",
        email: "sofia.alvarez@example.com",
        amountUsd: fee,
        currency: "USD",
        status: "COMPLETED",
        reference: "CAP-SEED-SOFIA",
        note: "Seeded registration fee",
        source: "seed",
      },
      {
        id: "led_sofia_out",
        at: "2026-11-09T03:00:00.000Z",
        type: "refund",
        counterparty: "Sofia Alvarez",
        email: "sofia.alvarez@example.com",
        amountUsd: fee,
        currency: "USD",
        status: "COMPLETED",
        reference: "CAP-SEED-SOFIA",
        note: "Seeded refund (schedule conflict)",
        source: "seed",
      },
    ],
    invoices: [],
    payouts: [],
    plans: [
      {
        id: "plan_dues",
        name: "EIC monthly dues",
        amountUsd: event.duesUsd,
        interval: "MONTH",
        status: "local",
        at,
      },
    ],
    subscriptions: [],
    outbox: [
      {
        id: "mail_seed_mia",
        at,
        to: "mia.chen@example.com",
        subject: `Receipt — ${event.title}`,
        text: `Receipt for Mia Chen. Registration ${fee} USD. Reference CAP-SEED-MIA. This seeded receipt was not emailed.`,
        html: `<p>Receipt for <strong>Mia Chen</strong>. Registration <strong>${fee} USD</strong>. Reference CAP-SEED-MIA.</p>`,
        kind: "receipt",
        delivered: "outbox",
      },
    ],
    webhooks: [],
    certificates: [],
    pending: [],
    seenEvents: [],
  };
}

let memory: StoreData | null = null;

function load(): StoreData {
  if (memory) return memory;
  const file = storePath();
  try {
    memory = JSON.parse(readFileSync(file, "utf8")) as StoreData;
    return memory;
  } catch {
    memory = seedStore();
    persist();
    return memory;
  }
}

function persist(): void {
  if (!memory) return;
  const file = storePath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(memory, null, 2));
}

export function readStore(): StoreData {
  return load();
}

export function updateStore<T>(mutator: (store: StoreData) => T): T {
  const store = load();
  const result = mutator(store);
  persist();
  return result;
}

export function resetStore(): StoreData {
  memory = seedStore();
  persist();
  return memory;
}

export function findAttendee(id: string) {
  return load().attendees.find((item) => item.id === id);
}

export function rememberPending(action: PendingAction): PendingAction {
  return updateStore((store) => {
    store.pending.push(action);
    return action;
  });
}

export function takePending(id: string): PendingAction | undefined {
  return updateStore((store) => {
    const index = store.pending.findIndex((item) => item.id === id);
    if (index < 0) return undefined;
    const [item] = store.pending.splice(index, 1);
    return item;
  });
}
