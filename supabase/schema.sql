-- Parallax — database schema (draft)
--
-- Run in the Supabase SQL Editor for project pfxhurxusazmjkkxrtpo.
-- Safe to re-run: every statement is idempotent.
--
-- Tables:
--   profiles              a public name and email for each account.
--   organizations         a shared workspace that people can create and join.
--   organization_members  who belongs to which organization, and in what role.
--   organization_invites  invite links for joining an organization.
--   reports               one row per finished report. The report and the
--                         sources it was generated from are JSONB, matching
--                         `Report` and `RetrievedSource[]` in
--                         src/lib/research.types.ts. A report belongs either to
--                         its author's personal workspace or to an organization.
--   research_runs         live status of jobs still in flight.
--   (collaboration)       projects, documents, drafts, review requests and
--                         the rest: see the Collaboration section at the end.

-- ---------------------------------------------------------------------------
-- profiles
--
-- auth.users is private, so the name and email that members of an organization
-- need to see about each other are copied here.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts that existed before this table did.
insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name') from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- organizations, members, invites
--
-- Every person has a personal account. An organization is an extra, shared
-- workspace: anyone can create one, and anyone with an invite can join one,
-- without giving up their personal workspace.
--
-- Roles: owner (runs the organization), hod (head of department: can invite
-- people and manage the organization's research), member.
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  -- Kept for the record only; nulled if that account is later deleted.
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint organizations_name_length check (char_length(btrim(name)) between 2 and 80)
);

