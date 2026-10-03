-- Fathom clone: core schema. Every user-facing table is owned through meetings.owner_id
-- and protected by row level security. The Worker uses the user's JWT for normal reads
-- and the service role only for public clip links, seeding and the processing pipeline.

create extension if not exists pgcrypto;

create table public.meetings (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  started_at    timestamptz not null default now(),
  duration_ms   integer not null default 0,
  source        text not null default 'upload' check (source in ('seed', 'upload', 'browser')),
  media_key     text,
  media_kind    text check (media_kind in ('video', 'audio')),
  status        text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  error         text,
  calendar_event_id text,
  created_at    timestamptz not null default now(),
  tsv           tsvector generated always as (to_tsvector('english', title)) stored
);
create index meetings_owner_started on public.meetings (owner_id, started_at desc);
create index meetings_tsv on public.meetings using gin (tsv);

create table public.participants (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  name        text not null,
  email       text,
  color       text not null default '#6366f1',
  idx         integer not null default 0
);
create index participants_meeting on public.participants (meeting_id, idx);

create table public.transcript_segments (
  id              bigint generated always as identity primary key,
  meeting_id      uuid not null references public.meetings(id) on delete cascade,
  participant_id  uuid references public.participants(id) on delete set null,
  idx             integer not null,
  start_ms        integer not null,
  end_ms          integer not null,
  text            text not null,
  tsv             tsvector generated always as (to_tsvector('english', text)) stored
);
create index segments_meeting_start on public.transcript_segments (meeting_id, start_ms);
create index segments_tsv on public.transcript_segments using gin (tsv);

create table public.chapters (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  idx         integer not null,
  start_ms    integer not null,
  end_ms      integer not null,
  title       text not null,
  gist        text not null default ''
);
create index chapters_meeting on public.chapters (meeting_id, idx);

-- sections: [{ "heading": text, "bullets": [{ "text": text, "at_ms": int|null }] }]
create table public.summaries (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  template    text not null,
  sections    jsonb not null,
  plain       text not null default '',
  model       text not null,
  created_at  timestamptz not null default now(),
  tsv         tsvector generated always as (to_tsvector('english', plain)) stored,
  unique (meeting_id, template)
);
create index summaries_tsv on public.summaries using gin (tsv);

create table public.action_items (
  id                       uuid primary key default gen_random_uuid(),
  meeting_id               uuid not null references public.meetings(id) on delete cascade,
  idx                      integer not null default 0,
  text                     text not null,
  assignee_participant_id  uuid references public.participants(id) on delete set null,
  at_ms                    integer,
  done                     boolean not null default false
);
create index action_items_meeting on public.action_items (meeting_id, idx);

create table public.highlights (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references public.meetings(id) on delete cascade,
  created_by   uuid not null references auth.users(id) on delete cascade,
  start_ms     integer not null,
  end_ms       integer not null check (end_ms > start_ms),
  note         text not null default '',
  share_token  text unique,
  view_count   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index highlights_meeting on public.highlights (meeting_id, start_ms);

-- Server-only: holds Google refresh tokens. RLS on with no policies = no client access.
create table public.calendar_accounts (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  google_email   text not null,
  refresh_token  text not null,
  connected_at   timestamptz not null default now()
);

-- Row level security ---------------------------------------------------------

alter table public.meetings            enable row level security;
alter table public.participants        enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.chapters            enable row level security;
alter table public.summaries           enable row level security;
alter table public.action_items        enable row level security;
alter table public.highlights          enable row level security;
alter table public.calendar_accounts   enable row level security;

create policy meetings_owner on public.meetings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.owns_meeting(m uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from meetings where id = m and owner_id = auth.uid())
$$;

create policy participants_owner on public.participants
  for all using (owns_meeting(meeting_id)) with check (owns_meeting(meeting_id));
create policy segments_owner on public.transcript_segments
  for all using (owns_meeting(meeting_id)) with check (owns_meeting(meeting_id));
create policy chapters_owner on public.chapters
  for all using (owns_meeting(meeting_id)) with check (owns_meeting(meeting_id));
create policy summaries_owner on public.summaries
  for all using (owns_meeting(meeting_id)) with check (owns_meeting(meeting_id));
create policy action_items_owner on public.action_items
  for all using (owns_meeting(meeting_id)) with check (owns_meeting(meeting_id));
create policy highlights_owner on public.highlights
  for all using (owns_meeting(meeting_id)) with check (owns_meeting(meeting_id) and created_by = auth.uid());

-- Search ---------------------------------------------------------------------
-- One query across titles, transcript lines and summaries. Runs as the caller, so RLS
-- limits it to the caller's meetings. Transcript hits carry at_ms so the UI can open
-- the meeting at the moment the words were said.

create or replace function public.search(q text)
returns table (
  meeting_id uuid, meeting_title text, started_at timestamptz,
  kind text, snippet text, at_ms integer, speaker text, rank real
)
language sql stable set search_path = public as $$
  with query as (select websearch_to_tsquery('english', q) as tq)
  select m.id, m.title, m.started_at, 'title',
         ts_headline('english', m.title, query.tq, 'StartSel=<mark>,StopSel=</mark>'),
         null::integer, null::text, ts_rank(m.tsv, query.tq) * 2
  from meetings m, query where m.tsv @@ query.tq
  union all
  select m.id, m.title, m.started_at, 'transcript',
         ts_headline('english', s.text, query.tq, 'StartSel=<mark>,StopSel=</mark>,MaxWords=30,MinWords=12'),
         s.start_ms, p.name, ts_rank(s.tsv, query.tq)
  from transcript_segments s
  join meetings m on m.id = s.meeting_id
  left join participants p on p.id = s.participant_id, query
  where s.tsv @@ query.tq
  union all
  select m.id, m.title, m.started_at, 'summary',
         ts_headline('english', su.plain, query.tq, 'StartSel=<mark>,StopSel=</mark>,MaxWords=30,MinWords=12'),
         null::integer, su.template, ts_rank(su.tsv, query.tq) * 1.5
  from summaries su join meetings m on m.id = su.meeting_id, query
  where su.tsv @@ query.tq
  order by 8 desc, 3 desc
  limit 200
$$;
