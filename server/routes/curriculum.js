// Curriculum authoring: module -> lesson -> activity. CIC staff publish and
// edit modules here without a code deploy.
//
// Who sees what:
//   curriculum.write  edit everything, see drafts
//   curriculum.read   (external reviewers) see everything, drafts included, read-only
//   classes.manage_*  (instructors) see published modules only, to assign them
import { bad, notFound, forbidden } from '../http.js';
import { hasPerm } from '../auth.js';
import { audit } from '../db.js';
import * as v from '../validate.js';

export const ACTIVITY_TYPES = ['pretest', 'slides', 'video', 'reading', 'check', 'worksheet', 'code', 'exit', 'posttest'];
const READERS = ['curriculum.read', 'curriculum.write', 'classes.manage_own', 'classes.manage_all'];
const W = { auth: 'staff', perm: 'curriculum.write' };
const seesDrafts = (principal) => hasPerm(principal, ['curriculum.read', 'curriculum.write']);

/** A module with its lessons and activities, in order. */
export async function loadModuleTree(q, moduleId) {
  const mod = await q.one('select id, title, summary, published, updated_at from modules where id = $1', [moduleId]);
  if (!mod) return null;
  mod.lessons = await q('select id, title, position from lessons where module_id = $1 order by position, id', [moduleId]);
  const acts = await q(
    `select a.id, a.lesson_id, a.type, a.title, a.position, a.concept_id, c.name as concept, a.content
       from activities a join lessons l on l.id = a.lesson_id left join concepts c on c.id = a.concept_id
      where l.module_id = $1 order by l.position, l.id, a.position, a.id`,
    [moduleId]
  );
  for (const l of mod.lessons) l.activities = acts.filter((a) => a.lesson_id === l.id);
  return mod;
}

