import { blank, kicker } from "./format";
import { t } from "./i18n";
import type { Brief, Lang } from "./types";

const SANS = '"Outfit", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';

type Layout = { size: number; lines: string[] };

function pathRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const tokens: string[] = [];
    for (const piece of para.split(/(\s+)/)) {
      if (!piece) continue;
      if (ctx.measureText(piece).width > maxWidth) {
        for (const ch of piece) tokens.push(ch);
      } else {
        tokens.push(piece);
      }
    }
    let line = "";
    for (const tok of tokens) {
      const next = line + tok;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line.replace(/\s+$/, ""));
        line = tok.trimStart();
      } else {
        line = next;
      }
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines.length ? lines : [""];
}

function layoutText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  min: number,
  weight: string,
  maxLines: number,
): Layout {
  let size = start;
  let lines: string[] = [];
  while (size >= min) {
    ctx.font = `${weight} ${size}px ${SANS}`;
    lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines) break;
    size -= 2;
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : "…";
  }
  return { size, lines };
}

function splitHeadline(title: string): [string, string] | null {
  const mark = title.includes("：") ? "：" : title.includes(": ") ? ": " : "";
  if (!mark) return null;
  const idx = title.indexOf(mark);
  const left = `${title.slice(0, idx)}${mark.trim()}`.trim();
  const right = title.slice(idx + mark.length).trim();
  if (left.length < 2 || right.length < 4) return null;
  return [left, right];
}

