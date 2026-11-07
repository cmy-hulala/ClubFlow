import { drawCertificate, drawPost, drawStory } from "./cards";
import {
  academicTerm,
  addDays,
  blank,
  capacityLabel,
  capacityNumber,
  dueKind,
  esc,
  formatDate,
  formatShort,
  formatStamp,
  hashtags,
  instagramUrl,
  kicker,
  lineId,
  ntd,
  relativeLabel,
  safeHttpUrl,
  schoolName,
  timeRange,
  whenLine,
} from "./format";
import { t } from "./i18n";
import type {
  Block,
  Brief,
  FormField,
  Lang,
  LinkItem,
  ModuleId,
  ModuleOutput,
  MoneyRow,
  Paper,
  TimelineItem,
} from "./types";

type Facts = {
  when: string;
  deadline: string;
  capacity: string;
  cap: number;
  url: string;
  time: string;
  shortDate: string;
};

function facts(brief: Brief, lang: Lang): Facts {
  return {
    when: whenLine(brief, lang),
    deadline: formatStamp(brief.signupDeadline, lang),
    capacity: capacityLabel(brief, lang),
    cap: capacityNumber(brief),
    url: safeHttpUrl(brief.signupUrl),
    time: timeRange(brief),
    shortDate: formatShort(brief.date, lang),
  };
}

function note(text: string, tone: "info" | "warn" = "info"): Block {
  return { type: "note", tone, text };
}

function timeline(brief: Brief, lang: Lang): TimelineItem[] {
  const items: { offset: number | "signup" | "event"; title: string; detail: string }[] =
    lang === "zh"
      ? [
          { offset: -14, title: "活動申請", detail: "建議在活動日前 14 天送出，並與預算一起附上。" },
          { offset: -10, title: "場地借用", detail: "教室常常要更早申請，這是最晚提醒。" },
          { offset: "signup", title: "報名截止", detail: "依活動簡表上的截止時間。" },
          { offset: -3, title: "行前提醒", detail: "三天前再跟已報名的人確認一次。" },
          { offset: "event", title: "活動當天", detail: "早上再發一則：時間、教室、要帶什麼。" },
          { offset: 1, title: "感謝信", detail: "隔天寄出即可，趁大家還記得。" },
          { offset: 14, title: "報銷", detail: "活動結束後 14 天內，把收據整理好送件。" },
        ]
      : [
          { offset: -14, title: "Activity application", detail: "File this with the budget. Fourteen days out is the reminder." },
          { offset: -10, title: "Venue request", detail: "Classrooms often need longer. This is the late reminder." },
          { offset: "signup", title: "Signup deadline", detail: "Taken from the brief." },
          { offset: -3, title: "Reminder", detail: "Confirm with people who already signed up." },
          { offset: "event", title: "Event day", detail: "A morning note: time, room, what to bring." },
          { offset: 1, title: "Thank-you", detail: "Send it the next day, while people still remember." },
          { offset: 14, title: "Reimbursement", detail: "File receipts within 14 days after the event." },
        ];

  return items.map((item) => {
    let iso = brief.date;
    if (item.offset === "signup") iso = brief.signupDeadline;
    else if (item.offset === "event") iso = brief.date;
    else iso = addDays(brief.date, item.offset) ?? brief.date;
    const when = formatDate(iso, lang);
    return {
      when,
      title: item.title,
      detail: item.detail,
      status: relativeLabel(iso, lang),
      kind: dueKind(iso),
    };
  });
}

