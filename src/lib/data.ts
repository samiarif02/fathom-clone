import { getSupabase } from "./supabase";
import type { MeetingDetail, MeetingSummaryRow, SearchHit } from "./types";

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function listMeetings(): Promise<MeetingSummaryRow[]> {
  const sb = await getSupabase();
  const [meetings, summaries] = await Promise.all([
    sb.from("meetings")
      .select("id,title,started_at,duration_ms,status,source,participants(name,color,idx),action_items(count),highlights(count)")
      .order("started_at", { ascending: false }),
    sb.from("summaries").select("meeting_id,sections").eq("template", "general"),
  ]);
  const rows = check(meetings) as MeetingSummaryRow[];
  const overview = new Map(
    (check(summaries) as { meeting_id: string; sections: { bullets: { text: string }[] }[] }[]).map((s) => [
      s.meeting_id,
      s.sections[0]?.bullets.map((b) => b.text).join(" "),
    ]),
  );
  return rows.map((r) => ({ ...r, overview: overview.get(r.id), participants: [...r.participants].sort((a, b) => a.idx - b.idx) }));
}

export async function getMeeting(id: string): Promise<MeetingDetail> {
  const sb = await getSupabase();
  const [m, segments] = await Promise.all([
    sb.from("meetings")
      .select("id,title,started_at,duration_ms,status,error,stage,source,media_kind,participants(*),chapters(*),summaries(template,sections,created_at),action_items(*),highlights(*)")
      .eq("id", id)
      .single(),
    sb.from("transcript_segments").select("id,idx,start_ms,end_ms,text,participant_id").eq("meeting_id", id).order("idx").limit(5000),
  ]);
  const meeting = check(m) as Omit<MeetingDetail, "segments">;
  const byIdx = <T extends { idx: number }>(xs: T[]) => [...xs].sort((a, b) => a.idx - b.idx);
  return {
    ...meeting,
    participants: byIdx(meeting.participants),
    chapters: byIdx(meeting.chapters),
    action_items: byIdx(meeting.action_items),
    highlights: [...meeting.highlights].sort((a, b) => a.start_ms - b.start_ms),
    segments: check(segments),
  };
}

export async function search(q: string): Promise<SearchHit[]> {
  const sb = await getSupabase();
  return check(await sb.rpc("search", { q })) as SearchHit[];
}
