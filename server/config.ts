import "dotenv/config";

export type PayPalMode = "sandbox" | "mock" | "setup";

function flag(name: string): string {
  return (process.env[name] ?? "").trim();
}

const clientId = flag("PAYPAL_CLIENT_ID");
const clientSecret = flag("PAYPAL_CLIENT_SECRET");
const mockFlag = flag("MOCK_PAYPAL").toLowerCase();
const paypalEnv = (flag("PAYPAL_ENV") || "sandbox").toLowerCase();

if (paypalEnv === "live" || paypalEnv === "production") {
  throw new Error("ClubFlow refuses PAYPAL_ENV=live. Use the PayPal sandbox.");
}

const hasCreds = Boolean(clientId && clientSecret);

function resolveMode(): PayPalMode {
  if (mockFlag === "1" || mockFlag === "true" || mockFlag === "yes") return "mock";
  if (hasCreds) return "sandbox";
  if (mockFlag === "0" || mockFlag === "false" || mockFlag === "no") return "setup";
  return "mock";
}

const mode = resolveMode();

const banners: Record<PayPalMode, string> = {
  sandbox:
    "Connected to the PayPal sandbox (USD). Buttons and API calls use your sandbox REST app, not a live account. Buyers need a sandbox personal account.",
  mock:
    mockFlag === "1" || mockFlag === "true" || mockFlag === "yes"
      ? "MOCK_PAYPAL=1 is on. Orders, invoices, payouts, subscriptions, refunds, and reports are simulated in this process. Nothing is sent to PayPal. Unset MOCK_PAYPAL and add sandbox credentials to use the real sandbox."
      : "No PayPal sandbox credentials found, so this demo is simulating Orders, Invoicing, Payouts, Subscriptions, Refunds, and reports. Nothing is sent to PayPal. Create a sandbox REST app, set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, leave MOCK_PAYPAL unset, and restart.",
  setup:
    "PayPal credentials are missing and MOCK_PAYPAL=0, so money actions are turned off. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, or set MOCK_PAYPAL=1 to click through the demo.",
};

export const config = {
  mode,
  banner: banners[mode],
  clientId,
  clientSecret,
  webhookId: flag("PAYPAL_WEBHOOK_ID"),
  merchantEmail: flag("PAYPAL_MERCHANT_EMAIL") || "sb-merchant@business.example.com",
  speakerEmail: flag("PAYPAL_SPEAKER_EMAIL") || "speaker-ken-lin@personal.example.com",
  openaiKey: flag("OPENAI_API_KEY"),
  openaiModel: flag("OPENAI_MODEL") || "gpt-4o-mini",
  openaiBase: (flag("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, ""),
  resendKey: flag("RESEND_API_KEY"),
  resendFrom: flag("RESEND_FROM") || "ClubFlow <onboarding@resend.dev>",
  smtpHost: flag("SMTP_HOST"),
  smtpPort: Number(flag("SMTP_PORT") || "587"),
  smtpUser: flag("SMTP_USER"),
  smtpPass: flag("SMTP_PASS"),
  smtpFrom: flag("SMTP_FROM") || "ClubFlow <eic.nycu@example.com>",
  port: Number(flag("PORT") || "8787"),
  corsOrigin: flag("CORS_ORIGIN"),
  paypalBase: "https://api-m.sandbox.paypal.com",
};

export function publicBase(req?: { protocol: string; get(name: string): string | undefined }): string {
  const fromEnv = flag("PUBLIC_BASE_URL").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production" && req) {
    const host = req.get("host");
    if (host) return `${req.protocol}://${host}`;
  }
  return "http://127.0.0.1:43123";
}

export function aiStatus(toolkit: boolean): { provider: "openai" | "rules"; model: string; toolkit: boolean } {
  if (config.openaiKey) {
    return { provider: "openai", model: config.openaiModel, toolkit: toolkit && config.mode === "sandbox" };
  }
  return { provider: "rules", model: "deterministic-intent", toolkit: false };
}
