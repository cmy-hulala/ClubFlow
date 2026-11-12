import nodemailer from "nodemailer";
import { config } from "./config.js";
import { nid, nowIso, updateStore } from "./store.js";
import type { OutboxMail } from "./types.js";

export async function deliver(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  kind: OutboxMail["kind"];
}): Promise<OutboxMail> {
  let delivered: OutboxMail["delivered"] = "outbox";
  let error: string | undefined;
  if (config.resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.resendFrom,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      });
      if (!res.ok) {
        error = `Resend ${res.status}: ${(await res.text()).slice(0, 400)}`;
      } else {
        delivered = "resend";
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Resend failed";
    }
  } else if (config.smtpHost) {
    try {
      const transport = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
      });
      await transport.sendMail({
        from: config.smtpFrom,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      delivered = "smtp";
    } catch (err) {
      error = err instanceof Error ? err.message : "SMTP failed";
    }
  }
  const mail: OutboxMail = {
    id: nid("mail"),
    at: nowIso(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    kind: input.kind,
    delivered,
    error,
  };
  updateStore((store) => {
    store.outbox.unshift(mail);
  });
  return mail;
}