function igCaption(brief: Brief, lang: Lang, info: Facts): string {
  if (lang === "zh") {
    return [
      `【${blank(brief.clubName, lang)}】${blank(brief.title, lang)}`,
      "",
      brief.description.trim(),
      "",
      `講者｜${blank(brief.speakerName, lang)}${brief.speakerRole.trim() ? `（${brief.speakerRole.trim()}）` : ""}`,
      brief.speakerBio.trim(),
      "",
      `時間｜${info.when}`,
      `地點｜${blank(brief.venue, lang)}`,
      `對象｜${blank(brief.audience, lang)}`,
      `名額｜${info.capacity}`,
      `報名截止｜${info.deadline}`,
      "",
      `報名｜${info.url}`,
      brief.contactEmail.trim() ? `聯絡｜${brief.contactEmail.trim()}` : "",
      brief.socialHandle.trim() ? `IG｜${brief.socialHandle.trim()}` : "",
    ]
      .filter((line) => line !== "")
      .join("\n");
  }
  return [
    `${blank(brief.clubName, lang)} · ${blank(brief.title, lang)}`,
    "",
    brief.description.trim(),
    "",
    `Speaker · ${blank(brief.speakerName, lang)}${brief.speakerRole.trim() ? `, ${brief.speakerRole.trim()}` : ""}`,
    brief.speakerBio.trim(),
    "",
    `When · ${info.when}`,
    `Where · ${blank(brief.venue, lang)}`,
    `Who · ${blank(brief.audience, lang)}`,
    `Seats · ${info.capacity}`,
    `Signup closes · ${info.deadline}`,
    "",
    `Sign up · ${info.url}`,
    brief.contactEmail.trim() ? `Contact · ${brief.contactEmail.trim()}` : "",
    brief.socialHandle.trim() ? `IG · ${brief.socialHandle.trim()}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function lineDraft(brief: Brief, lang: Lang, info: Facts): string {
  if (lang === "zh") {
    return [
      `【${blank(brief.clubName, lang)}活動】${blank(brief.title, lang)}`,
      "",
      brief.description.trim(),
      "",
      `講者：${blank(brief.speakerName, lang)}${brief.speakerRole.trim() ? `／${brief.speakerRole.trim()}` : ""}`,
      `時間：${info.when}`,
      `地點：${blank(brief.venue, lang)}`,
      `名額：${info.capacity}，報名到 ${info.deadline}`,
      `對象：${blank(brief.audience, lang)}`,
      "",
      `報名請點：${info.url}`,
      brief.contactEmail.trim() ? `問題回信 ${brief.contactEmail.trim()}，或直接回這則。` : "問題直接回這則就好。",
    ].join("\n");
  }
  return [
    `[${blank(brief.clubName, lang)}] ${blank(brief.title, lang)}`,
    "",
    brief.description.trim(),
    "",
    `Speaker: ${blank(brief.speakerName, lang)}${brief.speakerRole.trim() ? ` / ${brief.speakerRole.trim()}` : ""}`,
    `When: ${info.when}`,
    `Where: ${blank(brief.venue, lang)}`,
    `Seats: ${info.capacity}. Signup closes ${info.deadline}.`,
    `For: ${blank(brief.audience, lang)}`,
    "",
    `Sign up: ${info.url}`,
    brief.contactEmail.trim() ? `Questions: ${brief.contactEmail.trim()}, or reply here.` : "Reply here if you have a question.",
  ].join("\n");
}

function formFields(lang: Lang): FormField[] {
  if (lang === "zh") {
    return [
      { name: "姓名", kind: "簡答", required: true },
      { name: "系所", kind: "簡答", required: true, help: "例如：資工系、外文系碩士班" },
      {
        name: "年級",
        kind: "下拉選單",
        required: true,
        options: ["大一", "大二", "大三", "大四", "碩一", "碩二", "碩三以上", "博士班", "其他"],
      },
      { name: "Email", kind: "簡答", required: true, help: "額滿或改期時只靠這封信找人" },
      {
        name: "飲食需求",
        kind: "下拉選單",
        required: true,
        options: ["沒有特別需求", "素食", "純素", "其他（下一題說明）"],
      },
      { name: "飲食補充", kind: "簡答", required: false, help: "過敏或宗教飲食寫在這裡" },
      { name: "學號", kind: "簡答", required: false, help: "只有保險或學分證明需要時才填" },
      { name: "最想問講者的一句話", kind: "段落", required: false },
      {
        name: "活動中被拍照",
        kind: "選擇題",
        required: true,
        options: ["可以入鏡", "請不要拍到我"],
      },
      {
        name: "你怎麼知道這場",
        kind: "下拉選單",
        required: false,
        options: ["Instagram", "LINE", "海報", "朋友", "其他"],
      },
    ];
  }
  return [
    { name: "Name", kind: "Short answer", required: true },
    { name: "Department", kind: "Short answer", required: true, help: "Example: CS, or MA in Foreign Languages" },
    {
      name: "Year",
      kind: "Dropdown",
      required: true,
      options: ["Year 1", "Year 2", "Year 3", "Year 4", "Master’s 1", "Master’s 2", "Master’s 3+", "PhD", "Other"],
    },
    { name: "Email", kind: "Short answer", required: true, help: "Used if the event fills up or moves" },
    {
      name: "Dietary needs",
      kind: "Dropdown",
      required: true,
      options: ["No special need", "Vegetarian", "Vegan", "Other (explain next)"],
    },
    { name: "Dietary note", kind: "Short answer", required: false, help: "Allergies or other needs" },
    { name: "Student ID", kind: "Short answer", required: false, help: "Only if insurance or credit proof needs it" },
    { name: "One question for the speaker", kind: "Paragraph", required: false },
    {
      name: "Photos during the event",
      kind: "Multiple choice",
      required: true,
      options: ["OK to be in photos", "Please keep me out of photos"],
    },
    {
      name: "How did you hear about this?",
      kind: "Dropdown",
      required: false,
      options: ["Instagram", "LINE", "Poster", "Friend", "Other"],
    },
  ];
}

function mail(brief: Brief, lang: Lang, info: Facts): { subject: string; html: string; text: string } {
  const subject =
    lang === "zh"
      ? `【${blank(brief.clubName, lang)}】${info.shortDate}｜${blank(brief.title, lang)}`
      : `[${blank(brief.clubName, lang)}] ${info.shortDate} · ${blank(brief.title, lang)}`;

  const rows =
    lang === "zh"
      ? [
          ["時間", info.when],
          ["地點", blank(brief.venue, lang)],
          ["講者", `${blank(brief.speakerName, lang)}${brief.speakerRole.trim() ? `（${brief.speakerRole.trim()}）` : ""}`],
          ["對象", blank(brief.audience, lang)],
          ["名額", info.capacity],
          ["報名截止", info.deadline],
        ]
      : [
          ["When", info.when],
          ["Where", blank(brief.venue, lang)],
          ["Speaker", `${blank(brief.speakerName, lang)}${brief.speakerRole.trim() ? ` (${brief.speakerRole.trim()})` : ""}`],
          ["For", blank(brief.audience, lang)],
          ["Seats", info.capacity],
          ["Signup closes", info.deadline],
        ];

  const greeting = lang === "zh" ? "同學你好，" : "Hello,";
  const closing =
    lang === "zh"
      ? `這封信由${blank(brief.clubName, lang)}幹部寄出。問題請回信 ${blank(brief.contactEmail, lang)}。`
      : `Sent by an officer of ${blank(brief.clubName, lang)}. Questions: ${blank(brief.contactEmail, lang)}.`;
  const button = lang === "zh" ? "我要報名" : "Sign up";
  const free = lang === "zh" ? "這場不收費。額滿就停止報名。" : "This event is free. Signup closes when the seats are gone.";

  const text = [
    subject,
    "",
    greeting,
    "",
    brief.description.trim(),
    "",
    ...rows.map(([k, v]) => `${k}：${v}`),
    "",
    brief.speakerBio.trim(),
    "",
    free,
    `${button}：${info.url}`,
    "",
    closing,
  ].join("\n");

  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px 8px 0;color:#5c675f;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:8px 0;color:#1c2420">${esc(v)}</td></tr>`,
    )
    .join("");

  const html = `<div style="margin:0;padding:24px;background:#f4efe6;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">
    <div style="background:#0f6e56;color:#f6f3ec;padding:22px 24px">
      <div style="font-size:13px;letter-spacing:.04em">${esc(blank(brief.clubName, lang))}</div>
      <div style="font-size:22px;font-weight:700;line-height:1.35;margin-top:6px">${esc(blank(brief.title, lang))}</div>
    </div>
    <div style="padding:22px 24px 28px;color:#1c2420;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${esc(greeting)}</p>
      <p style="margin:0 0 16px">${esc(brief.description.trim())}</p>
      <table style="border-collapse:collapse;width:100%;margin:0 0 16px">${table}</table>
      <p style="margin:0 0 16px;color:#3d4c45">${esc(brief.speakerBio.trim())}</p>
      <p style="margin:0 0 16px">${esc(free)}</p>
      <p style="margin:0 0 18px"><a href="${esc(info.url)}" style="display:inline-block;background:#0f6e56;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700">${esc(button)}</a></p>
      <p style="margin:0;color:#5c675f;font-size:13px">${esc(closing)}</p>
    </div>
  </div>
</div>`;

  return { subject, html, text };
}

