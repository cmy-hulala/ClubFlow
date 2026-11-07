import type { Brief, Lang } from "./types";

export function emptyBrief(): Brief {
  return {
    title: "",
    description: "",
    audience: "",
    speakerName: "",
    speakerRole: "",
    speakerBio: "",
    date: "",
    startTime: "14:00",
    endTime: "16:30",
    venue: "",
    capacity: "",
    signupDeadline: "",
    clubName: "",
    contactEmail: "",
    contactPhone: "",
    socialHandle: "",
    signupUrl: "https://example.com/clubflow/signup",
  };
}

const zh: Brief = {
  title: "從0到1：校園團隊如何拿到第一筆資金",
  description:
    "很多校園團隊停在「想法很多，但不知道第一筆錢要向誰開口」。這場工作坊請巷口實驗室共同創辦人林可恩，用他自己從交大專題、AppWorks，到店家願意付費的過程，拆開三件事：怎麼把專案說成對方聽得懂的一句話、第一筆資金通常從補助、預購還是認識的學長姊來，以及離開教室前要交出的一頁腳本。",
  audience: "想提案、準備新創競賽，或只是想知道第一步怎麼踏的大學部與研究生",
  speakerName: "林可恩",
  speakerRole: "巷口實驗室共同創辦人",
  speakerBio:
    "陽明交大資工系學士，AppWorks 校友。現在和搭檔做「巷口實驗室」，幫新竹與台北的獨立店家把訂位和會員收到同一個簡單後台。擅長把商業模式換成學弟妹聽得懂的例子。",
  date: "2026-11-21",
  startTime: "14:00",
  endTime: "16:30",
  venue: "陽明交大光復校區 工程三館 EC 201",
  capacity: "80",
  signupDeadline: "2026-11-18T23:59",
  clubName: "陽明交大創創社",
  contactEmail: "eic.nycu@example.com",
  contactPhone: "LINE 官方帳號 @nycu-eic-demo",
  socialHandle: "@nycu.eic",
  signupUrl: "https://example.com/nycu-eic/first-funding",
};

const en: Brief = {
  title: "From zero to one: how a campus team lands its first check",
  description:
    "Most student teams stall in the same place: plenty of ideas, and no idea who to ask for the first money. Ken Lin, co-founder of Lane Lab, walks through his own path from an NYCU class project to AppWorks and then to shops that actually pay. Three parts: say the project in one sentence a listener understands, where a first check usually comes from (a grant, a pre-order, or an alum who gets it), and the one-page script you finish before you leave the room.",
  audience:
    "Undergraduates and graduate students who are about to pitch, entering a startup contest, or just want the first step to feel concrete",
  speakerName: "Ken Lin",
  speakerRole: "Co-founder, Lane Lab",
  speakerBio:
    "NYCU CS alumnus and AppWorks alum. Co-founder of Lane Lab, a small back office for reservations and memberships used by independent shops in Hsinchu and Taipei. He translates messy business models into examples younger students can reuse.",
  date: "2026-11-21",
  startTime: "14:00",
  endTime: "16:30",
  venue: "NYCU Kuang-Fu Campus, Engineering Building 3, Room EC 201",
  capacity: "80",
  signupDeadline: "2026-11-18T23:59",
  clubName: "NYCU Entrepreneurship & Innovation Club",
  contactEmail: "eic.nycu@example.com",
  contactPhone: "LINE Official Account @nycu-eic-demo",
  socialHandle: "@nycu.eic",
  signupUrl: "https://example.com/nycu-eic/first-funding",
};

export function sampleBrief(lang: Lang): Brief {
  return { ...(lang === "zh" ? zh : en) };
}
