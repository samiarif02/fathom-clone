import type { SummarySection } from "../../shared/pipeline.ts";
export type { SummarySection };

export type Participant = { id: string; name: string; color: string; idx: number };
export type Segment = { id: number; idx: number; start_ms: number; end_ms: number; text: string; participant_id: string | null };
export type Chapter = { id: string; idx: number; start_ms: number; end_ms: number; title: string; gist: string };
export type Summary = { template: string; sections: SummarySection[]; created_at: string };
export type ActionItem = { id: string; idx: number; text: string; assignee_participant_id: string | null; at_ms: number | null; done: boolean };
export type Highlight = { id: string; start_ms: number; end_ms: number; note: string; share_token: string | null; view_count: number; created_at: string };

export type MeetingSummaryRow = {
  id: string;
  title: string;
  started_at: string;
  duration_ms: number;
  status: "processing" | "ready" | "failed";
  source: "seed" | "upload" | "browser";
  participants: Pick<Participant, "name" | "color" | "idx">[];
  action_items: { count: number }[];
  highlights: { count: number }[];
  overview?: string;
};

export type MeetingDetail = {
  id: string;
  title: string;
  started_at: string;
  duration_ms: number;
  status: "processing" | "ready" | "failed";
  error: string | null;
  share_token?: string | null;
  share_views?: number;
  stage: "uploading" | "transcribe" | "transcribing" | "analyze" | "analyzing" | "done";
  source: string;
  media_kind: "video" | "audio" | null;
  participants: Participant[];
  segments: Segment[];
  chapters: Chapter[];
  summaries: Summary[];
  action_items: ActionItem[];
  highlights: Highlight[];
};

export type SearchHit = {
  meeting_id: string;
  meeting_title: string;
  started_at: string;
  kind: "title" | "transcript" | "summary";
  snippet: string;
  at_ms: number | null;
  speaker: string | null;
  rank: number;
};
