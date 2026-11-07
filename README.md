# ClubFlow｜社團全自動工作流

**Traditional Chinese summary.** 陽明交大創創社的幹部現在要把同一場活動改寫 7 次以上：Instagram 貼文、限時動態、Linktree、LINE、Google 表單、Gmail，再加上學校的活動申請、場地、預算、報銷。ClubFlow 只維護一份活動簡表，產出每個管道的預覽。它不發布、不寄信、不登入學校。限動的字直接畫在圖上，因為 Meta 的限動 API 沒有說明欄。

ClubFlow is a local demo for university club officers, especially the president and the activity lead. One event brief becomes ready-to-copy channel previews: an Instagram caption and feed card, an Instagram Story with the words burned into the image, a Linktree update, a LINE Official Account broadcast, a Google Form field list, a Gmail draft, school paperwork, certificates, reminders, and a post-event thank-you with survey questions.

Nothing is published. There is no school login and no API key.

## The problem

A campus workshop is one set of facts: title, speaker, time, room, capacity, deadline. Officers still retype those facts into seven or more places, in slightly different shapes, usually the night before the filing deadline. The copy drifts. The venue request does not match the Instagram post. The reimbursement checklist is a blank doc someone has to invent again next semester.

ClubFlow keeps a single brief as the source. Officers mix the channels they need, run the workflow, and copy the previews. A human still posts, and a human still files the school forms.

## Features

- Sample workspace for **陽明交大創創社 / NYCU Entrepreneurship & Innovation Club**, with fictional officers and a fictional speaker. Do not email the sample address.
- **Load sample event** fills a realistic funding workshop. Every field stays editable.
- **Traditional Chinese by default**, with an EN toggle for judges. Loading the sample again (or switching language while the sample is untouched) swaps the brief into that language and regenerates.
- **Module marketplace.** One-day onboarding (sample price NT$6,800) includes Instagram post, Instagram Stories, LINE, Google Form, Gmail, and reminders. Add-ons are priced per event: Linktree, school documents, certificates, thank-you and survey. Coming-soon cards (check-in, president approval, handover, short links) do not generate. Modules combine; presets cover “social only” and “admin only.” The quote is a sample. There is no checkout.
- **Run workflow** builds every enabled module from the brief.
- **Output gallery** with copy and image download. Each card says the preview was not published.

### What each core module generates

| Module | Output |
| --- | --- |
| Instagram post | Caption, hashtags, and a 1080×1350 feed card |
| Instagram Stories | 1080×1920 image with title, speaker, time, and place drawn into the pixels. No poll, question, countdown, or link sticker |
| Linktree | Ordered titles and URLs, plus JSON. Linktree is not called |
| LINE Official Account | Broadcast draft in the shape of a Taiwan OA message. It is not sent |
| Google signup form | Title, description, confirmation line, and fields (name, department, year, email, dietary needs, and a few others) |
| Gmail | Subject, HTML preview, and plain text. No recipient list is imported |
| School admin docs | Filled drafts for 活動申請, 場地借用, 預算, and 報銷, plus a deadline strip. Amounts are labeled as samples |
| Certificates | Speaker certificate and a blank-name attendee certificate, both downloadable |
| Reminders | Three days before, and the morning of the event |
| Post-event | Thank-you, a short LINE version, and six survey questions |

## Setup

Requires Node.js 18 or newer. No API keys.