function linkItems(brief: Brief, lang: Lang, info: Facts): LinkItem[] {
  const links: LinkItem[] = [
    {
      order: 1,
      title: lang === "zh" ? `報名｜${blank(brief.title, lang)}` : `Sign up · ${blank(brief.title, lang)}`,
      url: info.url,
      note: lang === "zh" ? "這一場，放最上面" : "This event, pinned first",
    },
  ];
  const ig = instagramUrl(brief.socialHandle);
  if (ig) {
    links.push({
      order: links.length + 1,
      title: lang === "zh" ? "Instagram" : "Instagram",
      url: ig,
      note: lang === "zh" ? "由帳號組出來的，請核對是否正確" : "Built from the handle. Confirm it is right.",
    });
  }
  const line = lineId(brief.contactPhone);
  if (line) {
    links.push({
      order: links.length + 1,
      title: lang === "zh" ? "LINE 官方帳號" : "LINE Official Account",
      url: `https://line.me/R/ti/p/@${line}`,
      note: lang === "zh" ? "依 @帳號推測的網址，請跟官方帳號後台核對" : "Guessed from the @id. Match it in the OA manager.",
    });
  }
  if (brief.contactEmail.trim()) {
    links.push({
      order: links.length + 1,
      title: lang === "zh" ? "寫信給幹部" : "Email the officers",
      url: `mailto:${brief.contactEmail.trim()}`,
      note: lang === "zh" ? "給找不到教室或想合作的人" : "For lost students and collaborators",
    });
  }
  return links;
}

function budget(lang: Lang, info: Facts): { rows: MoneyRow[]; total: number } {
  const snacks = info.cap * 30;
  const rows: MoneyRow[] =
    lang === "zh"
      ? [
          { item: "講者交通補貼", note: "若講者不需要，送件前刪掉這列", amount: 2000 },
          { item: "茶點", note: `人數 ${info.cap || 0} × NT$30，示範單價`, amount: snacks },
          { item: "名牌與流程印製", note: "少量印刷，請改成報價", amount: 600 },
          { item: "預備金", note: "臨時文具或延長線", amount: 500 },
        ]
      : [
          { item: "Speaker transport", note: "Delete this row if it is not needed", amount: 2000 },
          { item: "Snacks", note: `${info.cap || 0} people × NT$30, sample unit price`, amount: snacks },
          { item: "Name tags and run-of-show print", note: "Replace with the real quote", amount: 600 },
          { item: "Contingency", note: "Last-minute supplies", amount: 500 },
        ];
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return { rows, total };
}

