-- Resumable processing for uploads: uploading -> transcribe -> analyze -> done.
-- A step is claimed atomically (transcribe -> transcribing) so two tabs can't run it twice.
alter table public.meetings add column if not exists stage text not null default 'done';