```bash
npm install
npm start
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

`npm start` runs the Vite dev server on port **43123**. For a static build:

```bash
npm run build
npm run preview
```

The preview server uses the same port. Generation runs in the browser after install, so the demo does not call a model or a social network.

## Demo walkthrough (about 2–3 minutes)

Record at a 1280px-wide desktop window. Start from a fresh load (or press **清空示範 / Reset demo** in the sidebar).

1. **Home (15s).** Point at the sidebar: this is the 創創社 workspace, and it does not ask for a school password. Read the line that officers currently rewrite one event **7+** times. Mention the sample price: one-day onboarding plus a module marketplace, paid by a club budget or a student-affairs grant, not the president’s pocket.
2. **Language (10s).** Click **EN**, then **中文**. Judges can stay in English from here if they prefer; the steps below assume Chinese, and the same clicks exist in English.
3. **Load the sample (20s).** Press **載入範例活動**. Scroll the brief: speaker 林可恩, 21 Nov 2026, 14:00–16:30, 工程三館 EC 201, 80 seats, signup closes 18 Nov 23:59. Say the speaker, inbox, and URLs are fictional.
4. **Marketplace (30s).** Open **模組市集**. Show the six modules marked **導入包含** and the quote (NT$6,800 once, plus per-event add-ons). Turn **學校行政文件** off and on so the quote changes. Point at **即將推出** (check-in, approval, handover, short links) — those cards do not generate. Turn every generatable module back on (**全選可產出**) before the next step.
5. **Run (60–70s).** Press **執行工作流**. On the gallery:
   - Instagram caption: press **複製**.
   - Stories: the vertical image has the words drawn on it. Read the warning: the Meta Graph API has no Story caption field and cannot place poll, question, countdown, or link stickers. Press **放大** if the thumbnail is small.
   - Linktree JSON, the LINE bubble, the form field table, and the Gmail preview.
   - School documents: the timeline, then 活動申請 / 場地 / 預算 / 報銷. If you record on 7 Nov 2026, the activity application says the suggested filing day is today. Officers submit these themselves. There is no school login.
   - Both certificates, the two reminders, and the thank-you plus survey.
6. **Close (10s).** Rest on the green banner: nothing was sent to Instagram, LINE, Gmail, Google, or the school.

If the sample event date is already in the past when you record, the deadline chips will say so. That is the same logic an officer would see. Change the date on the brief and run again to show it move.

## Submission media

Captured from the running app in Chrome at 1280px wide. These are not mockups.

Screenshots:

- [docs/screenshots/01-home.png](docs/screenshots/01-home.png) — home, 陽明交大創創社 in the sidebar, the 7+ rewrite line, no school password
- [docs/screenshots/02-event-brief.png](docs/screenshots/02-event-brief.png) — sample event loaded (林可恩, 21 Nov 2026, 工程三館 EC 201)
- [docs/screenshots/03-marketplace.png](docs/screenshots/03-marketplace.png) — included modules and per-event add-on prices
- [docs/screenshots/04-outputs.png](docs/screenshots/04-outputs.png) — gallery after Run workflow
- [docs/screenshots/05-stories.png](docs/screenshots/05-stories.png) — Stories card with text burned in, plus the Meta Graph API note
- [docs/screenshots/06-school-docs.png](docs/screenshots/06-school-docs.png) — activity, venue, budget, and reimbursement drafts, and the reminder that a person still submits them

Demo video: [docs/demo.mp4](docs/demo.mp4). Live screen recording, 1280×800, 2 minutes 17 seconds. English captions sit on the walkthrough: home, switch to English and stay there, load the sample, toggle one add-on so the quote changes, select every module that generates, run, copy a caption, Stories and the Meta limitation, then Linktree, LINE, the form, Gmail, school docs, certificates, reminders, and the thank-you. It ends on the banner that nothing was sent.

## Tech stack

- [Vite](https://vitejs.dev/) 6 and TypeScript. No server-side runtime beyond the static dev server.
- One page, no framework. UI strings live in `src/i18n.ts`.
- Canvas draws the Story, the feed card, and the certificates in the browser (`src/cards.ts`).
- Copy is a built-in bilingual template (`src/generate.ts`), not a live model, so the demo cannot fail for a missing key.
- Fonts: Outfit and Noto Sans TC (Traditional Chinese), bundled via Fontsource so the UI does not depend on Google Fonts at runtime.
- State for the brief and the module mix is stored in `localStorage` on this machine only.

## Limitations

- **Generate only.** ClubFlow does not post to Instagram, send LINE or Gmail, create a Google Form, update Linktree, or submit anything to a school.
- **Instagram Stories and the Meta Graph API.** Story publishing through the Graph API has no caption field. It also cannot attach poll stickers, question stickers, countdown stickers, or link stickers. Any text the viewer should read has to be burned into the image. ClubFlow does that, and it does not pretend those stickers exist.
- **School documents** are filled drafts and deadline reminders. A human officer checks them against the current semester’s real forms and submits them. The app never asks for a school SSO or admin password.
- **Prices** are a sample of the onboarding-plus-marketplace model. Nothing is charged.
- **Budget lines, equipment, and the officer name on the school draft** are labeled samples. Replace them before anyone files.
- **No live LLM.** An optional model key is intentionally not wired in, so a judge’s laptop always produces the same Traditional Chinese and English copy.
- Sample people, the LINE id, and `example.com` links are fictional.

## Project layout

| Path | Role |
| --- | --- |
| `index.html` | Page shell |
| `src/main.ts` | Events, language, run workflow |
| `src/render.ts` | Screens: home, brief, marketplace, gallery |
| `src/styles.css` | Layout |
| `src/i18n.ts` | Traditional Chinese and English UI |
| `src/sample.ts` | The workshop brief |
| `src/catalog.ts` | Modules, tiers, sample prices |
| `src/generate.ts` | Channel copy |
| `src/cards.ts` | Story, feed card, certificates |
| `src/format.ts` | Dates, deadlines, escaping |

## License

MIT. See [LICENSE](LICENSE).
