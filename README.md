# ClubFlow

ClubFlow is an officer copilot for a student club. One event brief still becomes ready-to-copy Instagram, Story, LINE, and email previews. PayPal now runs the money for that same event: registration, sponsor invoices, donations, speaker payouts, monthly dues, refunds, and the reimbursement report.

The demo club is the fictional **NYCU Entrepreneurship & Innovation Club**. People, inboxes, and `example.com` links are not real. Do not email the sample addresses.

Currency in the money desk is **USD**. PayPal calls go to the **sandbox** only. The app refuses `PAYPAL_ENV=live`.

## What you can do

Open the **Money desk**. Three columns:

- **Left.** The seeded workshop (title, time, room, fees) and generated channel copy. Copy is still a local template. Nothing is posted to Instagram, LINE, or Gmail.
- **Middle.** The attendee roster with payment status, PayPal Checkout, invoices, donations, payouts, dues, and the reimbursement report.
- **Right.** An officer agent. With `OPENAI_API_KEY` it calls a model and the official PayPal agent toolkit. Without a key it uses a built-in intent parser so the demo still runs. Refunds, payouts, and sending an invoice wait for a **Confirm** button.

The older brief, marketplace, and output gallery are still in the sidebar.

## Architecture

```text
Browser (Vite + TypeScript)
  money desk, channel copy, PayPal JS SDK buttons
        |  /api
Express (server/)
  roster + ledger JSON file
  PayPal REST (sandbox) or MOCK_PAYPAL
  email via Resend, SMTP, or the in-app outbox
  officer agent
        |
PayPal sandbox  ·  optional OpenAI-compatible chat API
```

`npm run dev` starts the API on port **8787** and the Vite app on port **43123**. Vite proxies `/api` to the API. `npm start` (after `npm run build`) serves the built UI and the API from one process, which is what Render runs.

The ledger is `data/store.json` (or `CLUBFLOW_STORE`). It is gitignored. On Vercel the file is under the temp directory because the serverless disk is read-only. A fresh instance reseeds the demo.

## PayPal APIs and the model

| Desk action | PayPal surface | Confirm in the UI |
| --- | --- | --- |
| Registration fee | Orders v2 create + capture, PayPal JavaScript SDK buttons | Buyer approves in PayPal |
| Mark paid if the capture arrives later | Webhooks (`PAYMENT.CAPTURE.COMPLETED`, refunds, order approved, subscription activated). Signature check when `PAYPAL_WEBHOOK_ID` is set | No |
| Sponsor invoice | Invoicing v2 create, then send | Send only |
| Donation | Orders v2. On capture: thank-you email + PDF certificate | Buyer approves in PayPal |
| Speaker fee | Payouts API (`POST /v1/payments/payouts`) | Yes |
| Monthly dues | Catalog products, Billing plans, Subscriptions. Sandbox returns an approve link | Member approves in PayPal |
| Refund | Payments v2 capture refund. Roster status becomes `refunded` | Yes |
| Reimbursement report | Transaction Search (`/v1/reporting/transactions`) plus the local capture/webhook ledger | No |

The agent uses `@paypal/agent-toolkit/openai` (orders, invoices, products, subscription plans, subscriptions, refunds, transaction list). That package does not cover payouts or webhooks, so those are ClubFlow tools (`propose_payout`, `club_webhook_status`). Toolkit calls that would send an invoice, refund a capture, or capture an order are held until the officer confirms. The same tool list is what the PayPal MCP server exposes; this app drives it through the toolkit’s OpenAI adapter rather than a second MCP process.

The model is any OpenAI-compatible chat API:

- `OPENAI_API_KEY` (optional)
- `OPENAI_MODEL` (default `gpt-4o-mini`)
- `OPENAI_BASE_URL` (default `https://api.openai.com/v1`)

No key: the intent parser handles the scripted officer phrases and still opens the confirm card before money moves.

Email uses `RESEND_API_KEY` or SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). If neither is set, the message is stored in the on-screen outbox. A failed provider does not roll back a captured payment; the outbox still has the copy and any provider error.