// Swap a lesson or activity with its neighbour. Table and column names come
// from the two call sites below, never from the request.
async function moveRow(q, table, parentCol, id, dir) {
  const row = await q.one(`select id, ${parentCol} as parent from ${table} where id = $1`, [id]);
  if (!row) throw notFound();
  const ids = (await q(`select id from ${table} where ${parentCol} = $1 order by position, id`, [row.parent])).map((s) => s.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (j >= 0 && j < ids.length) {
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await q(`update ${table} t set position = x.pos from unnest($1::int[]) with ordinality as x(id, pos) where t.id = x.id`, [ids]);
  }
  return { ok: true, order: ids };
}

const touch = (q, moduleId) => q('update modules set updated_at = now() where id = $1', [moduleId]);

async function activityInput(q, body) {
  const type = v.oneOf(body.type, 'Type', ACTIVITY_TYPES);
  const conceptId = v.id(body.concept_id, 'Concept', { optional: true });
  if (conceptId && !(await q.one('select 1 from concepts where id = $1', [conceptId]))) throw bad('That concept does not exist', 'Concept');
  return {
    type,
    title: v.str(body.title, 'Activity title', { max: 120 }),
    concept_id: conceptId,
    content: v.activityContent(type, body.content ?? {}),
  };
}

export default function register(route) {
  route('GET', 'modules', { auth: 'staff', perm: READERS }, async ({ q, principal }) =>
    q(
      `select m.id, m.title, m.summary, m.published, m.updated_at,
              (select count(*)::int from lessons l where l.module_id = m.id) as lessons,
              (select count(*)::int from activities a join lessons l on l.id = a.lesson_id where l.module_id = m.id) as activities
         from modules m where $1 or m.published order by m.title`,
      [seesDrafts(principal)]
    ));

  route('GET', 'modules/:id', { auth: 'staff', perm: READERS }, async ({ q, params, principal }) => {
    const mod = await loadModuleTree(q, v.id(params.id, 'Module'));
    if (!mod || (!mod.published && !seesDrafts(principal))) throw notFound();
    return mod;
  });

  route('GET', 'concepts', { auth: 'staff', perm: READERS }, async ({ q }) => q('select id, key, name from concepts order by name'));

  route('POST', 'modules', W, async ({ q, body, principal, ctx }) => {
    const mod = await q.one(
      'insert into modules (title, summary, created_by) values ($1, $2, $3) returning id, title',
      [v.str(body.title, 'Title', { max: 120 }), v.str(body.summary, 'Summary', { max: 1000, optional: true }) ?? '', principal.user.id]
    );
    await q("insert into lessons (module_id, title, position) values ($1, 'Lesson 1', 1)", [mod.id]);
    await audit(q, principal.user.id, 'create', 'module', mod.id, { title: mod.title });
    ctx.status = 201;
    return mod;
  });

  route('PATCH', 'modules/:id', W, async ({ q, params, body, principal }) => {
    const id = v.id(params.id, 'Module');
    const before = await q.one('select published from modules where id = $1', [id]);
    if (!before) throw notFound();
    const published = v.bool(body.published, 'Published', { optional: true });
    const r = await q.one(
      `update modules set title = coalesce($2, title), summary = coalesce($3, summary),
         published = coalesce($4, published), updated_at = now() where id = $1 returning id, title, summary, published`,
      [id, v.str(body.title, 'Title', { max: 120, optional: true }),
       body.summary === undefined ? null : (v.str(body.summary, 'Summary', { max: 1000, optional: true }) ?? ''),
       published]
    );
    if (published !== null && published !== before.published) {
      await audit(q, principal.user.id, published ? 'publish' : 'unpublish', 'module', id, { title: r.title });
    }
    return r;
  });

  route('DELETE', 'modules/:id', W, async ({ q, params, principal }) => {
    const id = v.id(params.id, 'Module');
    const used = await q.one('select count(*)::int as n from class_modules where module_id = $1', [id]);
    if (used.n) throw bad(`This module is assigned to ${used.n} class(es). Unassign it first, or unpublish it instead.`);
    const r = await q.one('delete from modules where id = $1 returning id, title', [id]);
    if (!r) throw notFound();
    await audit(q, principal.user.id, 'delete', 'module', id, { title: r.title });
    return { ok: true };
  });

  // ----- Lessons -----
  route('POST', 'modules/:id/lessons', W, async ({ q, params, body, ctx }) => {
    const moduleId = v.id(params.id, 'Module');
    if (!(await q.one('select 1 from modules where id = $1', [moduleId]))) throw notFound();
    const r = await q.one(
      `insert into lessons (module_id, title, position)
       select $1, $2, coalesce(max(position), 0) + 1 from lessons where module_id = $1 returning id`,
      [moduleId, v.str(body.title, 'Lesson title', { max: 120 })]
    );
    await touch(q, moduleId);
    ctx.status = 201;
    return r;
  });

  route('PATCH', 'lessons/:id', W, async ({ q, params, body }) => {
    const r = await q.one('update lessons set title = $2 where id = $1 returning module_id', [v.id(params.id, 'Lesson'), v.str(body.title, 'Lesson title', { max: 120 })]);
    if (!r) throw notFound();
    await touch(q, r.module_id);
    return { ok: true };
  });

  route('POST', 'lessons/:id/move', W, async ({ q, params, body }) =>
    moveRow(q, 'lessons', 'module_id', v.id(params.id, 'Lesson'), v.int(body.dir, 'Direction', { min: -1, max: 1 })));

  route('DELETE', 'lessons/:id', W, async ({ q, params }) => {
    const id = v.id(params.id, 'Lesson');
    const used = await q.one('select count(*)::int as n from submissions s join activities a on a.id = s.activity_id where a.lesson_id = $1', [id]);
    if (used.n) throw forbidden('Students have already answered activities in this lesson. Edit it instead, so their progress is kept.');
    const r = await q.one('delete from lessons where id = $1 returning module_id', [id]);
    if (!r) throw notFound();
    await touch(q, r.module_id);
    return { ok: true };
  });

  // ----- Activities -----
  route('POST', 'lessons/:id/activities', W, async ({ q, params, body, ctx }) => {
    const lessonId = v.id(params.id, 'Lesson');
    const lesson = await q.one('select module_id from lessons where id = $1', [lessonId]);
    if (!lesson) throw notFound('No such lesson');
    const a = await activityInput(q, body);
    const r = await q.one(
      `insert into activities (lesson_id, type, title, concept_id, content, position)
       select $1, $2, $3, $4, $5, coalesce(max(position), 0) + 1 from activities where lesson_id = $1 returning id`,
      [lessonId, a.type, a.title, a.concept_id, a.content]
    );
    await touch(q, lesson.module_id);
    ctx.status = 201;
    return r;
  });

  route('PUT', 'activities/:id', W, async ({ q, params, body }) => {
    const a = await activityInput(q, body);
    const r = await q.one(
      `update activities set type = $2, title = $3, concept_id = $4, content = $5 where id = $1
       returning (select module_id from lessons where id = lesson_id) as module_id`,
      [v.id(params.id, 'Activity'), a.type, a.title, a.concept_id, a.content]
    );
    if (!r) throw notFound();
    await touch(q, r.module_id);
    return { ok: true };
  });

  route('POST', 'activities/:id/move', W, async ({ q, params, body }) =>
    moveRow(q, 'activities', 'lesson_id', v.id(params.id, 'Activity'), v.int(body.dir, 'Direction', { min: -1, max: 1 })));

  route('DELETE', 'activities/:id', W, async ({ q, params }) => {
    const id = v.id(params.id, 'Activity');
    const used = await q.one('select count(*)::int as n from submissions where activity_id = $1', [id]);
    if (used.n) throw forbidden(`Students have already answered this activity ${used.n} time(s). Edit it instead of deleting, so their progress is kept.`);
    const r = await q.one('delete from activities where id = $1 returning id', [id]);
    if (!r) throw notFound();
    return { ok: true };
  });
}
