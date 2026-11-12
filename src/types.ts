export type Lang = "zh" | "en";

export type View = "desk" | "home" | "brief" | "market" | "outputs";

export type ModuleId =
  | "ig-post"
  | "ig-story"
  | "line"
  | "gform"
  | "gmail"
  | "reminders"
  | "linktree"
  | "school"
  | "certificate"
  | "postevent"
  | "checkin"
  | "approval"
  | "handover"
  | "shorturl";

export type Tier = "included" | "addon" | "soon";

export type ModuleMeta = {
  id: ModuleId;
  tier: Tier;
  /** Sample price in TWD per event. Omitted for included and coming-soon modules. */
  price?: number;
};

export type Brief = {
  title: string;
  description: string;
  audience: string;
  speakerName: string;
  speakerRole: string;
  speakerBio: string;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  capacity: string;
  signupDeadline: string;
  clubName: string;
  contactEmail: string;
  contactPhone: string;
  socialHandle: string;
  signupUrl: string;
};

export type DueKind = "overdue" | "today" | "soon" | "ok";

export type TimelineItem = {
  when: string;
  title: string;
  detail: string;
  status: string;
  kind: DueKind;
};

export type FormField = {
  name: string;
  kind: string;
  required: boolean;
  options?: string[];
  help?: string;
};

export type LinkItem = {
  order: number;
  title: string;
  url: string;
  note: string;
};

export type MoneyRow = {
  item: string;
  note: string;
  amount: number;
};

export type Paper = {
  index: string;
  kicker: string;
  title: string;
  deadline: string;
  status: string;
  kind: DueKind;
  rows: { k: string; v: string }[];
  table?: { caption: string; headers: string[]; rows: string[][] };
  bullets?: { title: string; items: string[] };
  foot: string;
};

export type Block =
  | { type: "note"; tone: "info" | "warn"; text: string }
  | { type: "text"; label: string; text: string }
  | { type: "tags"; label: string; tags: string[] }
  | { type: "kv"; label: string; rows: { k: string; v: string }[] }
  | { type: "fields"; label: string; intro: string; fields: FormField[] }
  | { type: "links"; label: string; links: LinkItem[]; json: string }
  | { type: "mail"; subject: string; html: string; text: string; note: string }
  | { type: "line"; label: string; text: string }
  | { type: "papers"; intro: string; timeline: TimelineItem[]; papers: Paper[] }
  | {
      type: "image";
      label: string;
      alt: string;
      dataUrl: string;
      filename: string;
      width: number;
      height: number;
      fallback: string;
    }
  | { type: "calendar"; label: string; items: TimelineItem[] };

export type ModuleOutput = {
  id: ModuleId;
  blocks: Block[];
};