## Channel copy (unchanged product)

One brief still feeds the local generator:

| Module | Output |
| --- | --- |
| Instagram post | Caption, hashtags, feed card |
| Instagram Stories | 1080×1920 image with the words drawn on it. No poll, question, countdown, or link sticker. The Graph API has no Story caption field |
| LINE Official Account | Broadcast draft. Not sent |
| Google signup form | Field list |
| Gmail | Subject and HTML preview. Not sent |
| Linktree | Titles, URLs, JSON. Linktree is not called |
| School documents | Drafts only. No school login |
| Certificates, reminders, thank-you | Previews |

The marketplace prices in NT$ are still a sample quote. They are not the PayPal checkout. Event money is the USD desk.

## Setup

Node.js 18 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://127.0.0.1:43123/#/desk](http://127.0.0.1:43123/#/desk).

Leave PayPal variables empty for a first look. The banner explains that the desk is simulating PayPal. Set `MOCK_PAYPAL=1` if you want that simulation even after you add keys. Set `MOCK_PAYPAL=0` with empty keys if you want the buttons turned off until credentials exist.

Production, one process:

```bash
npm run build
npm start
```

`npm start` listens on `PORT` (default 8787) and serves `dist/` plus `/api`.

`npm run check:mock` runs the money flows against the in-memory mock (no PayPal network).

## Create a sandbox app and a sandbox buyer

