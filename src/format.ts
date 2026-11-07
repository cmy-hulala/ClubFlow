import type { Brief, DueKind, Lang } from "./types";

export function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function parseISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string | null {
  const date = parseISODate(iso);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function daysFromToday(iso: string): number | null {
  const date = parseISODate(iso);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

export function dueKind(iso: string): DueKind {
  const diff = daysFromToday(iso);
  if (diff === null) return "ok";
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 3) return "soon";
  return "ok";
}

export function relativeLabel(iso: string, lang: Lang): string {
  const diff = daysFromToday(iso);
  if (diff === null) return lang === "zh" ? "日期無法計算" : "Date unavailable";
  if (lang === "zh") {
    if (diff === 0) return "就是今天";
    if (diff < 0) return `已過 ${-diff} 天`;
    return `還有 ${diff} 天`;
  }
  if (diff === 0) return "Today";
  if (diff < 0) return `${-diff} day${diff === -1 ? "" : "s"} overdue`;
  return `${diff} day${diff === 1 ? "" : "s"} left`;
}

const ZH_WEEK = "日一二三四五六";
const EN_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EN_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string, lang: Lang): string {
  const date = parseISODate(iso);
  if (!date) return iso ? iso : lang === "zh" ? "未填" : "Not set";
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (lang === "zh") return `${y}/${m}/${d}（${ZH_WEEK[date.getDay()]}）`;
  return `${EN_WEEK[date.getDay()]}, ${EN_MONTH[date.getMonth()]} ${d}, ${y}`;
}

export function formatShort(iso: string, lang: Lang): string {
  const date = parseISODate(iso);
  if (!date) return lang === "zh" ? "未填" : "TBD";
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (lang === "zh") return `${m}/${d}`;
  return `${EN_MONTH[date.getMonth()]} ${d}`;
}

export function formatStamp(iso: string, lang: Lang): string {
  if (!iso.trim()) return lang === "zh" ? "未填" : "Not set";
  const date = formatDate(iso, lang);
  const time = /T(\d{2}:\d{2})/.exec(iso)?.[1];
  return time ? `${date} ${time}` : date;
}

export function timeRange(brief: Brief): string {
  if (brief.startTime && brief.endTime) return `${brief.startTime}–${brief.endTime}`;
  return brief.startTime || brief.endTime || "";
}

export function whenLine(brief: Brief, lang: Lang): string {
  const date = brief.date ? formatDate(brief.date, lang) : lang === "zh" ? "未填日期" : "Date not set";
  const time = timeRange(brief);
  return time ? `${date} ${time}` : date;
}

export function capacityLabel(brief: Brief, lang: Lang): string {
  const cap = Number.parseInt(brief.capacity, 10);
  if (!Number.isFinite(cap) || cap <= 0) return lang === "zh" ? "未填" : "Not set";
  return lang === "zh" ? `${cap} 人` : `${cap} ${cap === 1 ? "person" : "people"}`;
}

export function capacityNumber(brief: Brief): number {
  const cap = Number.parseInt(brief.capacity, 10);
  return Number.isFinite(cap) && cap > 0 ? cap : 0;
}

export function ntd(amount: number): string {
  return `NT$${amount.toLocaleString("en-US")}`;
}

export type AcademicTerm = { roc: number; sem: 1 | 2; label: string };

export function academicTerm(iso: string, lang: Lang): AcademicTerm | null {
  const date = parseISODate(iso);
  if (!date) return null;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  let roc: number;
  let sem: 1 | 2;
  if (month >= 8) {
    roc = year - 1911;
    sem = 1;
  } else if (month === 1) {
    roc = year - 1911 - 1;
    sem = 1;
  } else {
    roc = year - 1911 - 1;
    sem = 2;
  }
  const label =
    lang === "zh"
      ? `${roc} 學年度第 ${sem} 學期`
      : `ROC academic year ${roc}, semester ${sem}`;
  return { roc, sem, label };
}

export function safeHttpUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    /* not a url */
  }
  return "https://example.com/clubflow/signup";
}

export function blank(value: string, lang: Lang): string {
  const trimmed = value.trim();
  if (trimmed) return trimmed;
  return lang === "zh" ? "（未填）" : "(not set)";
}

