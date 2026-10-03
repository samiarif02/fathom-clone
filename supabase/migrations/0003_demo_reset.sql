-- The demo account is shared by everyone who clicks "Try the demo", so it is rebuilt nightly
-- from a golden copy owned by a hidden template user. Dates shift so the newest meeting
-- always lands on "yesterday". Seeded highlights get deterministic share tokens, so their
-- public clip links survive resets.

create or replace function public.reset_demo()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  src uuid := (select id from auth.users where email = 'template@fieldnote.example');
  dst uuid := (select id from auth.users where email = 'demo@fieldnote.example');
  shift interval;
  m record;
  new_id uuid;
  n integer := 0;
begin
  if src is null or dst is null then
    raise exception 'template or demo user missing';
  end if;

  delete from meetings where owner_id = dst;

  select date_trunc('day', now()) - interval '1 day' - date_trunc('day', max(started_at))
    into shift from meetings where owner_id = src;

  for m in select * from meetings where owner_id = src loop
    insert into meetings (owner_id, title, started_at, duration_ms, source, media_key, media_kind, status, stage, error)
    values (dst, m.title, m.started_at + shift, m.duration_ms, m.source, m.media_key, m.media_kind, m.status, m.stage, m.error)
    returning id into new_id;

    create temp table if not exists pmap (old uuid primary key, new uuid not null) on commit drop;
    delete from pmap;
    insert into pmap select p.id, gen_random_uuid() from participants p where p.meeting_id = m.id;

    insert into participants (id, meeting_id, name, email, color, idx)
      select pm.new, new_id, p.name, p.email, p.color, p.idx
      from participants p join pmap pm on pm.old = p.id;
    insert into transcript_segments (meeting_id, participant_id, idx, start_ms, end_ms, text)
      select new_id, pm.new, s.idx, s.start_ms, s.end_ms, s.text
      from transcript_segments s left join pmap pm on pm.old = s.participant_id
      where s.meeting_id = m.id;
    insert into chapters (meeting_id, idx, start_ms, end_ms, title, gist)
      select new_id, idx, start_ms, end_ms, title, gist from chapters where meeting_id = m.id;
    insert into summaries (meeting_id, template, sections, plain, model, created_at)
      select new_id, template, sections, plain, model, created_at from summaries where meeting_id = m.id;
    insert into action_items (meeting_id, idx, text, assignee_participant_id, at_ms, done)
      select new_id, a.idx, a.text, pm.new, a.at_ms, false
      from action_items a left join pmap pm on pm.old = a.assignee_participant_id
      where a.meeting_id = m.id;
    insert into highlights (meeting_id, created_by, start_ms, end_ms, note, share_token, created_at)
      select new_id, dst, h.start_ms, h.end_ms, h.note,
             'demo-' || substr(md5(m.title || ':' || h.start_ms), 1, 10), h.created_at + shift
      from highlights h where h.meeting_id = m.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Only the service role (the Worker's cron and the seed script) may run it.
revoke execute on function public.reset_demo() from public, anon, authenticated;