1. Sign in at [https://developer.paypal.com/dashboard/](https://developer.paypal.com/dashboard/).
2. Switch to **Sandbox**. Open **Apps & Credentials** and create a REST app (or open the default sandbox app).
3. Copy the **Client ID** and **Secret** into `.env` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
4. Under **Sandbox → Accounts**, copy the **business** account email into `PAYPAL_MERCHANT_EMAIL`. This variable is required for Invoicing. There is no default. PayPal rejects an invoice whose invoicer email is not that sandbox business account. If it is missing, invoice create returns a setup error instead of calling PayPal.
5. Create or open a **US sandbox personal** account under **Dashboard → Sandbox → Accounts**. Use that account as the checkout buyer and as the invoice recipient. A live PayPal login cannot approve a sandbox order. A Taiwan sandbox merchant invoicing a Taiwan sandbox payer returns `406 TAIWAN_MERCHANT_TAIWAN_PAYER_RESTRICTED`; use a non-Taiwan recipient. The seeded sponsor Lane Lab (`lane.lab@example.com`) is the default and is a working recipient. Put the US personal email in `PAYPAL_SPEAKER_EMAIL` so the speaker payout can reach `SUCCESS`. If the address is not a sandbox account, the payout batch can still say `SUCCESS` while the item stays `UNCLAIMED` with `RECEIVER_UNREGISTERED`. The roster stays unpaid until the item status is `SUCCESS`. Press **Refresh payout status** after you fix the email.
6. On the sandbox REST app, enable the **Invoicing** and **Transaction search** checkboxes if those calls return `403 NOT_AUTHORIZED`. The desk says so in the error. The reimbursement report still builds from the local capture and webhook ledger when Transaction Search is unauthorized or empty.
7. Leave `MOCK_PAYPAL` unset so the server uses the sandbox. Restart `npm run dev`. The banner should say the sandbox is connected.
8. Optional webhook: in the app, add `https://<your-host>/api/paypal/webhook` for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `CHECKOUT.ORDER.APPROVED`, and `BILLING.SUBSCRIPTION.ACTIVATED`. Put the webhook id in `PAYPAL_WEBHOOK_ID`. Without that id, events are applied and marked unverified so a local demo still updates the roster. Do that only on a sandbox host.

`POST /api/checkout/orders` returns `approveUrl`, PayPal’s `rel: "approve"` link. The order pattern is:

`https://www.sandbox.paypal.com/checkoutnow?token=<ORDER_ID>`

Open that URL in a browser logged in as the sandbox personal buyer, approve, then press **Capture approved payment**. The same link is on the roster as **Open PayPal approval** when the JavaScript SDK button is missing. Subscription approval uses the `approveUrl` on the subscription response, typically:

`https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=<BA-...>`

The same sandbox personal account approves that link.

Transaction Search can also lag for hours after a successful capture. An empty result still leaves the local ledger in the CSV.

Seeded rows named Mia, Priya, and Sofia are history, not sandbox captures. In sandbox mode, refund those only after a new sandbox payment. Mock mode refunds them so the confirm flow is visible without keys.

## Judge test (about 5 minutes)

No PayPal account required for this path. Do not put secrets in the repo.

```bash
npm install
npm run dev
```

1. Open [http://127.0.0.1:43123/#/desk](http://127.0.0.1:43123/#/desk). Read the banner. It should say credentials are missing and the desk is simulating PayPal.
2. **Left.** Press **Generate channel copy**. Copy an Instagram caption. Open **Full output gallery** if you want the older modules, then come back to **Money desk**.
3. **Middle.** On Jonah Wu, press **Pay 12.00 USD**. His status becomes paid. Open **Outbox** on the right and read the receipt.
4. Press **Refund** on Mia Chen, then **Confirm**. The roster shows refunded.
5. **Sponsor invoice.** Create draft, then **Send invoice**, then **Confirm**. Lane Lab’s copy is in the outbox.
6. **Sponsor donation.** Pay 25.00 USD (the form is filled). Open the certificate link and the thank-you in the outbox.
7. **Pay speaker fee** on Ken Lin, then **Confirm**.
8. **Publish plan to PayPal**, then **Start subscription**. In mock mode the member becomes active immediately. In the sandbox, open the subscription `approveUrl` while logged in as a sandbox personal buyer from **Dashboard → Sandbox → Accounts**. That link looks like `https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-...`.
9. **Build report**, then **Download CSV**. The notice explains the local ledger fallback. If Transaction Search returns `403 NOT_AUTHORIZED`, enable the **Transaction search** checkbox on the sandbox app. The CSV still contains the local ledger.
10. **Right.** Ask `Who has not paid?` Confirm a refund the agent proposes (`Refund Priya Shah`) and watch the roster change. Ask `Build the reimbursement report`.
11. Press **Simulate capture webhook** to mark the next unpaid attendee paid through `POST /api/paypal/webhook`.

With sandbox keys, checkout does not require the JavaScript SDK. `POST /api/checkout/orders` returns `approveUrl` (`https://www.sandbox.paypal.com/checkoutnow?token=<ORDER_ID>`), and the roster shows **Open PayPal approval**. Log in as a **US sandbox personal** account from **Dashboard → Sandbox → Accounts**, approve, then press **Capture approved payment**. A live PayPal account cannot approve that URL. Use that same US personal account for invoice recipients. A Taiwan sandbox payer billed by a Taiwan sandbox merchant returns `406 TAIWAN_MERCHANT_TAIWAN_PAYER_RESTRICTED`; leave the sponsor as Lane Lab (`lane.lab@example.com`) unless you replace it with another non-Taiwan sandbox account. Capture and refund both wait on buyer approval. Invoicing needs `PAYPAL_MERCHANT_EMAIL` and the app’s **Invoicing** checkbox. Payout item status can be `UNCLAIMED` or `FAILED` even when the batch says `SUCCESS`; the roster and the agent stay unpaid until the item is `SUCCESS`.

Reset the seeded roster with **Reset money demo**.

## Deploy

### Render (recommended)

`render.yaml` is a Node web service.

- Build: `npm install && npm run build`
- Start: `npm start`
- Set `PUBLIC_BASE_URL` to the Render URL (no trailing slash).
- Set the PayPal and optional OpenAI / email variables in the dashboard. Do not commit them.
- Webhook URL: `https://<service>.onrender.com/api/paypal/webhook`

One process keeps the roster, the outbox, and the webhook handler together.

### Vercel

`vercel.json` builds the static app and routes `/api/*` to `api/index.ts` (the same Express app). Set the same environment variables in the Vercel project, including `PUBLIC_BASE_URL`.

Serverless instances do not share a disk. The ledger lives in `/tmp` for that instance, so a webhook can hit a different instance from the browser tab. Use Render when the roster and webhooks must stay on one machine. Vercel is still a valid way to host the UI; point `VITE_API_BASE` at the Render origin if you split them, and set `CORS_ORIGIN` on the API.

## Environment

See [.env.example](.env.example). Never commit `.env`.

| Variable | Role |
| --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Sandbox REST app. The client id is public in the browser SDK. The secret stays on the server |
| `PAYPAL_MERCHANT_EMAIL` | Required for Invoicing. Sandbox business email that owns the REST app. No default |
| `PAYPAL_SPEAKER_EMAIL` | Sandbox personal email for the speaker payout |
| `PAYPAL_WEBHOOK_ID` | Optional signature verification |
| `MOCK_PAYPAL` | `1` forces simulation. Unset with keys uses the sandbox. `0` with no keys disables money buttons |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | Optional model |
| `RESEND_API_KEY` or `SMTP_*` | Optional email. Otherwise the outbox |
| `PORT`, `PUBLIC_BASE_URL`, `CORS_ORIGIN`, `CLUBFLOW_STORE` | Host and ledger |

## Significant update since Oct 1, 2026

This hackathon pass adds the money desk on top of the October copy generator. The copy generator, marketplace, and MIT license stay.

- Express API beside the Vite app, one `npm install && npm run dev` entry
- Seeded USD workshop roster (registration 12, speaker fee 150, dues 8/month, sponsor invoice 500, suggested donation 25)
- PayPal Checkout (Orders v2) and JavaScript SDK buttons, plus a mock pay button
- Webhook handler that marks the roster paid or refunded and writes a receipt
- Invoicing v2 create and send, with confirm before send
- Donation capture, thank-you email, and PDF certificate
- Payouts API for the speaker fee. The roster uses the payout **item** status (`SUCCESS`, `UNCLAIMED`, `FAILED`, `PENDING`), not the batch status alone
- Subscriptions API (product, plan, subscription approve link)
- One-click refund that updates the roster
- Transaction Search with a local ledger fallback and CSV reimbursement report
- Officer agent on the PayPal agent toolkit, with a no-key intent parser and a confirm step before refund, payout, or invoice send
- In-app outbox when no email provider is configured
- Render and Vercel deploy files
- `.env.example` only. No secrets in git

## Limitations

- Sandbox only. There is no live PayPal environment in this repo.
- Without credentials the desk simulates every PayPal call. The banner says so. `npm run check:mock` covers that path. This environment did not have sandbox keys, so the live sandbox buttons were not executed here.
- Transaction Search in the sandbox can be empty for hours. The CSV still contains the local ledger.
- Payout item status `UNCLAIMED` / `RECEIVER_UNREGISTERED` means `PAYPAL_SPEAKER_EMAIL` is not a sandbox personal account. The speaker is not marked paid until the item status is `SUCCESS`.
- Invoicing requires `PAYPAL_MERCHANT_EMAIL`. A `403 NOT_AUTHORIZED` on Invoicing or Transaction Search means that checkbox is off on the sandbox app. The reimbursement report still uses the local ledger.
- Seeded Mia, Priya, and Sofia captures are not real PayPal captures.
- Marketplace NT$ prices are still a quote. They do not charge a card.
- Channel copy is a template, not a model. The model is only the officer agent.
- Story images still cannot include poll, question, countdown, or link stickers.
- School forms are drafts. There is no school login.

## Layout

| Path | Role |
| --- | --- |
| `src/desk.ts` | Money desk |
| `src/generate.ts`, `src/render.ts` | Channel copy |
| `server/app.ts` | HTTP API |
| `server/paypal.ts` | Sandbox REST |
| `server/money.ts` | Roster, receipts, certificates, report |
| `server/agent.ts` | Toolkit tools, custom payout/webhook tools, intent parser |
| `server/selfcheck.ts` | Mock end-to-end check |

## License

MIT. See [LICENSE](LICENSE).