function papers(brief: Brief, lang: Lang, info: Facts): Paper[] {
  const term = academicTerm(brief.date, lang);
  const school = schoolName(brief, lang);
  const officer = lang === "zh" ? "黃以恩（示範姓名，送件前請改）" : "Yi-En Huang (sample name — replace before filing)";
  const applyIso = addDays(brief.date, -14) ?? brief.date;
  const venueIso = addDays(brief.date, -10) ?? brief.date;
  const reimburseIso = addDays(brief.date, 14) ?? brief.date;
  const money = budget(lang, info);
  const purpose = brief.description.trim();

  const apply: Paper = {
    index: "1 / 4",
    kicker: school,
    title: lang === "zh" ? "學生社團活動申請（示範填寫稿）" : "Student club activity application (sample draft)",
    deadline: `${formatDate(applyIso, lang)} · ${relativeLabel(applyIso, lang)}`,
    status: t(lang, "notSubmitted"),
    kind: dueKind(applyIso),
    rows:
      lang === "zh"
        ? [
            { k: "學期", v: term?.label ?? "（請填學期）" },
            { k: "申請單位", v: blank(brief.clubName, lang) },
            { k: "活動名稱", v: blank(brief.title, lang) },
            { k: "活動性質", v: kicker(brief, lang) },
            { k: "日期時間", v: info.when },
            { k: "地點", v: blank(brief.venue, lang) },
            { k: "預計人數", v: info.capacity },
            { k: "參加對象", v: blank(brief.audience, lang) },
            { k: "活動目的與內容", v: purpose || "（請貼上一段介紹）" },
            { k: "講者", v: `${blank(brief.speakerName, lang)}　${brief.speakerRole.trim()}` },
            { k: "負責人", v: officer },
            { k: "聯絡方式", v: [brief.contactEmail, brief.contactPhone].filter((v) => v.trim()).join("　") || "（未填）" },
            { k: "是否收費", v: "簡表未填費用，先以免費社團活動填寫。若收費請改。" },
            { k: "保險", v: "參加者以本校學生為主。保險依學校當期社團規定辦理，本示範不代投保。" },
          ]
        : [
            { k: "Term", v: term?.label ?? "(fill in the term)" },
            { k: "Applicant", v: blank(brief.clubName, lang) },
            { k: "Event", v: blank(brief.title, lang) },
            { k: "Type", v: kicker(brief, lang) },
            { k: "When", v: info.when },
            { k: "Where", v: blank(brief.venue, lang) },
            { k: "Headcount", v: info.capacity },
            { k: "Audience", v: blank(brief.audience, lang) },
            { k: "Purpose", v: purpose || "(paste the description)" },
            { k: "Speaker", v: `${blank(brief.speakerName, lang)} ${brief.speakerRole.trim()}` },
            { k: "Officer in charge", v: officer },
            { k: "Contact", v: [brief.contactEmail, brief.contactPhone].filter((v) => v.trim()).join(" · ") || "(not set)" },
            { k: "Fee", v: "The brief has no ticket price, so this draft says free. Change it if you charge." },
            { k: "Insurance", v: "Most attendees are students of this school. Follow the current club-insurance rule. This demo does not enroll anyone." },
          ],
    foot:
      lang === "zh"
        ? "請核對學校本學期的正式表格後再送。ClubFlow 不登入行政系統。"
        : "Match the school’s current form before filing. ClubFlow does not log into the admin system.",
  };

  const venue: Paper = {
    index: "2 / 4",
    kicker: school,
    title: lang === "zh" ? "場地借用申請（示範填寫稿）" : "Venue request (sample draft)",
    deadline: `${formatDate(venueIso, lang)} · ${relativeLabel(venueIso, lang)}`,
    status: t(lang, "notSubmitted"),
    kind: dueKind(venueIso),
    rows:
      lang === "zh"
        ? [
            { k: "借用單位", v: blank(brief.clubName, lang) },
            { k: "用途", v: blank(brief.title, lang) },
            { k: "日期", v: formatDate(brief.date, lang) },
            { k: "時段", v: info.time || "（未填）" },
            { k: "場地", v: blank(brief.venue, lang) },
            { k: "人數", v: info.capacity },
            { k: "佈置", v: "活動開始前 30 分鐘進場。結束後 20 分鐘內復原桌椅。" },
            { k: "設備（示範）", v: "投影機、無線麥克風、延長線。沒有的項目請刪掉。" },
            { k: "負責人", v: officer },
          ]
        : [
            { k: "Requesting club", v: blank(brief.clubName, lang) },
            { k: "Use", v: blank(brief.title, lang) },
            { k: "Date", v: formatDate(brief.date, lang) },
            { k: "Time", v: info.time || "(not set)" },
            { k: "Room", v: blank(brief.venue, lang) },
            { k: "Headcount", v: info.capacity },
            { k: "Setup", v: "In 30 minutes early. Restore the furniture within 20 minutes after." },
            { k: "Equipment (sample)", v: "Projector, wireless mic, extension cord. Delete what you do not need." },
            { k: "Officer", v: officer },
          ],
    bullets: {
      title: lang === "zh" ? "借用承諾" : "What you are promising",
      items:
        lang === "zh"
          ? ["不私自更換教室。", "不超時，超時另案申請。", "垃圾帶走，桌椅歸位。", "若活動取消，當天通知場地管理員。"]
          : ["Do not move the booking to another room yourself.", "Do not run overtime without a new request.", "Take the trash. Put the chairs back.", "If you cancel, tell the venue desk the same day."],
    },
    foot:
      lang === "zh"
        ? "場地以學校核可為準。這份不是借用單正本。"
        : "The room is yours only after the school says so. This is not the official form.",
  };

  const budgetPaper: Paper = {
    index: "3 / 4",
    kicker: school,
    title: lang === "zh" ? "活動預算表（示範填寫稿）" : "Event budget (sample draft)",
    deadline: `${formatDate(applyIso, lang)} · ${relativeLabel(applyIso, lang)}`,
    status: t(lang, "notSubmitted"),
    kind: dueKind(applyIso),
    rows:
      lang === "zh"
        ? [
            { k: "活動", v: blank(brief.title, lang) },
            { k: "單位", v: blank(brief.clubName, lang) },
            { k: "收入", v: `報名費 NT$0（免費）。擬申請社團經費 ${ntd(money.total)}。` },
            { k: "支出合計", v: ntd(money.total) },
            { k: "說明", v: "下列單價是示範，送件前改成實際報價或刪除不需要的列。" },
          ]
        : [
            { k: "Event", v: blank(brief.title, lang) },
            { k: "Club", v: blank(brief.clubName, lang) },
            { k: "Income", v: `Tickets NT$0 (free). Club funds requested: ${ntd(money.total)}.` },
            { k: "Expenses", v: ntd(money.total) },
            { k: "Note", v: "Unit prices are samples. Replace them with quotes, or delete rows you do not need." },
          ],
    table: {
      caption: lang === "zh" ? "支出明細" : "Expense lines",
      headers: lang === "zh" ? ["項目", "說明", "金額"] : ["Item", "Note", "Amount"],
      rows: money.rows.map((row) => [row.item, row.note, ntd(row.amount)]),
    },
    foot:
      lang === "zh"
        ? "收支先以平衡填寫：收入等於支出合計。實際核銷時再改數字。"
        : "Drafted as balanced: requested funds equal expenses. Update the numbers when you reconcile.",
  };

  const reimburse: Paper = {
    index: "4 / 4",
    kicker: school,
    title: lang === "zh" ? "報銷清單（示範填寫稿）" : "Reimbursement checklist (sample draft)",
    deadline: `${formatDate(reimburseIso, lang)} · ${relativeLabel(reimburseIso, lang)}`,
    status: t(lang, "notSubmitted"),
    kind: dueKind(reimburseIso),
    rows:
      lang === "zh"
        ? [
            { k: "活動", v: `${blank(brief.title, lang)}　${formatDate(brief.date, lang)}` },
            { k: "核銷窗口", v: "請依本學期學務處或社團輔導規定送件。此處不代填統一編號。" },
            { k: "狀態", v: "活動尚未結束也可以先把清單留著。收據在活動後補上。" },
            { k: "金額上限", v: `對照預算 ${ntd(money.total)}。超出要先說明原因。` },
          ]
        : [
            { k: "Event", v: `${blank(brief.title, lang)} · ${formatDate(brief.date, lang)}` },
            { k: "Where to file", v: "Follow this semester’s student-affairs rule. This draft does not invent a tax ID." },
            { k: "Status", v: "Keep the checklist before the event. Attach receipts afterward." },
            { k: "Cap", v: `Match the budget of ${ntd(money.total)}. Explain anything over it.` },
          ],
    table: {
      caption: lang === "zh" ? "憑證核對" : "Receipt check",
      headers: lang === "zh" ? ["項目", "預算", "憑證"] : ["Item", "Budget", "Receipt"],
      rows: money.rows.map((row) => [
        row.item,
        ntd(row.amount),
        lang === "zh" ? "未附，活動後貼上" : "Not attached yet",
      ]),
    },
    bullets: {
      title: lang === "zh" ? "送件時一起帶" : "Bring these when you file",
      items:
        lang === "zh"
          ? ["收據或發票正本", "報名匯出或簽到（由幹部自行從表單下載）", "活動照片 1 到 2 張", "預算與實際支出的對照", "負責人簽名"]
          : ["Original receipts", "A signup export or sign-in sheet (download it yourself)", "One or two photos", "Budget versus what you actually spent", "The officer’s signature"],
    },
    foot:
      lang === "zh"
        ? "報銷由幹部親自送出。ClubFlow 不保存單據、也不登入學校報帳。"
        : "An officer files this in person. ClubFlow does not store receipts or log into school finance.",
  };

  return [apply, venue, budgetPaper, reimburse];
}