export function instagramUrl(handle: string): string | null {
  const name = handle.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{2,30}$/.test(name)) return null;
  return `https://instagram.com/${name}`;
}

export function lineId(text: string): string | null {
  const match = /@([A-Za-z0-9._-]{2,30})/.exec(text);
  return match ? match[1] : null;
}

export function kicker(brief: Brief, lang: Lang): string {
  const blob = `${brief.title} ${brief.description}`;
  if (/工作坊|workshop/i.test(blob)) return lang === "zh" ? "工作坊" : "WORKSHOP";
  if (/講座|分享會|talk/i.test(blob)) return lang === "zh" ? "講座" : "TALK";
  return lang === "zh" ? "社團活動" : "CLUB EVENT";
}

export function hashtags(brief: Brief, lang: Lang): string[] {
  const blob = `${brief.clubName} ${brief.title} ${brief.description} ${brief.venue}`;
  const tags = new Set<string>();
  if (lang === "zh") {
    tags.add("#大學社團");
    tags.add("#校園活動");
    if (/創|創業|新創|startup|innov/i.test(blob)) tags.add("#校園新創");
    if (/工作坊|workshop/i.test(blob)) tags.add("#工作坊");
    if (/陽明|交大|NYCU/i.test(blob)) {
      tags.add("#陽明交大");
      tags.add("#NYCU");
    }
    if (/新竹|光復|Hsinchu/i.test(blob)) tags.add("#新竹");
    tags.add("#社團活動");
  } else {
    tags.add("#StudentClub");
    tags.add("#CampusEvent");
    if (/創|創業|新創|startup|innov/i.test(blob)) tags.add("#CampusStartup");
    if (/工作坊|workshop/i.test(blob)) tags.add("#Workshop");
    if (/陽明|交大|NYCU/i.test(blob)) tags.add("#NYCU");
    if (/新竹|光復|Hsinchu/i.test(blob)) tags.add("#Hsinchu");
  }
  return [...tags].slice(0, 8);
}

export function schoolName(brief: Brief, lang: Lang): string {
  const blob = `${brief.clubName} ${brief.venue}`;
  if (/陽明|交通大學|NYCU/i.test(blob)) {
    return lang === "zh" ? "國立陽明交通大學" : "National Yang Ming Chiao Tung University";
  }
  return lang === "zh" ? "（請填所屬學校全名）" : "(fill in the school’s full name)";
}

const REQUIRED: (keyof Brief)[] = [
  "title",
  "description",
  "audience",
  "speakerName",
  "date",
  "startTime",
  "endTime",
  "venue",
  "capacity",
  "signupDeadline",
  "clubName",
];

export function missingFields(brief: Brief): (keyof Brief)[] {
  const missing: (keyof Brief)[] = [];
  for (const key of REQUIRED) {
    if (!brief[key].trim()) missing.push(key);
  }
  if (brief.capacity.trim() && capacityNumber(brief) <= 0 && !missing.includes("capacity")) {
    missing.push("capacity");
  }
  return missing;
}

export function fieldLabel(key: keyof Brief, lang: Lang): string {
  const zh: Record<keyof Brief, string> = {
    title: "活動名稱",
    description: "一段介紹",
    audience: "對象",
    speakerName: "講者姓名",
    speakerRole: "講者頭銜",
    speakerBio: "講者簡介",
    date: "日期",
    startTime: "開始時間",
    endTime: "結束時間",
    venue: "地點",
    capacity: "名額",
    signupDeadline: "報名截止",
    clubName: "社團名稱",
    contactEmail: "聯絡信箱",
    contactPhone: "LINE 或電話",
    socialHandle: "Instagram",
    signupUrl: "報名連結",
  };
  const en: Record<keyof Brief, string> = {
    title: "Event title",
    description: "Description",
    audience: "Audience",
    speakerName: "Speaker name",
    speakerRole: "Speaker role",
    speakerBio: "Speaker bio",
    date: "Date",
    startTime: "Start time",
    endTime: "End time",
    venue: "Venue",
    capacity: "Capacity",
    signupDeadline: "Signup deadline",
    clubName: "Club name",
    contactEmail: "Contact email",
    contactPhone: "LINE or phone",
    socialHandle: "Instagram",
    signupUrl: "Signup URL",
  };
  return (lang === "zh" ? zh : en)[key];
}