function drawHeadline(
  ctx: CanvasRenderingContext2D,
  title: string,
  x: number,
  y: number,
  maxWidth: number,
  start: number,
  min: number,
): number {
  const parts = splitHeadline(title);
  if (parts) {
    let size = start;
    while (size >= min) {
      ctx.font = `700 ${size}px ${SANS}`;
      if (parts.every((part) => ctx.measureText(part).width <= maxWidth)) break;
      size -= 2;
    }
    ctx.font = `700 ${size}px ${SANS}`;
    if (parts.every((part) => ctx.measureText(part).width <= maxWidth)) {
      for (const part of parts) {
        ctx.fillText(part, x, y);
        y += size * 1.22;
      }
      return y;
    }
  }
  const titleLayout = layoutText(ctx, title, maxWidth, start, Math.min(min, 36), "700", 4);
  ctx.font = `700 ${titleLayout.size}px ${SANS}`;
  return drawLines(ctx, titleLayout.lines, x, y, titleLayout.size * 1.25);
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
): number {
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function canvas(width: number, height: number): CanvasRenderingContext2D | null {
  const node = document.createElement("canvas");
  node.width = width;
  node.height = height;
  const ctx = node.getContext("2d");
  if (!ctx) return null;
  ctx.textBaseline = "top";
  return ctx;
}

function png(ctx: CanvasRenderingContext2D): string {
  return ctx.canvas.toDataURL("image/png");
}

export function drawStory(brief: Brief, lang: Lang, when: string, capacity: string, deadline: string): string {
  const ctx = canvas(1080, 1920);
  if (!ctx) return "";
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1920);
  gradient.addColorStop(0, "#1a4a3e");
  gradient.addColorStop(0.45, "#12352c");
  gradient.addColorStop(1, "#0c1e1a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1920);

  ctx.strokeStyle = "rgba(230, 194, 122, 0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(980, 140, 180, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(980, 140, 280, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#e6c27a";
  ctx.fillRect(0, 0, 1080, 12);

  let y = 88;
  ctx.fillStyle = "#e6c27a";
  ctx.font = `500 30px ${SANS}`;
  ctx.textAlign = "left";
  const club = layoutText(ctx, brief.clubName || "ClubFlow", 820, 30, 22, "500", 1);
  ctx.font = `500 ${club.size}px ${SANS}`;
  ctx.fillText(club.lines[0] ?? "", 72, y);
  y += 64;

  const kick = kicker(brief, lang);
  ctx.font = `700 24px ${SANS}`;
  const pillW = ctx.measureText(kick).width + 40;
  pathRound(ctx, 72, y, pillW, 46, 23);
  ctx.fillStyle = "rgba(230, 194, 122, 0.16)";
  ctx.fill();
  ctx.fillStyle = "#e6c27a";
  ctx.fillText(kick, 92, y + 10);
  y += 78;

  ctx.fillStyle = "#f6f3ec";
  y = drawHeadline(ctx, brief.title || (lang === "zh" ? "未命名活動" : "Untitled event"), 72, y, 920, 68, 46);
  y += 28;
  ctx.fillStyle = "#e6c27a";
  ctx.fillRect(72, y, 112, 5);
  y += 36;

  ctx.fillStyle = "#e6c27a";
  ctx.font = `700 22px ${SANS}`;
  ctx.fillText(lang === "zh" ? "講者" : "SPEAKER", 72, y);
  y += 34;
  ctx.fillStyle = "#ffffff";
  const name = layoutText(ctx, brief.speakerName || "—", 920, 52, 32, "700", 2);
  ctx.font = `700 ${name.size}px ${SANS}`;
  y = drawLines(ctx, name.lines, 72, y, name.size * 1.2);
  y += 8;
  if (brief.speakerRole.trim()) {
    ctx.fillStyle = "#d7e6de";
    const role = layoutText(ctx, brief.speakerRole, 920, 30, 24, "500", 2);
    ctx.font = `500 ${role.size}px ${SANS}`;
    y = drawLines(ctx, role.lines, 72, y, role.size * 1.35);
  }
  if (brief.speakerBio.trim()) {
    y += 12;
    ctx.fillStyle = "#d5e4dc";
    const bio = layoutText(ctx, brief.speakerBio, 920, 28, 22, "400", 4);
    ctx.font = `400 ${bio.size}px ${SANS}`;
    y = drawLines(ctx, bio.lines, 72, y, bio.size * 1.45);
  }

  const rows: [string, string][] = [
    [lang === "zh" ? "時間" : "WHEN", when],
    [lang === "zh" ? "地點" : "WHERE", blank(brief.venue, lang)],
    [lang === "zh" ? "名額" : "SEATS", capacity],
    [lang === "zh" ? "報名截止" : "SIGN UP BY", deadline],
  ];
  const rowPitch = 136;
  const bandTop = Math.min(Math.max(y + 36, 1180), 1840 - rows.length * rowPitch);
  ctx.fillStyle = "#0c241e";
  ctx.fillRect(0, bandTop - 28, 1080, 1920 - (bandTop - 28));
  ctx.fillStyle = "rgba(230, 194, 122, 0.9)";
  ctx.fillRect(0, bandTop - 28, 1080, 4);
  y = bandTop;
  for (const [label, value] of rows) {
    pathRound(ctx, 72, y, 936, 128, 20);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.fillStyle = "#e6c27a";
    ctx.font = `700 20px ${SANS}`;
    ctx.fillText(label, 96, y + 14);
    ctx.fillStyle = "#f6f3ec";
    const valueLayout = layoutText(ctx, value, 880, 28, 20, "500", 2);
    ctx.font = `500 ${valueLayout.size}px ${SANS}`;
    drawLines(ctx, valueLayout.lines, 96, y + 44, valueLayout.size * 1.25);
    y += 140;
  }

  ctx.fillStyle = "#8ea89c";
  ctx.font = `400 24px ${SANS}`;
  const foot = brief.socialHandle.trim() || brief.clubName;
  ctx.fillText(foot, 72, 1864);
  return png(ctx);
}

export function drawPost(brief: Brief, lang: Lang, when: string, capacity: string, deadline: string): string {
  const ctx = canvas(1080, 1350);
  if (!ctx) return "";
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#0f6e56";
  ctx.fillRect(0, 0, 1080, 16);
  ctx.fillRect(0, 0, 18, 1350);

  let y = 64;
  ctx.fillStyle = "#0f6e56";
  ctx.font = `700 28px ${SANS}`;
  const club = layoutText(ctx, brief.clubName || "ClubFlow", 900, 28, 20, "700", 1);
  ctx.font = `700 ${club.size}px ${SANS}`;
  ctx.fillText(club.lines[0] ?? "", 64, y);
  y += 48;
  ctx.fillStyle = "#a5792b";
  ctx.font = `700 22px ${SANS}`;
  ctx.fillText(kicker(brief, lang), 64, y);
  y += 48;

  ctx.fillStyle = "#1c2420";
  y = drawHeadline(ctx, brief.title || (lang === "zh" ? "未命名活動" : "Untitled event"), 64, y, 940, 60, 42);
  y += 28;
  ctx.fillStyle = "#0f6e56";
  ctx.fillRect(64, y, 96, 4);
  y += 32;

  ctx.fillStyle = "#5c675f";
  ctx.font = `700 20px ${SANS}`;
  ctx.fillText(lang === "zh" ? "講者" : "SPEAKER", 64, y);
  y += 32;
  ctx.fillStyle = "#1c2420";
  const name = layoutText(ctx, brief.speakerName || "—", 940, 44, 28, "700", 2);
  ctx.font = `700 ${name.size}px ${SANS}`;
  y = drawLines(ctx, name.lines, 64, y, name.size * 1.2);
  if (brief.speakerRole.trim()) {
    y += 6;
    ctx.fillStyle = "#3d4c45";
    const role = layoutText(ctx, brief.speakerRole, 940, 28, 22, "500", 2);
    ctx.font = `500 ${role.size}px ${SANS}`;
    y = drawLines(ctx, role.lines, 64, y, role.size * 1.35);
  }
  if (brief.speakerBio.trim() && y < 860) {
    y += 16;
    ctx.fillStyle = "#5c675f";
    const bio = layoutText(ctx, brief.speakerBio, 940, 26, 20, "400", 4);
    ctx.font = `400 ${bio.size}px ${SANS}`;
    drawLines(ctx, bio.lines, 64, y, bio.size * 1.45);
  }

  ctx.fillStyle = "#0f6e56";
  ctx.fillRect(0, 1040, 1080, 310);
  const facts: [string, string][] = [
    [lang === "zh" ? "時間" : "WHEN", when],
    [lang === "zh" ? "地點" : "WHERE", blank(brief.venue, lang)],
    [lang === "zh" ? "名額" : "SEATS", capacity],
    [lang === "zh" ? "報名截止" : "DEADLINE", deadline],
  ];
  facts.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 64 + col * 500;
    const fy = 1076 + row * 120;
    ctx.fillStyle = "#e6c27a";
    ctx.font = `700 20px ${SANS}`;
    ctx.fillText(label, x, fy);
    ctx.fillStyle = "#f6f3ec";
    const laid = layoutText(ctx, value, 460, 30, 20, "500", 2);
    ctx.font = `500 ${laid.size}px ${SANS}`;
    drawLines(ctx, laid.lines, x, fy + 32, laid.size * 1.25);
  });
  return png(ctx);
}

