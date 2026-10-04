-- View-only links for a whole meeting. The token is the credential; null means not shared.
alter table public.meetings add column if not exists share_token text unique;
alter table public.meetings add column if not exists share_views integer not null default 0;