create table if not exists public.organization_members (
  org_id     uuid        not null references public.organizations (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  role       text        not null default 'member',
  joined_at  timestamptz not null default now(),

  primary key (org_id, user_id),
  constraint organization_members_role_valid check (role in ('owner', 'hod', 'member'))
);

create index if not exists organization_members_user_id_idx on public.organization_members (user_id);

create table if not exists public.organization_invites (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations (id) on delete cascade,
  code        text        not null unique default replace(gen_random_uuid()::text, '-', ''),
  role        text        not null default 'member',
  created_by  uuid        not null references auth.users (id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  revoked     boolean     not null default false,

  -- An invite can never hand out ownership.
  constraint organization_invites_role_valid check (role in ('hod', 'member'))
);

create index if not exists organization_invites_org_id_idx on public.organization_invites (org_id);

-- Membership checks used by the row level security policies below. They are
-- "security definer" so that a policy on organization_members can ask about
-- membership without triggering itself in a loop.

create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = _org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.org_role(_org uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m
  where m.org_id = _org and m.user_id = (select auth.uid());
$$;

create or replace function public.shares_org_with(_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = _user
  );
$$;

-- Creating an organization and becoming its owner have to happen together, so
-- it is one function rather than two inserts from the browser.
create or replace function public.create_organization(_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _uid uuid := auth.uid();
  _org uuid;
begin
  if _uid is null then raise exception 'You need to be signed in.'; end if;
  insert into public.organizations (name, created_by) values (btrim(_name), _uid) returning id into _org;
  insert into public.organization_members (org_id, user_id, role) values (_org, _uid, 'owner');
  return _org;
end $$;

-- What an invite is for, shown before the person decides to join.
create or replace function public.invite_preview(_code text)
returns table (org_id uuid, org_name text, role text, already_member boolean)
language sql stable security definer set search_path = '' as $$
  select o.id, o.name, i.role,
         exists (select 1 from public.organization_members m where m.org_id = o.id and m.user_id = (select auth.uid()))
  from public.organization_invites i
  join public.organizations o on o.id = i.org_id
  where i.code = _code and not i.revoked and i.expires_at > now();
$$;

create or replace function public.join_organization(_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _uid uuid := auth.uid();
  _invite public.organization_invites;
begin
  if _uid is null then raise exception 'You need a personal account to join an organization.'; end if;
  select * into _invite from public.organization_invites i
  where i.code = _code and not i.revoked and i.expires_at > now();
  if not found then raise exception 'This invite link is no longer valid.'; end if;
  -- Someone who is already a member keeps the role they have.
  insert into public.organization_members (org_id, user_id, role)
  values (_invite.org_id, _uid, _invite.role)
  on conflict (org_id, user_id) do nothing;
  return _invite.org_id;
end $$;

-- An organization must always have someone who can run it.
create or replace function public.keep_one_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     -- When the whole organization is being deleted, its members go with it.
     and exists (select 1 from public.organizations o where o.id = old.org_id)
     and not exists (
       select 1 from public.organization_members m
       where m.org_id = old.org_id and m.role = 'owner' and m.user_id <> old.user_id
     )
  then
    raise exception 'An organization needs at least one owner. Make someone else an owner first.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists keep_one_owner on public.organization_members;
create trigger keep_one_owner
  before update or delete on public.organization_members
  for each row execute function public.keep_one_owner();

revoke all on function public.is_org_member(uuid), public.org_role(uuid), public.shares_org_with(uuid),
  public.create_organization(text), public.invite_preview(text), public.join_organization(text) from public, anon;
grant execute on function public.is_org_member(uuid), public.org_role(uuid), public.shares_org_with(uuid),
  public.create_organization(text), public.invite_preview(text), public.join_organization(text) to authenticated, service_role;

alter table public.profiles             enable row level security;
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;

-- profiles: your own, and those of people you share an organization with.
drop policy if exists "Profiles are visible to their owner and fellow members" on public.profiles;
create policy "Profiles are visible to their owner and fellow members"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or public.shares_org_with(id));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- organizations: visible to members; renamed and deleted by owners. Created
-- only through create_organization().
drop policy if exists "Members can view their organizations" on public.organizations;
create policy "Members can view their organizations"
  on public.organizations for select to authenticated
  using (public.is_org_member(id));

drop policy if exists "Owners can rename their organization" on public.organizations;
create policy "Owners can rename their organization"
  on public.organizations for update to authenticated
  using (public.org_role(id) = 'owner') with check (public.org_role(id) = 'owner');

drop policy if exists "Owners can delete their organization" on public.organizations;
create policy "Owners can delete their organization"
  on public.organizations for delete to authenticated
  using (public.org_role(id) = 'owner');

-- members: visible to fellow members; roles changed by owners; anyone may
-- leave, and owners may remove people. Joining is only through an invite.
drop policy if exists "Members can view fellow members" on public.organization_members;
create policy "Members can view fellow members"
  on public.organization_members for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "Owners can change roles" on public.organization_members;
create policy "Owners can change roles"
  on public.organization_members for update to authenticated
  using (public.org_role(org_id) = 'owner') with check (public.org_role(org_id) = 'owner');

drop policy if exists "Members can leave and owners can remove" on public.organization_members;
create policy "Members can leave and owners can remove"
  on public.organization_members for delete to authenticated
  using ((select auth.uid()) = user_id or public.org_role(org_id) = 'owner');

-- invites: managed by owners and heads of department.
drop policy if exists "Owners and HODs can view invites" on public.organization_invites;
create policy "Owners and HODs can view invites"
  on public.organization_invites for select to authenticated
  using (public.org_role(org_id) in ('owner', 'hod'));

drop policy if exists "Owners and HODs can create invites" on public.organization_invites;
create policy "Owners and HODs can create invites"
  on public.organization_invites for insert to authenticated
  with check (public.org_role(org_id) in ('owner', 'hod') and created_by = (select auth.uid()));

drop policy if exists "Owners and HODs can revoke invites" on public.organization_invites;
create policy "Owners and HODs can revoke invites"
  on public.organization_invites for update to authenticated
  using (public.org_role(org_id) in ('owner', 'hod')) with check (public.org_role(org_id) in ('owner', 'hod'));

revoke all on public.profiles, public.organizations, public.organization_members, public.organization_invites from anon, authenticated;
grant select, update (full_name) on public.profiles to authenticated;
grant select, update (name), delete on public.organizations to authenticated;
grant select, update (role), delete on public.organization_members to authenticated;
grant select, insert (org_id, role, created_by), update (revoked) on public.organization_invites to authenticated;
grant all on public.profiles, public.organizations, public.organization_members, public.organization_invites to service_role;

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null default auth.uid()
                            references auth.users (id) on delete cascade,
  topic         text        not null,
  mode          text        not null default 'MEDIUM',
  user_context  text,
  report        jsonb       not null,
  sources       jsonb       not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),

  constraint reports_topic_length    check (char_length(topic) between 3 and 1000),
  constraint reports_context_length  check (user_context is null or char_length(user_context) <= 4000),
  constraint reports_mode_valid      check (mode in ('LIGHT', 'MEDIUM', 'DEEP')),
  constraint reports_report_object   check (jsonb_typeof(report) = 'object'),
  constraint reports_sources_array   check (jsonb_typeof(sources) = 'array')
);

-- A user's own edits to a report: reworded text, reordered or hidden sections.
-- Kept beside the original rather than over it, so the report as the AI wrote
-- it can always be restored.
alter table public.reports add column if not exists edited jsonb;
alter table public.reports drop constraint if exists reports_edited_object;
alter table public.reports add constraint reports_edited_object
  check (edited is null or jsonb_typeof(edited) = 'object');

-- Which workspace the report lives in: null for the author's personal
-- workspace, otherwise the organization it was researched for.
alter table public.reports add column if not exists org_id uuid references public.organizations (id) on delete cascade;

create index if not exists reports_org_id_created_at_idx
  on public.reports (org_id, created_at desc) where org_id is not null;

comment on table  public.reports              is 'One evidence-linked research report per run, owned by the user who ran it.';
comment on column public.reports.topic        is 'The topic or question the user asked.';
comment on column public.reports.mode         is 'Research depth: LIGHT, MEDIUM or DEEP.';
comment on column public.reports.user_context is 'Optional scope, audience, geography, timeframe or goal.';
comment on column public.reports.report       is 'The generated report JSON (see Report in research.types.ts).';
comment on column public.reports.sources      is 'Every source retrieved for the run, cited or not (RetrievedSource[]).';
comment on column public.reports.org_id       is 'The organization this report belongs to, or null for a personal report.';
comment on column public.reports.edited       is 'The user''s edited version and section order (ReportEdits), or null if untouched.';

-- History page: a user's reports, newest first.
create index if not exists reports_user_id_created_at_idx
  on public.reports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security.
--   Personal reports (org_id is null): only their author.
--   Organization reports: every member can read them; the author, and the
--   organization's owners and heads of department, can edit and delete them.
-- The report the AI wrote is immutable: the only column anyone may update is
-- `edited` (see the column-level grant below).
-- ---------------------------------------------------------------------------

alter table public.reports enable row level security;

drop policy if exists "Users can view their own reports" on public.reports;
drop policy if exists "Reports are visible in their workspace" on public.reports;
create policy "Reports are visible in their workspace"
  on public.reports for select
  to authenticated
  using (
    case when org_id is null then (select auth.uid()) = user_id
         else public.is_org_member(org_id) end
  );

drop policy if exists "Users can create their own reports" on public.reports;
create policy "Users can create their own reports"
  on public.reports for insert
  to authenticated
  with check ((select auth.uid()) = user_id and (org_id is null or public.is_org_member(org_id)));

drop policy if exists "Users can edit their own reports" on public.reports;
drop policy if exists "Authors and managers can edit reports" on public.reports;
create policy "Authors and managers can edit reports"
  on public.reports for update
  to authenticated
  using ((select auth.uid()) = user_id or (org_id is not null and public.org_role(org_id) in ('owner', 'hod')))
  with check ((select auth.uid()) = user_id or (org_id is not null and public.org_role(org_id) in ('owner', 'hod')));

drop policy if exists "Users can delete their own reports" on public.reports;
drop policy if exists "Authors and managers can delete reports" on public.reports;
create policy "Authors and managers can delete reports"
  on public.reports for delete
  to authenticated
  using ((select auth.uid()) = user_id or (org_id is not null and public.org_role(org_id) in ('owner', 'hod')));

-- ---------------------------------------------------------------------------
-- Data API grants: signed-in users only; anonymous visitors get nothing.
-- ---------------------------------------------------------------------------

revoke all on public.reports from anon, authenticated;
grant select, insert, delete on public.reports to authenticated;
grant update (edited) on public.reports to authenticated;
grant all on public.reports to service_role;

-- ---------------------------------------------------------------------------
-- research_runs
--
-- Live status of a research job, so the app can show progress and pick a run
-- back up after a reload or in another tab. This is a short-lived queue, not
-- history: a row is deleted once its outcome has been seen. The finished
-- report itself lives in public.reports.
-- ---------------------------------------------------------------------------

create table if not exists public.research_runs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  status      text        not null default 'searching',
  input       jsonb       not null,
  sources     jsonb       not null default '[]'::jsonb,
  error       text,
  report_id   uuid        references public.reports (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint research_runs_input_object  check (jsonb_typeof(input) = 'object'),
  constraint research_runs_sources_array check (jsonb_typeof(sources) = 'array')
);

-- Saved progress and automatic retries. Added with "if not exists" so this file
-- upgrades a database created by an earlier version of it.
alter table public.research_runs add column if not exists retrieved  jsonb       not null default '[]'::jsonb;
alter table public.research_runs add column if not exists attempt    integer     not null default 0;
alter table public.research_runs add column if not exists retry_at   timestamptz;

-- updated_at tells a live run from one whose server died. A plain "add column
-- ... default now()" would stamp every existing row as changed this instant and
-- make an old stuck run look alive, so rows that predate the column take their
-- created_at instead.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'research_runs' and column_name = 'updated_at'
  ) then
    alter table public.research_runs add column updated_at timestamptz not null default now();
    update public.research_runs set updated_at = created_at;
  end if;
end $$;

alter table public.research_runs drop constraint if exists research_runs_status_valid;
alter table public.research_runs add constraint research_runs_status_valid
  check (status in ('searching', 'writing', 'waiting', 'paused', 'done', 'error'));

comment on table  public.research_runs           is 'Live status of in-flight research jobs. Rows are removed once the outcome is seen.';
comment on column public.research_runs.status     is 'searching → writing → done. waiting: the AI provider failed and a retry is scheduled. paused: retries ran out; the user can retry by hand. error: failed for good.';
comment on column public.research_runs.retrieved  is 'The full sources gathered for the run, kept so a retry never has to search again.';
comment on column public.research_runs.attempt    is 'How many times writing the report has failed so far.';
comment on column public.research_runs.retry_at   is 'When the next automatic retry is due, while status is waiting.';
comment on column public.research_runs.updated_at is 'When the run last changed state; used to spot runs whose server died.';
comment on column public.research_runs.input     is 'What the user submitted (topic, context, mode, sources), so a failed run can be retried.';
comment on column public.research_runs.sources   is 'Id, title and domain of each source found, shown while the report is written.';
comment on column public.research_runs.report_id is 'The saved report, once status is done.';

-- At most one job in flight per user. A run waiting to retry still counts.
drop index if exists public.research_runs_one_active_per_user_idx;
create unique index research_runs_one_active_per_user_idx
  on public.research_runs (user_id)
  where status in ('searching', 'writing', 'waiting');

create index if not exists research_runs_user_id_created_at_idx
  on public.research_runs (user_id, created_at desc);

-- Users can watch and dismiss their own runs. Only the server (service role)
-- creates runs and moves them between states, so a status can be trusted.

alter table public.research_runs enable row level security;

drop policy if exists "Users can view their own runs" on public.research_runs;
create policy "Users can view their own runs"
  on public.research_runs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can dismiss their own runs" on public.research_runs;
create policy "Users can dismiss their own runs"
  on public.research_runs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.research_runs from anon, authenticated;
grant select, delete on public.research_runs to authenticated;
grant all on public.research_runs to service_role;

-- ===========================================================================
-- Collaboration: research handled the way GitHub handles code.
--
--   projects            like repositories: group documents, drafts and reviews.
--   documents           a versioned document; current_version 0 = never filed.
--   document_versions   every filed version of every document.
--   document_owners     section owners, asked to look at changes to their part.
--   drafts              like branches: a working copy of a document.
--   draft_revisions     like commits: each saved change to a draft.
--   review_requests     like pull requests: a draft proposed for filing.
--   review_approvals    the two approval stages (Research Manager, then HOD).
--   review_comments     comments and suggested wording on a section.
--   comment_reactions   emoji reactions to comments.
--   review_links        links from a request to other requests or to reports.
--   review_attachments  files attached to a request (stored in Storage).
--   tasks               follow-up tasks, created when a request is filed.
--   milestones          deadlines that requests and tasks count towards.
--   org_events          the permanent record: activity feed and audit log.
--   notifications       each person's inbox.
--
-- Changes that touch several tables at once (submitting, approving, filing)
-- go through the functions below, which check the caller's role, so they can
-- never half-happen or be done by someone without the right.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Roles: owner, hod (Head of Department), manager (Research Manager),
-- assistant (Research Assistant), intern (Research Intern).
-- ---------------------------------------------------------------------------

alter table public.organization_members drop constraint if exists organization_members_role_valid;
update public.organization_members set role = 'assistant' where role = 'member';
alter table public.organization_members add constraint organization_members_role_valid
  check (role in ('owner', 'hod', 'manager', 'assistant', 'intern'));
alter table public.organization_members alter column role set default 'assistant';

alter table public.organization_invites drop constraint if exists organization_invites_role_valid;
update public.organization_invites set role = 'assistant' where role = 'member';
alter table public.organization_invites add constraint organization_invites_role_valid
  check (role in ('hod', 'manager', 'assistant', 'intern'));
alter table public.organization_invites alter column role set default 'assistant';

create or replace function public.is_org_manager(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.org_role(_org) in ('owner', 'hod', 'manager'), false);
$$;

create or replace function public.is_org_hod(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.org_role(_org) in ('owner', 'hod'), false);
$$;

-- Roles are changed through this function: owners can set any role, heads of
-- department can set any role except owner and can't change an owner.
create or replace function public.set_member_role(_org uuid, _user uuid, _role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _mine text := public.org_role(_org);
  _theirs text;
begin
  select role into _theirs from public.organization_members where org_id = _org and user_id = _user;
  if _theirs is null then raise exception 'That person is not a member of this organization.'; end if;
  if _role not in ('owner', 'hod', 'manager', 'assistant', 'intern') then raise exception 'Unknown role.'; end if;
  if _mine = 'owner' then
    null;
  elsif _mine = 'hod' then
    if _role = 'owner' or _theirs = 'owner' then raise exception 'Only an owner can change who owns the organization.'; end if;
  else
    raise exception 'Only owners and heads of department can change roles.';
  end if;
  update public.organization_members set role = _role where org_id = _org and user_id = _user;
  perform public.log_event(_org, null, 'member.role_changed', 'member', _user,
    (select coalesce(full_name, email) from public.profiles where id = _user), jsonb_build_object('from', _theirs, 'to', _role));
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id           uuid        primary key default gen_random_uuid(),
  org_id       uuid        not null references public.organizations (id) on delete cascade,
  name         text        not null,
  description  text        not null default '',
  topics       text[]      not null default '{}',
  visibility   text        not null default 'department',
  lead_id      uuid        references auth.users (id) on delete set null,
  created_by   uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint projects_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint projects_visibility_valid check (visibility in ('department', 'restricted'))
);
create index if not exists projects_org_id_idx on public.projects (org_id);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  primary key (project_id, user_id)
);

create table if not exists public.documents (
  id               uuid        primary key default gen_random_uuid(),
  org_id           uuid        not null references public.organizations (id) on delete cascade,
  project_id       uuid        not null references public.projects (id) on delete cascade,
  title            text        not null,
  kind             text        not null default 'Report',
  current_version  integer     not null default 0,
  created_by       uuid        references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  filed_at         timestamptz,

  constraint documents_kind_valid check (kind in ('Report', 'Literature review', 'Procedure', 'Data note', 'Proposal'))
);
create index if not exists documents_project_id_idx on public.documents (project_id);