function reminders(brief: Brief, lang: Lang, info: Facts): { before: string; dayOf: string; beforeWhen: string; dayWhen: string } {
  const beforeIso = addDays(brief.date, -3) ?? brief.date;
  if (lang === "zh") {
    return {
      beforeWhen: formatDate(beforeIso, lang),
      dayWhen: formatDate(brief.date, lang),
      before: [
        `【${blank(brief.clubName, lang)}】三天後見`,
        blank(brief.title, lang),
        "",
        `${info.when}`,
        blank(brief.venue, lang),
        "",
        `報名到 ${info.deadline} 為止。還沒填的人從這裡進：`,
        info.url,
        "",
        "當天帶學生證和可以記筆記的東西就好。",
        brief.contactEmail.trim() ? `臨時改期會再寫一封，問題先寫給 ${brief.contactEmail.trim()}。` : "臨時改期會再寫一封。",
      ].join("\n"),
      dayOf: [
        `【今天】${blank(brief.title, lang)}`,
        "",
        `時間 ${info.time || info.when}`,
        `地點 ${blank(brief.venue, lang)}`,
        `講者 ${blank(brief.speakerName, lang)}`,
        "",
        `請提早 10 分鐘進場。約 ${info.capacity}，坐滿為止。`,
        brief.contactEmail.trim() ? `找不到教室就寫信 ${brief.contactEmail.trim()}，或回這則。` : "找不到教室就回這則。",
      ].join("\n"),
    };
  }
  return {
    beforeWhen: formatDate(beforeIso, lang),
    dayWhen: formatDate(brief.date, lang),
    before: [
      `${blank(brief.clubName, lang)} · three days to go`,
      blank(brief.title, lang),
      "",
      info.when,
      blank(brief.venue, lang),
      "",
      `Signup closes ${info.deadline}.`,
      info.url,
      "",
      "Bring a student ID and something to take notes.",
      brief.contactEmail.trim() ? `If the plan changes, we will write again. Questions: ${brief.contactEmail.trim()}.` : "If the plan changes, we will write again.",
    ].join("\n"),
    dayOf: [
      `Today · ${blank(brief.title, lang)}`,
      "",
      `Time ${info.time || info.when}`,
      `Room ${blank(brief.venue, lang)}`,
      `Speaker ${blank(brief.speakerName, lang)}`,
      "",
      `Come 10 minutes early. About ${info.capacity}; once the seats are gone, they are gone.`,
      brief.contactEmail.trim() ? `If you cannot find the room, email ${brief.contactEmail.trim()} or reply here.` : "If you cannot find the room, reply here.",
    ].join("\n"),
  };
}

