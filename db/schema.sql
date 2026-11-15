-- Coding in Color: curriculum and student progress platform.
-- Postgres (Neon). Applied by `npm run db:setup`; re-running with --reset drops
-- and recreates everything.
--
-- Design notes
--  * Roles and permissions are DATA. Admins add, edit and remove roles and tick
--    permissions in the admin screens; the API only ever checks permission keys.
--  * Students are minors. We store a display name, their class (and through it
--    the school) and a hashed PIN. No email, birthday, address or phone.
--  * Row-level security is FORCED on every table holding student data. Each API
--    request runs in a transaction that sets app.actor_kind / app.student_id, so
--    even a buggy query made for one student can only ever see that student.

drop table if exists audit_log, settings, api_keys, sessions, student_unlocks, hint_logs,
  submissions, students, class_modules, classes, cohorts, activities, lessons, modules,
  concepts, schools, users, role_permissions, roles, permissions cascade;
drop function if exists app_actor_kind(), app_student_id();

-- ---------- Access control ----------
create table permissions (
  key          text primary key,
  description  text not null
);

create table roles (
  id           serial primary key,
  key          text not null unique check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name         text not null,
  description  text not null default '',
  created_at   timestamptz not null default now()
);

create table role_permissions (
  role_id        int  not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- Staff: CIC admins, instructors, partner teachers, authors, external reviewers.
create table users (
  id             serial primary key,
  email          text not null unique,
  name           text not null,
  password_hash  text not null,
  role_id        int  not null references roles(id),
  active         boolean not null default true,
  failed_logins  int not null default 0,
  locked_until   timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------- Organization ----------
create table schools (
  id          serial primary key,
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- A cohort groups classes for reporting, e.g. "AI Academy Fall 2026".
create table cohorts (
  id          serial primary key,
  name        text not null unique,
  program     text not null default '',
  term        text not null default '',
  created_at  timestamptz not null default now()
);

-- ---------- Curriculum: module -> lesson -> activity ----------
create table concepts (
  id    serial primary key,
  key   text not null unique check (key ~ '^[a-z0-9][a-z0-9-]{0,40}$'),
  name  text not null
);

create table modules (
  id           serial primary key,
  title        text not null,
  summary      text not null default '',
  published    boolean not null default false,
  created_by   int references users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create table lessons (
  id         serial primary key,
  module_id  int not null references modules(id) on delete cascade,
  title      text not null,
  position   int not null default 0
);
create index on lessons (module_id, position);

-- content (jsonb) depends on type. Pre/post-test questions carry their own
-- concept tag so learning gain can be reported per concept.
create table activities (
  id          serial primary key,
  lesson_id   int not null references lessons(id) on delete cascade,
  type        text not null check (type in ('pretest','slides','video','reading','check','worksheet','code','exit','posttest')),
  title       text not null,
  position    int not null default 0,
  concept_id  int references concepts(id) on delete set null,
  content     jsonb not null default '{}'::jsonb
);
create index on activities (lesson_id, position);

-- ---------- Classes and students ----------
create table classes (
  id             serial primary key,
  name           text not null,
  school_id      int references schools(id) on delete set null,
  cohort_id      int references cohorts(id) on delete set null,
  instructor_id  int references users(id) on delete set null,
  join_code      text not null unique,
  self_join      boolean not null default true,  -- late joiners may add themselves
  pace_position  int not null default 1,         -- "the class is on module #N"
  archived       boolean not null default false,
  created_at     timestamptz not null default now()
);

create table class_modules (
  class_id   int not null references classes(id) on delete cascade,
  module_id  int not null references modules(id) on delete cascade,
  position   int not null,
  primary key (class_id, module_id)
);

create table students (
  id              serial primary key,
  class_id        int not null references classes(id) on delete cascade,
  display_name    text not null,
  pin_hash        text not null,
  start_position  int,                            -- instructor-chosen start module (late joiners)
  failed_logins   int not null default 0,
  locked_until    timestamptz,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (class_id, display_name)
);

-- Instructor opened a later module for one student, out of sequence.
create table student_unlocks (
  student_id   int not null references students(id) on delete cascade,
  module_id    int not null references modules(id) on delete cascade,
  unlocked_by  int references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (student_id, module_id)
);

create table submissions (
  id           bigserial primary key,
  student_id   int not null references students(id) on delete cascade,
  activity_id  int not null references activities(id) on delete cascade,
  answer       jsonb not null default '{}'::jsonb,
  score        numeric,
  max_score    numeric,
  passed       boolean,
  completed    boolean not null default false,
  time_ms      int,
  created_at   timestamptz not null default now()
);
create index on submissions (student_id, activity_id);
create index on submissions (activity_id);

create table hint_logs (
  id           bigserial primary key,
  student_id   int not null references students(id) on delete cascade,
  activity_id  int not null references activities(id) on delete cascade,
  concept_id   int references concepts(id) on delete set null,
  error_text   text,
  hint         text not null,
  level        int not null default 1,           -- hint ladder rung
  source       text not null default 'ai' check (source in ('ai','author','builtin')),
  created_at   timestamptz not null default now()
);
create index on hint_logs (student_id, activity_id);
create index on hint_logs (concept_id);

-- ---------- Sessions, API keys (secrets stored only as SHA-256 hashes) ----------
create table sessions (
  token_hash  text primary key,
  user_id     int references users(id) on delete cascade,
  student_id  int references students(id) on delete cascade,
  csrf_token  text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  check ((user_id is null) <> (student_id is null))
);

create table api_keys (
  id            serial primary key,
  name          text not null,
  prefix        text not null,
  key_hash      text not null unique,
  created_by    int references users(id) on delete set null,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------- Settings and audit trail ----------
create table settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Who changed what. Written for every privileged change (roles, staff,
-- PIN resets, unlocks, deletes). Never stores PINs or passwords.
create table audit_log (
  id          bigserial primary key,
  actor_id    int references users(id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index on audit_log (created_at desc);

-- ---------- Row-level security on student data ----------
-- app.actor_kind = 'staff' | 'student' | 'system'; app.student_id = <id> for students.
-- Which classes an instructor may see is enforced in the API; RLS is the
-- backstop that makes cross-student leaks impossible.
create function app_actor_kind() returns text language sql stable as
$$ select coalesce(nullif(current_setting('app.actor_kind', true), ''), 'none') $$;
create function app_student_id() returns int language sql stable as
$$ select nullif(current_setting('app.student_id', true), '')::int $$;

alter table students        enable row level security;
alter table students        force  row level security;
alter table submissions     enable row level security;
alter table submissions     force  row level security;
alter table hint_logs       enable row level security;
alter table hint_logs       force  row level security;
alter table student_unlocks enable row level security;
alter table student_unlocks force  row level security;

create policy staff_all on students for all
  using (app_actor_kind() in ('staff','system')) with check (app_actor_kind() in ('staff','system'));
create policy self_read on students for select
  using (app_actor_kind() = 'student' and id = app_student_id());
create policy self_seen on students for update
  using (app_actor_kind() = 'student' and id = app_student_id()) with check (id = app_student_id());

create policy staff_all on submissions for all
  using (app_actor_kind() in ('staff','system')) with check (app_actor_kind() in ('staff','system'));
create policy self_all on submissions for all
  using (app_actor_kind() = 'student' and student_id = app_student_id()) with check (student_id = app_student_id());

create policy staff_all on hint_logs for all
  using (app_actor_kind() in ('staff','system')) with check (app_actor_kind() in ('staff','system'));
create policy self_all on hint_logs for all
  using (app_actor_kind() = 'student' and student_id = app_student_id()) with check (student_id = app_student_id());

create policy staff_all on student_unlocks for all
  using (app_actor_kind() in ('staff','system')) with check (app_actor_kind() in ('staff','system'));
create policy self_read on student_unlocks for select
  using (app_actor_kind() = 'student' and student_id = app_student_id());

-- ---------- Built-in permission keys (the code checks these; roles are editable) ----------
insert into permissions (key, description) values
  ('curriculum.read',    'View all modules, including unpublished drafts'),
  ('curriculum.write',   'Create, edit, publish and delete modules, lessons and activities'),
  ('classes.manage_own', 'Create classes and manage the classes you teach'),
  ('classes.manage_all', 'See and manage every class in the organization'),
  ('reports.read_all',   'See organization-wide progress and learning gain'),
  ('users.manage',       'Create, edit and deactivate staff accounts'),
  ('roles.manage',       'Create roles and change which permissions each role has'),
  ('settings.manage',    'Manage schools, cohorts, concepts, settings and API keys'),
  ('audit.read',         'View the audit log');