create table if not exists public.document_versions (
  document_id  uuid        not null references public.documents (id) on delete cascade,
  version      integer     not null,
  sections     jsonb       not null,
  filed_by     uuid        references auth.users (id) on delete set null,
  filed_at     timestamptz not null default now(),
  review_id    uuid,
  primary key (document_id, version),
  constraint document_versions_sections_array check (jsonb_typeof(sections) = 'array')
);

create table if not exists public.document_owners (
  document_id    uuid not null references public.documents (id) on delete cascade,
  section_title  text not null,
  user_id        uuid not null references auth.users (id) on delete cascade,
  primary key (document_id, section_title, user_id)
);

create table if not exists public.drafts (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations (id) on delete cascade,
  project_id    uuid        not null references public.projects (id) on delete cascade,
  document_id   uuid        not null references public.documents (id) on delete cascade,
  title         text        not null,
  author_id     uuid        not null references auth.users (id) on delete cascade,
  base_version  integer     not null default 0,
  sections      jsonb       not null default '[]'::jsonb,
  status        text        not null default 'open',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint drafts_status_valid check (status in ('open', 'submitted', 'filed', 'closed')),
  constraint drafts_sections_array check (jsonb_typeof(sections) = 'array')
);
create index if not exists drafts_project_id_idx on public.drafts (project_id);