function postEvent(brief: Brief, lang: Lang, info: Facts): { subject: string; letter: string; short: string; survey: string } {
  if (lang === "zh") {
    const subject = `謝謝你來｜${blank(brief.title, lang)}`;
    const letter = [
      subject,
      "",
      "同學你好，",
      "",
      `謝謝你來 ${blank(brief.clubName, lang)} 的「${blank(brief.title, lang)}」。`,
      `${info.when}，${blank(brief.venue, lang)}。`,
      "",
      `若 ${blank(brief.speakerName, lang)} 的分享裡有你這週想接著做的一步，直接回信告訴我們。下一場要接什麼，會看這些回覆。`,
      "",
      "照片只會用在同意入鏡的人。若你表單上選了不要入鏡，我們不會把你放進社群貼文。",
      "",
      "下面六題問卷大概兩分鐘。下一場辦什麼，會看這些回答。",
      "",
      `${blank(brief.clubName, lang)} 活動組`,
      brief.contactEmail.trim(),
    ].join("\n");
    const short = [
      `謝謝今天來「${blank(brief.title, lang)}」。`,
      "想接著做的那一步，回這則跟我們說。",
      "問卷六題，兩分鐘，下一場會參考。",
    ].join("\n");
    const survey = [
      "1. 整體這場對你有沒有幫助？（1 完全沒有 – 5 很有幫助）",
      "2. 你帶走的一句話是什麼？",
      "3. 講者的節奏：太快／剛好／太慢／我中途才到",
      "4. 你會不會把下一場推薦給朋友？會／也許／不會",
      "5. 下一場你想聽什麼題目？",
      "6. 時間與教室合不合適？若不合適，請寫你比較能來的時段。",
    ].join("\n");
    return { subject, letter, short, survey };
  }
  const subject = `Thank you for coming · ${blank(brief.title, lang)}`;
  const letter = [
    subject,
    "",
    "Hello,",
    "",
    `Thank you for coming to “${blank(brief.title, lang)}”, hosted by ${blank(brief.clubName, lang)}.`,
    `${info.when} · ${blank(brief.venue, lang)}.`,
    "",
    `If something ${blank(brief.speakerName, lang)} said is a step you will actually take this week, reply and tell us. The next event depends on those replies.`,
    "",
    "Photos will only include people who said yes on the form. If you asked to stay out of frame, you will stay out of the recap.",
    "",
    "Six short questions below. About two minutes. The next event depends on them.",
    "",
    `${blank(brief.clubName, lang)}`,
    brief.contactEmail.trim(),
  ].join("\n");
  const short = [
    `Thank you for coming to “${blank(brief.title, lang)}”.`,
    "Reply with the one step you will take next.",
    "Six survey questions, two minutes. We use them for the next one.",
  ].join("\n");
  const survey = [
    "1. How useful was this for you? (1 not at all – 5 very)",
    "2. What is the one sentence you are taking with you?",
    "3. Pace: too fast / about right / too slow / I arrived midway",
    "4. Would you tell a friend about the next one? Yes / Maybe / No",
    "5. What should the next event be about?",
    "6. Did the time and room work? If not, when could you actually come?",
  ].join("\n");
  return { subject, letter, short, survey };
}