function sealText(club: string, lang: Lang): string {
  const cleaned = club.replace(/\s+/g, "");
  if (!cleaned) return lang === "zh" ? "社團" : "CLUB";
  if (lang === "en") {
    const word = club.split(/\s+/).find((part) => part.length >= 3) ?? club;
    return word.slice(0, 10).toUpperCase();
  }
  return cleaned.length <= 6 ? cleaned : cleaned.slice(-3);
}

export function drawCertificate(
  brief: Brief,
  lang: Lang,
  kind: "speaker" | "attendee",
  when: string,
): string {
  const ctx = canvas(1754, 1240);
  if (!ctx) return "";
  ctx.fillStyle = "#fbf7ef";
  ctx.fillRect(0, 0, 1754, 1240);
  ctx.strokeStyle = "#0f6e56";
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, 1682, 1168);
  ctx.lineWidth = 1;
  ctx.strokeRect(52, 52, 1650, 1136);
  ctx.fillStyle = "#0f6e56";
  ctx.fillRect(36, 36, 1682, 10);

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f6e56";
  ctx.font = `500 28px ${SANS}`;
  const club = layoutText(ctx, brief.clubName || "ClubFlow", 1400, 28, 20, "500", 1);
  ctx.font = `500 ${club.size}px ${SANS}`;
  ctx.fillText(club.lines[0] ?? "", 877, 110);

  const title =
    kind === "speaker"
      ? lang === "zh"
        ? "感謝狀"
        : "Certificate of Appreciation"
      : lang === "zh"
        ? "參與證明"
        : "Certificate of Participation";
  ctx.fillStyle = "#1c2420";
  ctx.font = `700 72px ${SANS}`;
  ctx.fillText(title, 877, 180);

  ctx.fillStyle = "#a5792b";
  ctx.fillRect(787, 280, 180, 3);

  if (kind === "speaker") {
    ctx.fillStyle = "#5c675f";
    ctx.font = `500 26px ${SANS}`;
    ctx.fillText(lang === "zh" ? "謹致" : "Presented to", 877, 320);
    ctx.fillStyle = "#1c2420";
    const name = layoutText(ctx, brief.speakerName || "—", 1400, 64, 36, "700", 2);
    ctx.font = `700 ${name.size}px ${SANS}`;
    let y = 370;
    for (const line of name.lines) {
      ctx.fillText(line, 877, y);
      y += name.size * 1.15;
    }
    if (brief.speakerRole.trim()) {
      ctx.fillStyle = "#3d4c45";
      ctx.font = `500 28px ${SANS}`;
      const role = layoutText(ctx, brief.speakerRole, 1200, 28, 20, "500", 1);
      ctx.font = `500 ${role.size}px ${SANS}`;
      ctx.fillText(role.lines[0] ?? "", 877, y + 8);
    }
  } else {
    ctx.fillStyle = "#5c675f";
    ctx.font = `500 26px ${SANS}`;
    ctx.fillText(lang === "zh" ? "參加者" : "Participant", 877, 330);
    ctx.strokeStyle = "#1c2420";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(560, 470);
    ctx.lineTo(1194, 470);
    ctx.stroke();
    ctx.fillStyle = "#8a8175";
    ctx.font = `400 22px ${SANS}`;
    ctx.fillText(lang === "zh" ? "（印之前手寫姓名）" : "(write the name in before printing)", 877, 486);
  }

  const body =
    kind === "speaker"
      ? lang === "zh"
        ? `感謝擔任「${brief.title || "本活動"}」講者，於 ${when} 在 ${blank(brief.venue, lang)} 與同學分享。${brief.clubName || "本社團"} 謹此致謝。`
        : `Thank you for speaking at “${brief.title || "this event"}” on ${when} at ${blank(brief.venue, lang)}. With thanks from ${brief.clubName || "the club"}.`
      : lang === "zh"
        ? `感謝參加 ${brief.clubName || "本社團"} 舉辦之「${brief.title || "本活動"}」。時間 ${when}，地點 ${blank(brief.venue, lang)}。`
        : `Thank you for joining “${brief.title || "this event"}”, hosted by ${brief.clubName || "the club"}. ${when} · ${blank(brief.venue, lang)}.`;

  ctx.fillStyle = "#1c2420";
  ctx.textAlign = "center";
  const paragraph = layoutText(ctx, body, 1280, 30, 22, "400", 4);
  ctx.font = `400 ${paragraph.size}px ${SANS}`;
  let by = kind === "speaker" ? 620 : 560;
  for (const line of paragraph.lines) {
    ctx.fillText(line, 877, by);
    by += paragraph.size * 1.5;
  }

  ctx.textAlign = "left";
  drawSeal(ctx, 210, 980, sealText(brief.clubName, lang));

  signature(ctx, 620, 1000, t(lang, "sigPresident"));
  signature(ctx, 1100, 1000, t(lang, "sigLead"));

  ctx.textAlign = "center";
  ctx.fillStyle = "#8a8175";
  ctx.font = `400 20px ${SANS}`;
  ctx.fillText(
    lang === "zh" ? "簽名由幹部親簽。此圖不代表已經用印或寄出。" : "Officers sign by hand. This image is not sealed or sent.",
    877,
    1160,
  );
  ctx.textAlign = "left";
  return png(ctx);
}

function signature(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  ctx.strokeStyle = "#1c2420";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 280, y);
  ctx.stroke();
  ctx.fillStyle = "#3d4c45";
  ctx.font = `500 22px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText(label, x + 140, y + 16);
  ctx.textAlign = "left";
}

function drawSeal(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#c84b2f";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 64, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#c84b2f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = label.length > 4 ? 22 : 28;
  ctx.font = `700 ${size}px ${SANS}`;
  const lines = label.length > 4 ? [label.slice(0, Math.ceil(label.length / 2)), label.slice(Math.ceil(label.length / 2))] : [label];
  lines.forEach((line, index) => {
    const offset = (index - (lines.length - 1) / 2) * (size + 4);
    ctx.fillText(line, 0, offset);
  });
  ctx.restore();
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
}