create table if not exists public.draft_revisions (
  id          uuid        primary key default gen_random_uuid(),
  draft_id    uuid        not null references public.drafts (id) on delete cascade,
  author_id   uuid        references auth.users (id) on delete set null,
  message     text        not null,
  sections    jsonb       not null,
  added       integer     not null default 0,
  removed     integer     not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists draft_revisions_draft_id_idx on public.draft_revisions (draft_id, created_at desc);

create table if not exists public.milestones (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations (id) on delete cascade,
  project_id  uuid        references public.projects (id) on delete cascade,
  title       text        not null,
  due_on      date,
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists milestones_org_id_idx on public.milestones (org_id);

create table if not exists public.review_requests (
  id              uuid        primary key default gen_random_uuid(),
  org_id          uuid        not null references public.organizations (id) on delete cascade,
  number          integer     not null,
  project_id      uuid        not null references public.projects (id) on delete cascade,
  document_id     uuid        not null references public.documents (id) on delete cascade,
  draft_id        uuid        not null references public.drafts (id) on delete cascade,
  title           text        not null,
  kind            text        not null default 'New research',
  summary         text        not null default '',
  next_steps      jsonb       not null default '[]'::jsonb,
  urgency         text        not null default 'Normal',
  labels          text[]      not null default '{}',
  milestone_id    uuid        references public.milestones (id) on delete set null,
  status          text        not null default 'in_review',
  needs_manager   boolean     not null default true,
  touched         text[]      not null default '{}',
  author_id       uuid        not null references auth.users (id) on delete cascade,
  filed_version   integer,
  closed_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (org_id, number),
  constraint review_requests_status_valid check (status in ('in_review', 'changes_requested', 'filed', 'closed')),
  constraint review_requests_kind_valid check (kind in ('New research', 'Update', 'Procedure change', 'Idea')),
  constraint review_requests_urgency_valid check (urgency in ('Low', 'Normal', 'High', 'Urgent')),
  constraint review_requests_next_steps_array check (jsonb_typeof(next_steps) = 'array')
);
create index if not exists review_requests_org_id_idx on public.review_requests (org_id, created_at desc);

create table if not exists public.review_approvals (
  review_id         uuid        not null references public.review_requests (id) on delete cascade,
  stage             text        not null,
  state             text        not null,
  decided_by        uuid        references auth.users (id) on delete set null,
  decided_at        timestamptz,
  note              text,
  pending_since     timestamptz,
  last_reminded_at  timestamptz,
  primary key (review_id, stage),
  constraint review_approvals_stage_valid check (stage in ('manager', 'hod')),
  constraint review_approvals_state_valid check (state in ('waiting', 'pending', 'approved', 'changes_requested'))
);

create table if not exists public.review_comments (
  id             uuid        primary key default gen_random_uuid(),
  review_id      uuid        not null references public.review_requests (id) on delete cascade,
  section_title  text        not null,
  author_id      uuid        references auth.users (id) on delete set null,
  body           text        not null,
  suggestion     text,
  resolved       boolean     not null default false,
  created_at     timestamptz not null default now(),
  constraint review_comments_body_length check (char_length(body) between 1 and 5000)
);
create index if not exists review_comments_review_id_idx on public.review_comments (review_id, created_at);

create table if not exists public.comment_reactions (
  comment_id  uuid not null references public.review_comments (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  emoji       text not null,
  primary key (comment_id, user_id, emoji),
  constraint comment_reactions_emoji_valid check (emoji in ('👍', '❤️', '🎉', '👀', '✅'))
);

create table if not exists public.review_links (
  review_id    uuid        not null references public.review_requests (id) on delete cascade,
  target_kind  text        not null,
  target_id    uuid        not null,
  created_by   uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (review_id, target_kind, target_id),
  constraint review_links_kind_valid check (target_kind in ('review', 'report'))
);

create table if not exists public.review_attachments (
  id           uuid        primary key default gen_random_uuid(),
  review_id    uuid        not null references public.review_requests (id) on delete cascade,
  name         text        not null,
  path         text        not null,
  size         bigint      not null default 0,
  uploaded_by  uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.tasks (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations (id) on delete cascade,
  project_id    uuid        references public.projects (id) on delete cascade,
  review_id     uuid        references public.review_requests (id) on delete set null,
  milestone_id  uuid        references public.milestones (id) on delete set null,
  title         text        not null,
  assignee_id   uuid        references auth.users (id) on delete set null,
  done          boolean     not null default false,
  done_at       timestamptz,
  created_by    uuid        references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists tasks_org_id_idx on public.tasks (org_id);

create table if not exists public.org_events (
  id            bigint      generated always as identity primary key,
  org_id        uuid        not null references public.organizations (id) on delete cascade,
  project_id    uuid        references public.projects (id) on delete set null,
  actor_id      uuid        references auth.users (id) on delete set null,
  action        text        not null,
  target_kind   text,
  target_id     uuid,
  target_label  text,
  detail        jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists org_events_org_id_idx on public.org_events (org_id, created_at desc);

create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations (id) on delete cascade,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  kind        text        not null,
  title       text        not null,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint notifications_kind_valid check (kind in ('review_requested', 'mentioned', 'assigned', 'status_changed', 'reminder', 'comment'))
);
create index if not exists notifications_user_id_idx on public.notifications (user_id, created_at desc);

-- The library: each filed document with the text of its current version.
create or replace view public.library_documents with (security_invoker = true) as
select d.id, d.org_id, d.project_id, d.title, d.kind, d.current_version, d.filed_at, d.created_by,
       v.sections, v.filed_by, v.review_id,
       (select string_agg(coalesce(s ->> 'title', '') || ' ' || coalesce(s ->> 'body', ''), ' ')
          from jsonb_array_elements(v.sections) s) as body_text
from public.documents d
join public.document_versions v on v.document_id = d.id and v.version = d.current_version
where d.current_version > 0;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable from the browser)
-- ---------------------------------------------------------------------------

create or replace function public.can_see_project(_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id = _project
      and public.is_org_member(p.org_id)
      and (
        p.visibility = 'department'
        or public.is_org_manager(p.org_id)
        or p.lead_id = (select auth.uid())
        or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = (select auth.uid()))
      )
  );
$$;

create or replace function public.log_event(_org uuid, _project uuid, _action text, _kind text, _id uuid, _label text, _detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.org_events (org_id, project_id, actor_id, action, target_kind, target_id, target_label, detail)
  values (_org, _project, auth.uid(), _action, _kind, _id, _label, coalesce(_detail, '{}'::jsonb));
$$;

-- One notification, never to the person who caused it.
create or replace function public.notify(_org uuid, _user uuid, _kind text, _title text, _link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (org_id, user_id, kind, title, link)
  select _org, _user, _kind, _title, _link
  where _user is not null and _user is distinct from auth.uid()
    and exists (select 1 from public.organization_members m where m.org_id = _org and m.user_id = _user);
$$;

-- Everyone in the given roles (owners always count as heads of department).
create or replace function public.notify_roles(_org uuid, _roles text[], _kind text, _title text, _link text, _except uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (org_id, user_id, kind, title, link)
  select _org, m.user_id, _kind, _title, _link
  from public.organization_members m
  where m.org_id = _org and m.role = any (_roles)
    and m.user_id is distinct from auth.uid() and m.user_id is distinct from _except;
$$;

-- The pending stage's reviewers: Research Managers for stage 1, heads of department and owners for stage 2.
create or replace function public.notify_reviewers(_review uuid, _kind text, _title text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _r public.review_requests;
  _stage text;
begin
  select * into _r from public.review_requests where id = _review;
  select stage into _stage from public.review_approvals where review_id = _review and state = 'pending';
  if _stage is null then return; end if;
  perform public.notify_roles(_r.org_id,
    case when _stage = 'manager' then array['manager'] else array['hod', 'owner'] end,
    _kind, _title, '/org/reviews/' || _r.number, _r.author_id);
end $$;

-- Put the approval stages back to the start: stage 1 if the request needs a
-- Research Manager, otherwise straight to the head of department.
create or replace function public.reset_approvals(_review uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _r public.review_requests;
begin
  select * into _r from public.review_requests where id = _review;
  delete from public.review_approvals where review_id = _review;
  if _r.needs_manager then
    insert into public.review_approvals (review_id, stage, state, pending_since) values (_review, 'manager', 'pending', now());
    insert into public.review_approvals (review_id, stage, state) values (_review, 'hod', 'waiting');
  else
    insert into public.review_approvals (review_id, stage, state, pending_since) values (_review, 'hod', 'pending', now());
  end if;
end $$;

-- Titles of the sections that differ between a draft and the version it started from.
create or replace function public.changed_sections(_draft uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  with d as (select * from public.drafts where id = _draft),
  base as (
    select coalesce(v.sections, '[]'::jsonb) as sections
    from d left join public.document_versions v on v.document_id = d.document_id and v.version = d.base_version
  ),
  now_s as (select s ->> 'title' as title, coalesce(s ->> 'body', '') as body from d, jsonb_array_elements(d.sections) s),
  old_s as (select s ->> 'title' as title, coalesce(s ->> 'body', '') as body from base, jsonb_array_elements(base.sections) s)
  select coalesce(array_agg(distinct title), '{}') from (
    select title from now_s except select title from old_s
    union select title from old_s except select title from now_s
    union select n.title from now_s n join old_s o on o.title = n.title where o.body <> n.body
  ) changed;
$$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

create or replace function public.create_project(_org uuid, _name text, _description text, _topics text[], _visibility text, _lead uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _id uuid;
begin
  -- Anyone in the organization can start a project.
  if not public.is_org_member(_org) then raise exception 'Only members of the organization can create projects in it.'; end if;
  if _lead is not null and not exists (select 1 from public.organization_members m where m.org_id = _org and m.user_id = _lead) then
    raise exception 'The project lead must be a member of the organization.';
  end if;
  insert into public.projects (org_id, name, description, topics, visibility, lead_id, created_by)
  values (_org, btrim(_name), coalesce(_description, ''), coalesce(_topics, '{}'), coalesce(_visibility, 'department'),
          coalesce(_lead, auth.uid()), auth.uid())
  returning id into _id;
  -- Whoever starts a project keeps access to it, even when someone else leads it.
  if coalesce(_lead, auth.uid()) <> auth.uid() then
    insert into public.project_members (project_id, user_id) values (_id, auth.uid()) on conflict do nothing;
  end if;
  perform public.log_event(_org, _id, 'project.created', 'project', _id, btrim(_name));
  return _id;
end $$;

create or replace function public.set_project_members(_project uuid, _members uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  _p public.projects;
begin
  select * into _p from public.projects where id = _project;
  if _p.id is null or not (public.is_org_manager(_p.org_id) or _p.lead_id = auth.uid()) then
    raise exception 'Only the project lead, Research Managers and heads of department can change project members.';
  end if;
  delete from public.project_members where project_id = _project;
  insert into public.project_members (project_id, user_id)
  select _project, m.user_id from public.organization_members m where m.org_id = _p.org_id and m.user_id = any (_members);
  perform public.log_event(_p.org_id, _project, 'project.members_changed', 'project', _project, _p.name);
end $$;

-- Start working on a document: an existing one (from its current version) or a new one.
create or replace function public.start_draft(_project uuid, _document uuid, _title text, _kind text, _sections jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _p public.projects;
  _d public.documents;
  _base jsonb;
  _id uuid;
begin
  select * into _p from public.projects where id = _project;
  if _p.id is null or not public.can_see_project(_project) then raise exception 'You don''t have access to that project.'; end if;
  if _document is null then
    insert into public.documents (org_id, project_id, title, kind, created_by)
    values (_p.org_id, _project, btrim(_title), coalesce(_kind, 'Report'), auth.uid())
    returning * into _d;
    _base := coalesce(_sections, '[]'::jsonb);
  else
    select * into _d from public.documents where id = _document and project_id = _project;
    if _d.id is null then raise exception 'That document isn''t in this project.'; end if;
    select sections into _base from public.document_versions where document_id = _d.id and version = _d.current_version;
    _base := coalesce(_sections, _base, '[]'::jsonb);
  end if;
  insert into public.drafts (org_id, project_id, document_id, title, author_id, base_version, sections)
  values (_p.org_id, _project, _d.id, coalesce(nullif(btrim(_title), ''), _d.title), auth.uid(), _d.current_version, _base)
  returning id into _id;
  insert into public.draft_revisions (draft_id, author_id, message, sections, added)
  values (_id, auth.uid(), case when _document is null then 'Start a new document' else 'Start from version ' || _d.current_version end, _base,
          jsonb_array_length(_base));
  perform public.log_event(_p.org_id, _project, 'draft.started', 'draft', _id, _d.title);
  update public.projects set updated_at = now() where id = _project;
  return _id;
end $$;

-- Save a change to a draft, with a message. A change to a request already in
-- review sends it back to the first approval stage: earlier approvals were
-- given to different content.
create or replace function public.save_revision(_draft uuid, _sections jsonb, _message text, _added integer, _removed integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _d public.drafts;
  _r public.review_requests;
begin
  select * into _d from public.drafts where id = _draft;
  if _d.id is null or _d.author_id <> auth.uid() then raise exception 'Only the author of a draft can change it.'; end if;
  if _d.status in ('filed', 'closed') then raise exception 'This draft is finished and can no longer be changed.'; end if;
  if jsonb_typeof(_sections) <> 'array' then raise exception 'Sections must be a list.'; end if;
  update public.drafts set sections = _sections, updated_at = now() where id = _draft;
  insert into public.draft_revisions (draft_id, author_id, message, sections, added, removed)
  values (_draft, auth.uid(), coalesce(nullif(btrim(_message), ''), 'Update'), _sections, coalesce(_added, 0), coalesce(_removed, 0));
  perform public.log_event(_d.org_id, _d.project_id, 'revision.added', 'draft', _draft, _d.title, jsonb_build_object('message', _message));

  select * into _r from public.review_requests where draft_id = _draft and status = 'in_review';
  if _r.id is not null then
    update public.review_requests set touched = public.changed_sections(_draft), updated_at = now() where id = _r.id;
    if exists (select 1 from public.review_approvals where review_id = _r.id and state = 'approved') then
      perform public.reset_approvals(_r.id);
      perform public.log_event(_r.org_id, _r.project_id, 'review.approvals_dismissed', 'review', _r.id, '#' || _r.number || ' ' || _r.title);
      perform public.notify_reviewers(_r.id, 'review_requested', '#' || _r.number || ' changed after approval and needs your review again');
    end if;
  elsif exists (select 1 from public.review_requests where draft_id = _draft and status = 'changes_requested') then
    update public.review_requests set touched = public.changed_sections(_draft), updated_at = now() where draft_id = _draft and status = 'changes_requested';
  end if;
end $$;

create or replace function public.submit_review(
  _draft uuid, _title text, _kind text, _summary text, _next_steps jsonb, _urgency text,
  _labels text[], _milestone uuid, _links jsonb
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  _d public.drafts;
  _number integer;
  _role text;
  _needs_manager boolean;
  _id uuid;
  _touched text[];
  _owner uuid;
  _link jsonb;
begin
  select * into _d from public.drafts where id = _draft;
  if _d.id is null or _d.author_id <> auth.uid() then raise exception 'Only the author of a draft can submit it.'; end if;
  if _d.status <> 'open' then raise exception 'This draft has already been submitted.'; end if;
  if char_length(btrim(coalesce(_title, ''))) < 3 then raise exception 'Give the request a title.'; end if;

  -- Number requests 1, 2, 3… per organization, one at a time.
  perform 1 from public.organizations where id = _d.org_id for update;
  select coalesce(max(number), 0) + 1 into _number from public.review_requests where org_id = _d.org_id;

  _role := public.org_role(_d.org_id);
  _needs_manager := _role in ('intern', 'assistant')
    and exists (select 1 from public.organization_members where org_id = _d.org_id and role = 'manager');
  _touched := public.changed_sections(_draft);

  insert into public.review_requests (org_id, number, project_id, document_id, draft_id, title, kind, summary, next_steps,
                                      urgency, labels, milestone_id, needs_manager, touched, author_id)
  values (_d.org_id, _number, _d.project_id, _d.document_id, _draft, btrim(_title), coalesce(_kind, 'New research'),
          coalesce(_summary, ''), coalesce(_next_steps, '[]'::jsonb), coalesce(_urgency, 'Normal'), coalesce(_labels, '{}'),
          _milestone, _needs_manager, _touched, auth.uid())
  returning id into _id;

  update public.drafts set status = 'submitted', updated_at = now() where id = _draft;
  perform public.reset_approvals(_id);

  for _link in select * from jsonb_array_elements(coalesce(_links, '[]'::jsonb)) loop
    insert into public.review_links (review_id, target_kind, target_id, created_by)
    values (_id, _link ->> 'kind', (_link ->> 'id')::uuid, auth.uid()) on conflict do nothing;
  end loop;

  perform public.log_event(_d.org_id, _d.project_id, 'review.opened', 'review', _id, '#' || _number || ' ' || btrim(_title));
  perform public.notify_reviewers(_id, 'review_requested', '#' || _number || ' ' || btrim(_title) || ' needs your review');
  -- Section owners hear about changes to their part, whatever the stage.
  for _owner in
    select distinct o.user_id from public.document_owners o where o.document_id = _d.document_id and o.section_title = any (_touched)
  loop
    perform public.notify(_d.org_id, _owner, 'review_requested', '#' || _number || ' changes a section you own', '/org/reviews/' || _number);
  end loop;
  return _number;
end $$;

create or replace function public.review_decision(_review uuid, _decision text, _note text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  _r public.review_requests;
  _d public.drafts;
  _a public.review_approvals;
  _role text;
  _version integer;
  _step jsonb;
  _label text;
  _link text;
begin
  select * into _r from public.review_requests where id = _review for update;
  if _r.id is null or not public.can_see_project(_r.project_id) then raise exception 'Review request not found.'; end if;
  if _r.status <> 'in_review' then raise exception 'This request isn''t waiting for a review.'; end if;
  select * into _a from public.review_approvals where review_id = _review and state = 'pending';
  if _a.stage is null then raise exception 'No approval stage is waiting.'; end if;

  _role := public.org_role(_r.org_id);
  if _a.stage = 'manager' and _role not in ('manager', 'hod', 'owner') then
    raise exception 'Only a Research Manager or head of department can review at this stage.';
  end if;
  if _a.stage = 'hod' and _role not in ('hod', 'owner') then
    raise exception 'Only a head of department can give the final approval.';
  end if;
  -- People don't approve their own work, unless nobody else could.
  if _r.author_id = auth.uid() and exists (
    select 1 from public.organization_members m
    where m.org_id = _r.org_id and m.user_id <> auth.uid()
      and m.role = any (case when _a.stage = 'manager' then array['manager', 'hod', 'owner'] else array['hod', 'owner'] end)
  ) then
    raise exception 'Someone else needs to review your own request.';
  end if;

  _label := '#' || _r.number || ' ' || _r.title;
  _link := '/org/reviews/' || _r.number;

  if _decision = 'request_changes' then
    update public.review_approvals set state = 'changes_requested', decided_by = auth.uid(), decided_at = now(), note = _note
      where review_id = _review and stage = _a.stage;
    update public.review_requests set status = 'changes_requested', updated_at = now() where id = _review;
    perform public.log_event(_r.org_id, _r.project_id, 'review.changes_requested', 'review', _review, _label, jsonb_build_object('stage', _a.stage, 'note', _note));
    perform public.notify(_r.org_id, _r.author_id, 'status_changed', 'Changes requested on ' || _label, _link);
    return 'changes_requested';
  end if;

  if _decision = 'reject' then
    update public.review_requests set status = 'closed', closed_reason = _note, updated_at = now() where id = _review;
    update public.drafts set status = 'closed', updated_at = now() where id = _r.draft_id;
    perform public.log_event(_r.org_id, _r.project_id, 'review.rejected', 'review', _review, _label, jsonb_build_object('stage', _a.stage, 'note', _note));
    perform public.notify(_r.org_id, _r.author_id, 'status_changed', _label || ' was rejected', _link);
    return 'closed';
  end if;

  if _decision <> 'approve' then raise exception 'Unknown decision.'; end if;

  update public.review_approvals set state = 'approved', decided_by = auth.uid(), decided_at = now(), note = _note
    where review_id = _review and stage = _a.stage;
  perform public.log_event(_r.org_id, _r.project_id, 'review.approved', 'review', _review, _label, jsonb_build_object('stage', _a.stage));

  if _a.stage = 'manager' then
    update public.review_approvals set state = 'pending', pending_since = now() where review_id = _review and stage = 'hod';
    update public.review_requests set updated_at = now() where id = _review;
    perform public.notify_reviewers(_review, 'review_requested', _label || ' is ready for final approval');
    perform public.notify(_r.org_id, _r.author_id, 'status_changed', 'Your request ' || _label || ' passed the Research Manager', _link);
    return 'in_review';
  end if;

  -- Final approval files it: the draft becomes the document's next version.
  select * into _d from public.drafts where id = _r.draft_id;
  select current_version + 1 into _version from public.documents where id = _r.document_id for update;
  insert into public.document_versions (document_id, version, sections, filed_by, review_id)
  values (_r.document_id, _version, _d.sections, auth.uid(), _review);
  update public.documents
    set current_version = _version, filed_at = now(), updated_at = now(),
        title = case when _version = 1 then _d.title else title end
    where id = _r.document_id;
  update public.drafts set status = 'filed', updated_at = now() where id = _r.draft_id;
  update public.review_requests set status = 'filed', filed_version = _version, updated_at = now() where id = _review;
  update public.projects set updated_at = now() where id = _r.project_id;

  -- The request's next steps become tasks for the people named, or the author.
  for _step in select * from jsonb_array_elements(_r.next_steps) loop
    if nullif(btrim(_step ->> 'text'), '') is not null then
      insert into public.tasks (org_id, project_id, review_id, milestone_id, title, assignee_id, created_by)
      values (_r.org_id, _r.project_id, _review, _r.milestone_id, btrim(_step ->> 'text'),
              coalesce(nullif(_step ->> 'assignee', '')::uuid, _r.author_id), auth.uid());
      perform public.notify(_r.org_id, coalesce(nullif(_step ->> 'assignee', '')::uuid, _r.author_id), 'assigned',
                            'New task from ' || _label || ': ' || btrim(_step ->> 'text'), '/org');
    end if;
  end loop;

  perform public.log_event(_r.org_id, _r.project_id, 'document.filed', 'document', _r.document_id, _d.title, jsonb_build_object('version', _version, 'review', _r.number));
  perform public.notify(_r.org_id, _r.author_id, 'status_changed', _label || ' was approved and filed', _link);
  return 'filed';
end $$;

create or replace function public.resubmit_review(_review uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _r public.review_requests;
begin
  select * into _r from public.review_requests where id = _review;
  if _r.id is null or _r.author_id <> auth.uid() then raise exception 'Only the author can resubmit.'; end if;
  if _r.status <> 'changes_requested' then raise exception 'This request isn''t waiting for changes.'; end if;
  update public.review_requests set status = 'in_review', touched = public.changed_sections(_r.draft_id), updated_at = now() where id = _review;
  perform public.reset_approvals(_review);
  perform public.log_event(_r.org_id, _r.project_id, 'review.resubmitted', 'review', _review, '#' || _r.number || ' ' || _r.title);
  perform public.notify_reviewers(_review, 'review_requested', '#' || _r.number || ' ' || _r.title || ' was revised and needs your review');
end $$;

create or replace function public.add_comment(_review uuid, _section text, _body text, _suggestion text, _mentions uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _r public.review_requests;
  _id uuid;
  _who uuid;
  _me text;
begin
  select * into _r from public.review_requests where id = _review;
  if _r.id is null or not public.can_see_project(_r.project_id) then raise exception 'Review request not found.'; end if;
  insert into public.review_comments (review_id, section_title, author_id, body, suggestion)
  values (_review, _section, auth.uid(), btrim(_body), nullif(btrim(coalesce(_suggestion, '')), ''))
  returning id into _id;
  select coalesce(full_name, email) into _me from public.profiles where id = auth.uid();
  perform public.log_event(_r.org_id, _r.project_id, 'comment.added', 'review', _review, '#' || _r.number || ' ' || _r.title, jsonb_build_object('section', _section));
  perform public.notify(_r.org_id, _r.author_id, 'comment', coalesce(_me, 'Someone') || ' commented on "' || _section || '" in #' || _r.number, '/org/reviews/' || _r.number);
  foreach _who in array coalesce(_mentions, '{}') loop
    if _who is distinct from _r.author_id then
      perform public.notify(_r.org_id, _who, 'mentioned', coalesce(_me, 'Someone') || ' mentioned you on #' || _r.number, '/org/reviews/' || _r.number);
    end if;
  end loop;
  return _id;
end $$;

-- Apply a reviewer's suggested wording to the draft, as a revision.
create or replace function public.accept_suggestion(_comment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _c public.review_comments;
  _r public.review_requests;
  _sections jsonb;
begin
  select * into _c from public.review_comments where id = _comment;
  select * into _r from public.review_requests where id = _c.review_id;
  if _r.id is null or _r.author_id <> auth.uid() then raise exception 'Only the author can accept a suggestion.'; end if;
  if _c.suggestion is null then raise exception 'That comment has no suggested wording.'; end if;
  select jsonb_agg(case when s ->> 'title' = _c.section_title then jsonb_set(s, '{body}', to_jsonb(_c.suggestion)) else s end order by n)
    into _sections
    from public.drafts d, jsonb_array_elements(d.sections) with ordinality as t(s, n) where d.id = _r.draft_id;
  perform public.save_revision(_r.draft_id, coalesce(_sections, '[]'::jsonb), 'Accept suggestion on ' || _c.section_title, 1, 1);
  update public.review_comments set resolved = true where id = _comment;
end $$;

create or replace function public.set_section_owners(_document uuid, _section text, _users uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  _d public.documents;
  _p public.projects;
begin
  select * into _d from public.documents where id = _document;
  select * into _p from public.projects where id = _d.project_id;
  if _d.id is null or not (public.is_org_manager(_d.org_id) or _p.lead_id = auth.uid()) then
    raise exception 'Only the project lead, Research Managers and heads of department can set section owners.';
  end if;
  delete from public.document_owners where document_id = _document and section_title = _section;
  insert into public.document_owners (document_id, section_title, user_id)
  select _document, _section, m.user_id from public.organization_members m where m.org_id = _d.org_id and m.user_id = any (_users);
  perform public.log_event(_d.org_id, _d.project_id, 'document.owners_changed', 'document', _document, _d.title, jsonb_build_object('section', _section));
end $$;

create or replace function public.create_milestone(_org uuid, _project uuid, _title text, _due date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _id uuid;
begin
  if not public.is_org_manager(_org) then raise exception 'Only Research Managers and heads of department can create milestones.'; end if;
  insert into public.milestones (org_id, project_id, title, due_on, created_by) values (_org, _project, btrim(_title), _due, auth.uid()) returning id into _id;
  perform public.log_event(_org, _project, 'milestone.created', 'milestone', _id, btrim(_title));
  return _id;
end $$;

create or replace function public.set_task_done(_task uuid, _done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _t public.tasks;
begin
  select * into _t from public.tasks where id = _task;
  if _t.id is null or not (_t.assignee_id = auth.uid() or public.is_org_manager(_t.org_id)) then
    raise exception 'Only the person assigned, or a manager, can update this task.';
  end if;
  update public.tasks set done = _done, done_at = case when _done then now() end where id = _task;
  perform public.log_event(_t.org_id, _t.project_id, case when _done then 'task.completed' else 'task.reopened' end, 'task', _task, _t.title);
end $$;

-- Called by the server's background worker: remind reviewers about stages
-- that have waited a day, at most once a day per request.
create or replace function public.send_review_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  _a record;
  _n integer := 0;
begin
  for _a in
    select ap.review_id, ap.stage, r.org_id, r.project_id, r.number, r.title, r.author_id, ap.pending_since
    from public.review_approvals ap join public.review_requests r on r.id = ap.review_id
    where ap.state = 'pending' and r.status = 'in_review'
      and ap.pending_since < now() - interval '24 hours'
      and (ap.last_reminded_at is null or ap.last_reminded_at < now() - interval '24 hours')
  loop
    perform public.notify_roles(_a.org_id,
      case when _a.stage = 'manager' then array['manager'] else array['hod', 'owner'] end,
      'reminder', '#' || _a.number || ' ' || _a.title || ' has waited ' ||
        floor(extract(epoch from now() - _a.pending_since) / 3600)::int || ' hours for your review',
      '/org/reviews/' || _a.number, _a.author_id);
    update public.review_approvals set last_reminded_at = now() where review_id = _a.review_id and stage = _a.stage;
    insert into public.org_events (org_id, project_id, actor_id, action, target_kind, target_id, target_label, detail)
    values (_a.org_id, _a.project_id, null, 'review.reminder_sent', 'review', _a.review_id, '#' || _a.number || ' ' || _a.title,
            jsonb_build_object('stage', _a.stage));
    _n := _n + 1;
  end loop;
  return _n;
end $$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke all on function
  public.is_org_manager(uuid), public.is_org_hod(uuid), public.set_member_role(uuid, uuid, text),
  public.can_see_project(uuid), public.log_event(uuid, uuid, text, text, uuid, text, jsonb),
  public.notify(uuid, uuid, text, text, text), public.notify_roles(uuid, text[], text, text, text, uuid),
  public.notify_reviewers(uuid, text, text), public.reset_approvals(uuid), public.changed_sections(uuid),
  public.create_project(uuid, text, text, text[], text, uuid), public.set_project_members(uuid, uuid[]),
  public.start_draft(uuid, uuid, text, text, jsonb), public.save_revision(uuid, jsonb, text, integer, integer),
  public.submit_review(uuid, text, text, text, jsonb, text, text[], uuid, jsonb), public.review_decision(uuid, text, text),
  public.resubmit_review(uuid), public.add_comment(uuid, text, text, text, uuid[]), public.accept_suggestion(uuid),
  public.set_section_owners(uuid, text, uuid[]), public.create_milestone(uuid, uuid, text, date),
  public.set_task_done(uuid, boolean), public.send_review_reminders()
from public, anon, authenticated;

grant execute on function
  public.is_org_manager(uuid), public.is_org_hod(uuid), public.set_member_role(uuid, uuid, text), public.can_see_project(uuid),
  public.create_project(uuid, text, text, text[], text, uuid), public.set_project_members(uuid, uuid[]),
  public.start_draft(uuid, uuid, text, text, jsonb), public.save_revision(uuid, jsonb, text, integer, integer),
  public.submit_review(uuid, text, text, text, jsonb, text, text[], uuid, jsonb), public.review_decision(uuid, text, text),
  public.resubmit_review(uuid), public.add_comment(uuid, text, text, text, uuid[]), public.accept_suggestion(uuid),
  public.set_section_owners(uuid, text, uuid[]), public.create_milestone(uuid, uuid, text, date), public.set_task_done(uuid, boolean)
to authenticated;
grant execute on function public.send_review_reminders() to service_role;

-- Roles now change only through set_member_role().
revoke update on public.organization_members from authenticated;

-- ---------------------------------------------------------------------------
-- Row level security: read access follows project visibility. Writes go
-- through the functions above, except the few simple ones granted below.
-- ---------------------------------------------------------------------------

alter table public.projects            enable row level security;
alter table public.project_members     enable row level security;
alter table public.documents           enable row level security;
alter table public.document_versions   enable row level security;
alter table public.document_owners     enable row level security;
alter table public.drafts              enable row level security;
alter table public.draft_revisions     enable row level security;
alter table public.milestones          enable row level security;
alter table public.review_requests     enable row level security;
alter table public.review_approvals    enable row level security;
alter table public.review_comments     enable row level security;
alter table public.comment_reactions   enable row level security;
alter table public.review_links        enable row level security;
alter table public.review_attachments  enable row level security;
alter table public.tasks               enable row level security;
alter table public.org_events          enable row level security;
alter table public.notifications       enable row level security;

drop policy if exists "Visible projects" on public.projects;
create policy "Visible projects" on public.projects for select to authenticated using (public.can_see_project(id));

drop policy if exists "Project members of visible projects" on public.project_members;
create policy "Project members of visible projects" on public.project_members for select to authenticated using (public.can_see_project(project_id));

drop policy if exists "Documents in visible projects" on public.documents;
create policy "Documents in visible projects" on public.documents for select to authenticated using (public.can_see_project(project_id));

drop policy if exists "Versions of visible documents" on public.document_versions;
create policy "Versions of visible documents" on public.document_versions for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and public.can_see_project(d.project_id)));

drop policy if exists "Owners of visible documents" on public.document_owners;
create policy "Owners of visible documents" on public.document_owners for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and public.can_see_project(d.project_id)));

drop policy if exists "Drafts in visible projects" on public.drafts;
create policy "Drafts in visible projects" on public.drafts for select to authenticated using (public.can_see_project(project_id));

drop policy if exists "Revisions of visible drafts" on public.draft_revisions;
create policy "Revisions of visible drafts" on public.draft_revisions for select to authenticated
  using (exists (select 1 from public.drafts d where d.id = draft_id and public.can_see_project(d.project_id)));

drop policy if exists "Milestones of the organization" on public.milestones;
create policy "Milestones of the organization" on public.milestones for select to authenticated using (public.is_org_member(org_id));
drop policy if exists "Managers can delete milestones" on public.milestones;
create policy "Managers can delete milestones" on public.milestones for delete to authenticated using (public.is_org_manager(org_id));

drop policy if exists "Requests in visible projects" on public.review_requests;
create policy "Requests in visible projects" on public.review_requests for select to authenticated using (public.can_see_project(project_id));

drop policy if exists "Approvals of visible requests" on public.review_approvals;
create policy "Approvals of visible requests" on public.review_approvals for select to authenticated
  using (exists (select 1 from public.review_requests r where r.id = review_id and public.can_see_project(r.project_id)));

drop policy if exists "Comments on visible requests" on public.review_comments;
create policy "Comments on visible requests" on public.review_comments for select to authenticated
  using (exists (select 1 from public.review_requests r where r.id = review_id and public.can_see_project(r.project_id)));
drop policy if exists "Authors can delete their comments" on public.review_comments;
create policy "Authors can delete their comments" on public.review_comments for delete to authenticated using (author_id = (select auth.uid()));
drop policy if exists "Comment and request authors can resolve" on public.review_comments;
create policy "Comment and request authors can resolve" on public.review_comments for update to authenticated
  using (author_id = (select auth.uid()) or exists (select 1 from public.review_requests r where r.id = review_id and r.author_id = (select auth.uid())))
  with check (author_id = (select auth.uid()) or exists (select 1 from public.review_requests r where r.id = review_id and r.author_id = (select auth.uid())));

drop policy if exists "Reactions on visible comments" on public.comment_reactions;
create policy "Reactions on visible comments" on public.comment_reactions for select to authenticated
  using (exists (select 1 from public.review_comments c join public.review_requests r on r.id = c.review_id
                 where c.id = comment_id and public.can_see_project(r.project_id)));
drop policy if exists "People add their own reactions" on public.comment_reactions;
create policy "People add their own reactions" on public.comment_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.review_comments c join public.review_requests r on r.id = c.review_id
                                                        where c.id = comment_id and public.can_see_project(r.project_id)));
drop policy if exists "People remove their own reactions" on public.comment_reactions;
create policy "People remove their own reactions" on public.comment_reactions for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Links on visible requests" on public.review_links;
create policy "Links on visible requests" on public.review_links for select to authenticated
  using (exists (select 1 from public.review_requests r where r.id = review_id and public.can_see_project(r.project_id)));
drop policy if exists "Authors and managers add links" on public.review_links;
create policy "Authors and managers add links" on public.review_links for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (select 1 from public.review_requests r where r.id = review_id
              and (r.author_id = (select auth.uid()) or public.is_org_manager(r.org_id))));
drop policy if exists "Authors and managers remove links" on public.review_links;
create policy "Authors and managers remove links" on public.review_links for delete to authenticated
  using (exists (select 1 from public.review_requests r where r.id = review_id and (r.author_id = (select auth.uid()) or public.is_org_manager(r.org_id))));

drop policy if exists "Attachments on visible requests" on public.review_attachments;
create policy "Attachments on visible requests" on public.review_attachments for select to authenticated
  using (exists (select 1 from public.review_requests r where r.id = review_id and public.can_see_project(r.project_id)));
drop policy if exists "Authors attach files" on public.review_attachments;
create policy "Authors attach files" on public.review_attachments for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and exists (select 1 from public.review_requests r where r.id = review_id and r.author_id = (select auth.uid())));

drop policy if exists "Tasks of the organization" on public.tasks;
create policy "Tasks of the organization" on public.tasks for select to authenticated
  using (public.is_org_member(org_id) and (project_id is null or public.can_see_project(project_id)));

drop policy if exists "Events people may see" on public.org_events;
create policy "Events people may see" on public.org_events for select to authenticated
  using (public.is_org_member(org_id) and (project_id is null or public.can_see_project(project_id)));

drop policy if exists "Own notifications" on public.notifications;
create policy "Own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Mark own notifications read" on public.notifications;
create policy "Mark own notifications read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.projects, public.project_members, public.documents, public.document_versions, public.document_owners,
  public.drafts, public.draft_revisions, public.milestones, public.review_requests, public.review_approvals,
  public.review_comments, public.comment_reactions, public.review_links, public.review_attachments, public.tasks,
  public.org_events, public.notifications, public.library_documents
from anon, authenticated;

grant select on public.projects, public.project_members, public.documents, public.document_versions, public.document_owners,
  public.drafts, public.draft_revisions, public.milestones, public.review_requests, public.review_approvals,
  public.review_comments, public.comment_reactions, public.review_links, public.review_attachments, public.tasks,
  public.org_events, public.notifications, public.library_documents
to authenticated;
grant delete on public.milestones, public.review_comments, public.comment_reactions, public.review_links to authenticated;
grant insert on public.comment_reactions, public.review_links, public.review_attachments to authenticated;
grant update (resolved) on public.review_comments to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- The audit log can't be changed by anyone through the app.
grant all on public.projects, public.project_members, public.documents, public.document_versions, public.document_owners,
  public.drafts, public.draft_revisions, public.milestones, public.review_requests, public.review_approvals,
  public.review_comments, public.comment_reactions, public.review_links, public.review_attachments, public.tasks,
  public.notifications, public.library_documents
to service_role;
grant select, insert on public.org_events to service_role;

-- ---------------------------------------------------------------------------
-- Attachments: a private Storage bucket, one folder per organization.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('collab-attachments', 'collab-attachments', false, 20971520)
on conflict (id) do nothing;

create or replace function public.can_use_attachment(_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when (storage.foldername(_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.is_org_member(((storage.foldername(_name))[1])::uuid)
              else false end;
$$;
grant execute on function public.can_use_attachment(text) to authenticated;

drop policy if exists "Organization members read attachments" on storage.objects;
create policy "Organization members read attachments" on storage.objects for select to authenticated
  using (bucket_id = 'collab-attachments' and public.can_use_attachment(name));
drop policy if exists "Organization members upload attachments" on storage.objects;
create policy "Organization members upload attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'collab-attachments' and public.can_use_attachment(name));

-- ---------------------------------------------------------------------------
-- Drafting with the research engine: a research run started for a project
-- turns its finished report into a draft there, created by the server on the
-- researcher's behalf (it may finish while they're away).
-- ---------------------------------------------------------------------------

alter table public.research_runs add column if not exists draft_id uuid references public.drafts (id) on delete set null;
comment on column public.research_runs.draft_id is 'The draft created from the report, when the run was started for a project.';

create or replace function public.create_draft_from_research(_user uuid, _project uuid, _title text, _kind text, _sections jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _p public.projects;
  _role text;
  _doc uuid;
  _id uuid;
begin
  select * into _p from public.projects where id = _project;
  select role into _role from public.organization_members where org_id = _p.org_id and user_id = _user;
  -- The same visibility rule as can_see_project(), for a named person.
  if _p.id is null or _role is null or not (
    _p.visibility = 'department' or _role in ('owner', 'hod', 'manager') or _p.lead_id = _user
    or exists (select 1 from public.project_members pm where pm.project_id = _project and pm.user_id = _user)
  ) then
    raise exception 'That person can''t add documents to this project.';
  end if;
  insert into public.documents (org_id, project_id, title, kind, created_by)
  values (_p.org_id, _project, left(btrim(_title), 300), coalesce(_kind, 'Report'), _user)
  returning id into _doc;
  insert into public.drafts (org_id, project_id, document_id, title, author_id, base_version, sections)
  values (_p.org_id, _project, _doc, left(btrim(_title), 300), _user, 0, _sections)
  returning id into _id;
  insert into public.draft_revisions (draft_id, author_id, message, sections, added)
  values (_id, _user, 'Drafted by Parallax from research', _sections, jsonb_array_length(_sections));
  insert into public.org_events (org_id, project_id, actor_id, action, target_kind, target_id, target_label, detail)
  values (_p.org_id, _project, _user, 'draft.started', 'draft', _id, left(btrim(_title), 300), '{"from": "research"}'::jsonb);
  update public.projects set updated_at = now() where id = _project;
  return _id;
end $$;

revoke all on function public.create_draft_from_research(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_draft_from_research(uuid, uuid, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Closing drafts, by rank. A Research Manager closes their own drafts and
-- those of assistants and interns; a head of department also closes
-- managers' drafts; an owner closes anyone's.
--
-- Anyone who can't close a draft themselves can ask: interns and assistants
-- for their own drafts, managers and heads of department for drafts above
-- their rank. A request goes to one person, to everyone in one role, or to
-- everyone who can close the draft. Only they see it, and the first of them
-- to decide settles it.
--
-- A closed draft is kept, under Closed drafts. Someone who could close it can
-- reopen it, and from there it can be submitted and filed into the library.
-- ---------------------------------------------------------------------------

create table if not exists public.draft_close_requests (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations (id) on delete cascade,
  draft_id      uuid        not null references public.drafts (id) on delete cascade,
  requested_by  uuid        references auth.users (id) on delete set null,
  reason        text        not null,
  status        text        not null default 'pending',
  decided_by    uuid        references auth.users (id) on delete set null,
  decided_at    timestamptz,
  note          text,
  created_at    timestamptz not null default now(),

  constraint draft_close_requests_status_valid check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  constraint draft_close_requests_reason_length check (char_length(btrim(reason)) between 1 and 2000)
);
-- Who it's for: one person, everyone in one role, or (both empty) everyone who can close the draft.
alter table public.draft_close_requests add column if not exists target_user uuid references auth.users (id) on delete set null;
alter table public.draft_close_requests add column if not exists target_role text;
alter table public.draft_close_requests drop constraint if exists draft_close_requests_target_role_valid;
alter table public.draft_close_requests add constraint draft_close_requests_target_role_valid
  check (target_role is null or target_role in ('manager', 'hod', 'owner'));
create index if not exists draft_close_requests_org_id_idx on public.draft_close_requests (org_id, created_at desc);
-- One open request per draft at a time.
create unique index if not exists draft_close_requests_one_pending_idx on public.draft_close_requests (draft_id) where status = 'pending';

alter table public.drafts add column if not exists closed_by uuid references auth.users (id) on delete set null;
alter table public.drafts add column if not exists closed_reason text;
alter table public.drafts add column if not exists closed_at timestamptz;

alter table public.notifications drop constraint if exists notifications_kind_valid;
alter table public.notifications add constraint notifications_kind_valid
  check (kind in ('review_requested', 'mentioned', 'assigned', 'status_changed', 'reminder', 'comment', 'close_requested'));

create or replace function public.role_rank(_role text)
returns int language sql immutable set search_path = '' as $$
  select case _role when 'owner' then 5 when 'hod' then 4 when 'manager' then 3 when 'assistant' then 2 when 'intern' then 1 else 0 end
$$;

-- May this person close this draft? Their own, or one by someone of a lower
-- rank (or who has left); owners close any. Interns and assistants close none.
create or replace function public.can_close_draft_as(_draft uuid, _user uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  _d public.drafts;
  _mine int;
  _theirs int;
begin
  select * into _d from public.drafts where id = _draft;
  if _d.id is null or _user is null then return false; end if;
  select public.role_rank(m.role) into _mine from public.organization_members m where m.org_id = _d.org_id and m.user_id = _user;
  if coalesce(_mine, 0) < 3 then return false; end if;
  if _mine = 5 or _d.author_id = _user then return true; end if;
  select public.role_rank(m.role) into _theirs from public.organization_members m where m.org_id = _d.org_id and m.user_id = _d.author_id;
  return coalesce(_theirs, 0) < _mine;
end $$;

create or replace function public.can_close_draft(_draft uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.drafts d where d.id = _draft and public.can_see_project(d.project_id))
     and public.can_close_draft_as(_draft, (select auth.uid()));
$$;

-- The people a request is for: those it names who can close the draft, never the asker.
create or replace function public.close_request_targets(_request uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.user_id
  from public.draft_close_requests q
  join public.organization_members m on m.org_id = q.org_id
  where q.id = _request
    and m.user_id is distinct from q.requested_by
    and public.can_close_draft_as(q.draft_id, m.user_id)
    and (q.target_user is null or m.user_id = q.target_user)
    and (q.target_role is null or m.role = q.target_role);
$$;

create or replace function public.is_close_target(_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) in (select public.close_request_targets(_request));
$$;

-- The closing itself: the draft, and any review request still open on it.
create or replace function public.close_draft_now(_draft uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _d public.drafts;
  _r public.review_requests;
begin
  select * into _d from public.drafts where id = _draft for update;
  update public.drafts set status = 'closed', closed_by = auth.uid(), closed_reason = _reason, closed_at = now(), updated_at = now() where id = _draft;
  for _r in select * from public.review_requests where draft_id = _draft and status in ('in_review', 'changes_requested') loop
    update public.review_requests set status = 'closed', closed_reason = coalesce('Draft closed: ' || _reason, 'Draft closed'), updated_at = now() where id = _r.id;
    perform public.log_event(_r.org_id, _r.project_id, 'review.closed', 'review', _r.id, '#' || _r.number || ' ' || _r.title, jsonb_build_object('reason', _reason));
  end loop;
  -- A request to close it is now settled.
  update public.draft_close_requests set status = 'approved', decided_by = auth.uid(), decided_at = now()
    where draft_id = _draft and status = 'pending';
  perform public.log_event(_d.org_id, _d.project_id, 'draft.closed', 'draft', _draft, _d.title, jsonb_build_object('reason', _reason));
  perform public.notify(_d.org_id, _d.author_id, 'status_changed', 'Your draft "' || _d.title || '" was closed', '/org/drafts/' || _draft);
end $$;

create or replace function public.close_draft(_draft uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _d public.drafts;
begin
  select * into _d from public.drafts where id = _draft;
  if _d.id is null or not public.can_see_project(_d.project_id) then raise exception 'Draft not found.'; end if;
  if _d.status in ('filed', 'closed') then raise exception 'This draft is already finished.'; end if;
  if not public.is_org_manager(_d.org_id) then
    raise exception 'Only Research Managers, heads of department and owners can close a draft. Ask one of them instead.';
  end if;
  if not public.can_close_draft(_draft) then
    raise exception 'This draft was opened by someone of the same or a higher role. Ask someone above them to close it.';
  end if;
  perform public.close_draft_now(_draft, nullif(btrim(coalesce(_reason, '')), ''));
end $$;

-- The earlier version took no recipient.
drop function if exists public.request_draft_close(uuid, text);

create or replace function public.request_draft_close(_draft uuid, _reason text, _to_user uuid default null, _to_role text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _d public.drafts;
  _id uuid;
  _me text;
  _role text;
  _target uuid;
begin
  select * into _d from public.drafts where id = _draft;
  if _d.id is null or not public.can_see_project(_d.project_id) then raise exception 'Draft not found.'; end if;
  if _d.status in ('filed', 'closed') then raise exception 'This draft is already finished.'; end if;
  _role := public.org_role(_d.org_id);
  if public.can_close_draft(_draft) then raise exception 'You can close this draft yourself.'; end if;
  if _role in ('intern', 'assistant') and _d.author_id <> auth.uid() then
    raise exception 'You can only ask to close your own drafts.';
  end if;
  if nullif(btrim(coalesce(_reason, '')), '') is null then raise exception 'Say why the draft should be closed.'; end if;
  if _to_role is not null and _to_role not in ('manager', 'hod', 'owner') then raise exception 'Send it to Research Managers, heads of department or owners.'; end if;
  if _to_user is not null and not public.can_close_draft_as(_draft, _to_user) then
    raise exception 'That person can''t close this draft. Choose someone of a higher role than its author.';
  end if;
  if exists (select 1 from public.draft_close_requests where draft_id = _draft and status = 'pending') then
    raise exception 'There is already a request to close this draft.';
  end if;

  insert into public.draft_close_requests (org_id, draft_id, requested_by, reason, target_user, target_role)
  values (_d.org_id, _draft, auth.uid(), btrim(_reason), _to_user, case when _to_user is null then _to_role end)
  returning id into _id;
  if not exists (select 1 from public.close_request_targets(_id)) then
    raise exception 'Nobody you chose can close this draft. Choose someone of a higher role than its author.';
  end if;

  select coalesce(full_name, email) into _me from public.profiles where id = auth.uid();
  perform public.log_event(_d.org_id, _d.project_id, 'draft.close_requested', 'draft', _draft, _d.title, jsonb_build_object('reason', btrim(_reason)));
  for _target in select public.close_request_targets(_id) loop
    perform public.notify(_d.org_id, _target, 'close_requested',
      coalesce(_me, 'Someone') || ' asks to close the draft "' || _d.title || '"', '/org/drafts/' || _draft);
  end loop;
  return _id;
end $$;

create or replace function public.decide_close_request(_request uuid, _approve boolean, _note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _q public.draft_close_requests;
  _d public.drafts;
begin
  select * into _q from public.draft_close_requests where id = _request for update;
  if _q.id is null or not public.is_close_target(_request) then
    raise exception 'This request wasn''t sent to you.';
  end if;
  -- The first to decide settles it.
  if _q.status <> 'pending' then raise exception 'Someone has already decided this request.'; end if;
  select * into _d from public.drafts where id = _q.draft_id;
  if _approve then
    perform public.close_draft_now(_q.draft_id, _q.reason);
    update public.draft_close_requests set note = nullif(btrim(coalesce(_note, '')), '') where id = _request;
  else
    update public.draft_close_requests set status = 'declined', decided_by = auth.uid(), decided_at = now(), note = nullif(btrim(coalesce(_note, '')), '')
      where id = _request;
    perform public.log_event(_q.org_id, _d.project_id, 'draft.close_declined', 'draft', _q.draft_id, _d.title, jsonb_build_object('note', _note));
    perform public.notify(_q.org_id, _q.requested_by, 'status_changed', 'Your request to close "' || _d.title || '" was declined', '/org/drafts/' || _q.draft_id);
  end if;
end $$;

create or replace function public.withdraw_close_request(_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _q public.draft_close_requests;
begin
  select * into _q from public.draft_close_requests where id = _request;
  if _q.id is null or _q.requested_by <> auth.uid() then raise exception 'Only the person who asked can withdraw the request.'; end if;
  if _q.status <> 'pending' then raise exception 'This request has already been decided.'; end if;
  update public.draft_close_requests set status = 'withdrawn', decided_at = now() where id = _request;
end $$;

-- Back to work: the draft opens again, and can be submitted and filed.
create or replace function public.reopen_draft(_draft uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _d public.drafts;
begin
  select * into _d from public.drafts where id = _draft for update;
  if _d.id is null or not public.can_see_project(_d.project_id) then raise exception 'Draft not found.'; end if;
  if _d.status <> 'closed' then raise exception 'Only a closed draft can be reopened.'; end if;
  if not public.can_close_draft(_draft) then
    raise exception 'Only someone who could close this draft can reopen it.';
  end if;
  update public.drafts set status = 'open', closed_by = null, closed_reason = null, closed_at = null, updated_at = now() where id = _draft;
  perform public.log_event(_d.org_id, _d.project_id, 'draft.reopened', 'draft', _draft, _d.title, '{}'::jsonb);
  perform public.notify(_d.org_id, _d.author_id, 'status_changed', 'Your draft "' || _d.title || '" was reopened', '/org/drafts/' || _draft);
end $$;

revoke all on function public.role_rank(text), public.can_close_draft(uuid), public.can_close_draft_as(uuid, uuid),
  public.close_request_targets(uuid), public.is_close_target(uuid) from public, anon;
grant execute on function public.role_rank(text), public.can_close_draft(uuid), public.is_close_target(uuid) to authenticated;
revoke all on function public.can_close_draft_as(uuid, uuid), public.close_request_targets(uuid) from authenticated;
revoke all on function public.close_draft_now(uuid, text), public.close_draft(uuid, text), public.request_draft_close(uuid, text, uuid, text),
  public.decide_close_request(uuid, boolean, text), public.withdraw_close_request(uuid), public.reopen_draft(uuid) from public, anon, authenticated;
grant execute on function public.close_draft(uuid, text), public.request_draft_close(uuid, text, uuid, text),
  public.decide_close_request(uuid, boolean, text), public.withdraw_close_request(uuid), public.reopen_draft(uuid) to authenticated;

-- A request is seen by the person who asked, the people it was sent to, and whoever decided it.
alter table public.draft_close_requests enable row level security;
drop policy if exists "Close requests on visible drafts" on public.draft_close_requests;
drop policy if exists "Close requests for the asker and recipients" on public.draft_close_requests;
create policy "Close requests for the asker and recipients" on public.draft_close_requests for select to authenticated
  using (requested_by = (select auth.uid()) or decided_by = (select auth.uid()) or public.is_close_target(id));
revoke all on public.draft_close_requests from anon, authenticated;
grant select on public.draft_close_requests to authenticated;
grant all on public.draft_close_requests to service_role;

-- ---------------------------------------------------------------------------
-- Branding. Research Managers, heads of department and owners give their
-- organization a two-toned theme (a primary and a secondary colour), a logo, a favicon, and
-- a logo for printed documents. The images live in a public Storage bucket,
-- one folder per organization, so browsers can show them as icons.
-- ---------------------------------------------------------------------------

create table if not exists public.organization_branding (
  org_id           uuid        primary key references public.organizations (id) on delete cascade,
  primary_color    text,
  secondary_color  text,
  logo_path        text,
  favicon_path     text,
  print_logo_path  text,
  updated_by       uuid        references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),

  constraint organization_branding_primary_hex check (primary_color is null or primary_color ~ '^#[0-9a-f]{6}$'),
  constraint organization_branding_secondary_hex check (secondary_color is null or secondary_color ~ '^#[0-9a-f]{6}$')
);

alter table public.organization_branding enable row level security;
drop policy if exists "Members read their organization's branding" on public.organization_branding;
create policy "Members read their organization's branding" on public.organization_branding for select to authenticated
  using (public.is_org_member(org_id));
revoke all on public.organization_branding from anon, authenticated;
grant select on public.organization_branding to authenticated;
grant all on public.organization_branding to service_role;

-- Pass null to clear a value. Image paths must be inside the organization's own folder.
create or replace function public.set_org_branding(
  _org uuid, _primary text, _secondary text, _logo text, _favicon text, _print_logo text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  _path text;
begin
  if not public.is_org_manager(_org) then
    raise exception 'Only Research Managers, heads of department and owners can change the organization''s branding.';
  end if;
  if lower(_primary) !~ '^#[0-9a-f]{6}$' and _primary is not null then raise exception 'Colours must look like #1a2b3c.'; end if;
  if lower(_secondary) !~ '^#[0-9a-f]{6}$' and _secondary is not null then raise exception 'Colours must look like #1a2b3c.'; end if;
  foreach _path in array array[_logo, _favicon, _print_logo] loop
    if _path is not null and _path not like _org::text || '/%' then raise exception 'That image belongs to another organization.'; end if;
  end loop;
  insert into public.organization_branding (org_id, primary_color, secondary_color, logo_path, favicon_path, print_logo_path, updated_by, updated_at)
  values (_org, lower(_primary), lower(_secondary), _logo, _favicon, _print_logo, auth.uid(), now())
  on conflict (org_id) do update set
    primary_color = excluded.primary_color, secondary_color = excluded.secondary_color,
    logo_path = excluded.logo_path, favicon_path = excluded.favicon_path, print_logo_path = excluded.print_logo_path,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  perform public.log_event(_org, null, 'org.branding_changed', 'organization', _org, null, '{}'::jsonb);
end $$;
revoke all on function public.set_org_branding(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.set_org_branding(uuid, text, text, text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-branding', 'org-branding', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_brand(_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when (storage.foldername(_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.is_org_manager(((storage.foldername(_name))[1])::uuid)
              else false end;
$$;
grant execute on function public.can_brand(text) to authenticated;

drop policy if exists "Owners and heads of department upload branding" on storage.objects;
drop policy if exists "Managers and above upload branding" on storage.objects;
create policy "Managers and above upload branding" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-branding' and public.can_brand(name));
drop policy if exists "Owners and heads of department remove branding" on storage.objects;
drop policy if exists "Managers and above remove branding" on storage.objects;
create policy "Managers and above remove branding" on storage.objects for delete to authenticated
  using (bucket_id = 'org-branding' and public.can_brand(name));