function one(id: ModuleId, brief: Brief, lang: Lang): ModuleOutput {
  const info = facts(brief, lang);
  const blocks: Block[] = [];

  if (id === "ig-post") {
    const dataUrl = drawPost(brief, lang, info.when, info.capacity, info.deadline);
    blocks.push(
      note(t(lang, "postNote")),
      {
        type: "image",
        label: lang === "zh" ? "動態牆圖片（1080×1350）" : "Feed image (1080×1350)",
        alt: lang === "zh" ? `${brief.title} 的貼文圖卡，含講者、時間與地點` : `Feed card for ${brief.title} with speaker, time, and place`,
        dataUrl,
        filename: "clubflow-instagram-post.png",
        width: 1080,
        height: 1350,
        fallback: `${brief.title}\n${info.when}\n${brief.venue}`,
      },
      { type: "text", label: t(lang, "captionLabel"), text: `${igCaption(brief, lang, info)}\n\n${hashtags(brief, lang).join(" ")}` },
      { type: "tags", label: t(lang, "tagsLabel"), tags: hashtags(brief, lang) },
    );
  }

  if (id === "ig-story") {
    const dataUrl = drawStory(brief, lang, info.when, info.capacity, info.deadline);
    blocks.push(
      note(t(lang, "storyNote"), "warn"),
      {
        type: "image",
        label: lang === "zh" ? "限動圖（1080×1920，文字已畫上）" : "Story image (1080×1920, text burned in)",
        alt:
          lang === "zh"
            ? `限時動態圖，畫有${brief.clubName}、${brief.title}、${brief.speakerName}、${info.when}、${brief.venue}`
            : `Story image with ${brief.clubName}, ${brief.title}, ${brief.speakerName}, ${info.when}, ${brief.venue} drawn in`,
        dataUrl,
        filename: "clubflow-instagram-story.png",
        width: 1080,
        height: 1920,
        fallback: `${brief.clubName}\n${brief.title}\n${brief.speakerName}\n${info.when}\n${brief.venue}\n${info.capacity}\n${info.deadline}`,
      },
      {
        type: "kv",
        label: t(lang, "burnedTitle"),
        rows: [
          { k: lang === "zh" ? "社團" : "Club", v: blank(brief.clubName, lang) },
          { k: lang === "zh" ? "標題" : "Title", v: blank(brief.title, lang) },
          { k: lang === "zh" ? "講者" : "Speaker", v: blank(brief.speakerName, lang) },
          { k: lang === "zh" ? "時間" : "When", v: info.when },
          { k: lang === "zh" ? "地點" : "Where", v: blank(brief.venue, lang) },
          { k: lang === "zh" ? "名額" : "Seats", v: info.capacity },
          { k: lang === "zh" ? "報名截止" : "Deadline", v: info.deadline },
        ],
      },
    );
  }

  if (id === "line") {
    blocks.push(note(t(lang, "lineNote")));
    if (lang === "en") blocks.push(note(t(lang, "lineLangHint")));
    else blocks.push(note("可直接貼進官方帳號的群發訊息。送出前請幹部再點一次連結。"));
    blocks.push({ type: "line", label: t(lang, "lineLabel"), text: lineDraft(brief, lang, info) });
  }

  if (id === "gform") {
    const title = lang === "zh" ? `【報名】${blank(brief.title, lang)}` : `[Signup] ${blank(brief.title, lang)}`;
    const description =
      lang === "zh"
        ? `${blank(brief.clubName, lang)}舉辦。${info.when}，${blank(brief.venue, lang)}。名額 ${info.capacity}，報名到 ${info.deadline}。免費，額滿為止。講者：${blank(brief.speakerName, lang)}。`
        : `Hosted by ${blank(brief.clubName, lang)}. ${info.when} at ${blank(brief.venue, lang)}. ${info.capacity}. Signup closes ${info.deadline}. Free until the seats are gone. Speaker: ${blank(brief.speakerName, lang)}.`;
    const confirm =
      lang === "zh"
        ? `已收到。${info.when} 在 ${blank(brief.venue, lang)} 見。若額滿，我們會寫到你留的 email。`
        : `You’re in the list. See you ${info.when} at ${blank(brief.venue, lang)}. If we fill up, we’ll email the address you left.`;
    blocks.push(
      note(t(lang, "gformNote")),
      {
        type: "kv",
        label: lang === "zh" ? "表單設定" : "Form settings",
        rows: [
          { k: lang === "zh" ? "表單標題" : "Form title", v: title },
          { k: lang === "zh" ? "說明" : "Description", v: description },
          { k: lang === "zh" ? "送出後顯示" : "Confirmation", v: confirm },
          { k: lang === "zh" ? "收件" : "Responses", v: brief.contactEmail.trim() || (lang === "zh" ? "（請填幹部信箱）" : "(add an officer email)") },
        ],
      },
      { type: "fields", label: t(lang, "fieldsTitle"), intro: description, fields: formFields(lang) },
    );
  }

  if (id === "gmail") {
    const message = mail(brief, lang, info);
    blocks.push(note(t(lang, "gmailNote")), note(t(lang, "mailAudience")), {
      type: "mail",
      subject: message.subject,
      html: message.html,
      text: message.text,
      note: t(lang, "htmlLabel"),
    });
  }

  if (id === "reminders") {
    const draft = reminders(brief, lang, info);
    blocks.push(
      note(t(lang, "remindNote")),
      {
        type: "calendar",
        label: t(lang, "deadlineStrip"),
        items: timeline(brief, lang).filter((item) =>
          lang === "zh" ? item.title === "行前提醒" || item.title === "活動當天" : item.title === "Reminder" || item.title === "Event day",
        ),
      },
      { type: "text", label: `${t(lang, "remindBefore")} · ${draft.beforeWhen}`, text: draft.before },
      { type: "text", label: `${t(lang, "remindDay")} · ${draft.dayWhen}`, text: draft.dayOf },
    );
  }

  if (id === "linktree") {
    const links = linkItems(brief, lang, info);
    const payload = {
      profile: brief.clubName,
      updatedFrom: "clubflow-demo",
      publish: false,
      links: links.map((link) => ({ order: link.order, title: link.title, url: link.url })),
    };
    blocks.push(note(t(lang, "linkNote")), {
      type: "links",
      label: t(lang, "linksTitle"),
      links,
      json: JSON.stringify(payload, null, 2),
    });
  }

  if (id === "school") {
    blocks.push(
      note(t(lang, "schoolIntro"), "warn"),
      note(t(lang, "paperHuman")),
      { type: "papers", intro: t(lang, "deadlineStrip"), timeline: timeline(brief, lang), papers: papers(brief, lang, info) },
    );
  }

  if (id === "certificate") {
    const speaker = drawCertificate(brief, lang, "speaker", info.when);
    const attendee = drawCertificate(brief, lang, "attendee", info.when);
    blocks.push(
      note(t(lang, "certNote")),
      {
        type: "image",
        label: lang === "zh" ? "講者感謝狀" : "Speaker certificate",
        alt: lang === "zh" ? `致 ${brief.speakerName} 的感謝狀` : `Certificate for ${brief.speakerName}`,
        dataUrl: speaker,
        filename: "clubflow-certificate-speaker.png",
        width: 1754,
        height: 1240,
        fallback: brief.speakerName,
      },
      note(t(lang, "attendeeHint")),
      {
        type: "image",
        label: lang === "zh" ? "參加證明（姓名留白）" : "Attendee certificate (name blank)",
        alt: lang === "zh" ? "參加證明，姓名欄為空白" : "Participation certificate with a blank name",
        dataUrl: attendee,
        filename: "clubflow-certificate-attendee.png",
        width: 1754,
        height: 1240,
        fallback: brief.title,
      },
    );
  }

  if (id === "postevent") {
    const pack = postEvent(brief, lang, info);
    blocks.push(
      note(t(lang, "postEventNote")),
      { type: "text", label: `${t(lang, "thanksLabel")} · ${pack.subject}`, text: pack.letter },
      { type: "line", label: t(lang, "shortThanks"), text: pack.short },
      { type: "text", label: t(lang, "surveyLabel"), text: pack.survey },
    );
  }

  return { id, blocks };
}

export async function generateAll(brief: Brief, lang: Lang, ids: ModuleId[]): Promise<ModuleOutput[]> {
  await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 2500))]);
  const outputs: ModuleOutput[] = [];
  for (const id of ids) {
    try {
      outputs.push(one(id, brief, lang));
    } catch (error) {
      const message = error instanceof Error ? error.message : t(lang, "genFailed");
      outputs.push({ id, blocks: [note(message, "warn")] });
    }
  }
  return outputs;
}
