// Demo classes loaded by `npm run db:seed`. Schools, cohorts and students are
// made up (schools are marked "(demo)"). Every demo student signs in with the
// PIN in DEMO_PIN (default 1234). Archive or delete these before real use.
//
// Each student gets a progress "story" per assigned module, so the instructor
// views have every case to show, not just happy paths:
//   done           pretest, every activity, post-test (gain varies by student)
//   ceiling        3/3 before and after: no room to grow (normalized gain is blank)
//   negative       post-test lower than pretest
//   retook         two post-test attempts, the second one better
//   stuck          failed the first code exercise 4 times and asked for 2 hints
//   in-progress    pretest plus the first two activities
//   pretest-only   took the pretest, then nothing
//   (none)         joined but never started
//   late           joined late, placed at module 2 by the instructor (no module 1 data)
//   locked         5 wrong PINs: the instructor has to reset it

export const STORIES = [
  ['done', 'in-progress'], ['done', 'done'], ['stuck'], ['in-progress'], [],
  ['ceiling', 'in-progress'], ['done', 'stuck'], ['negative'], ['retook', 'pretest-only'],
  ['pretest-only'], ['done', 'ceiling'], ['in-progress'], { late: 2, modules: [null, 'in-progress'] },
  ['done', 'in-progress'], ['stuck'], [], ['done', 'pretest-only'], ['done'],
];

export const demoClasses = [
  {
    name: 'Intro to Python · Period 3',
    school: 'Demo High School',
    cohort: 'AI Academy Fall 2026 (demo)',
    join_code: 'PHX234',
    pace_position: 2,
    modules: ['Python basics: print and variables', 'Loops: make the computer repeat', 'Decisions with if'],
    students: [
      'Aaliyah B.', 'Andre M.', 'Camila R.', 'Darnell W.', 'Destiny J.', 'Elijah T.',
      'Imani K.', 'Jayden C.', 'José L.', 'Keanu P.', 'Maria G.', 'Nia S.',
      'Ravi N.', 'Sofia H.', 'Tyrese D.', 'Yazmin A.',
    ],
  },
  {
    name: 'AI Academy Spark · Saturday',
    school: 'West Valley Community Center (demo)',
    cohort: 'AI Academy Fall 2026 (demo)',
    join_code: 'SPK7QR',
    modules: ['Data & AI: how machines learn', 'Build a Story Generator'],
    students: [
      'Ahmad Q.', 'Brianna O.', "D'Andre W.", 'Esperanza V.', 'Gabriel R.', 'Hana Y.',
      'Isaiah F.', 'Jasmine T.', 'Kenji S.', 'Leilani K.', 'Mateo Z.', 'Naomi E.',
      'Omar H.', 'Priya D.',
    ],
  },
  {
    name: 'Story Lab · Period 5',
    school: 'Saguaro Ridge High School (demo)',
    cohort: 'Python Foundations Fall 2026 (demo)',
    join_code: 'STR9KM',
    self_join: false, // closed class: late joiners must be added by the teacher
    modules: ['Build a Story Generator', 'Loops: make the computer repeat'],
    locked: ['Ximena R.'],
    students: [
      'Adriana C.', 'Bryce L.', 'Chayton B.', 'Diego M.', 'Emily N.', 'Fatima A.',
      'Grace P.', 'Hector G.', 'Isabella F.', 'Jamal K.', 'Kiara W.', 'Luis O.',
      'Mai T.', 'Noah J.', 'Ana-Sofía R.', 'Quinn S.', 'Ximena R.', 'Zoë M.',
    ],
  },
  {
    name: 'Summer Bootcamp 2026',
    school: 'Demo High School',
    cohort: 'Summer Bootcamp 2026 (demo)',
    join_code: 'SUM26X',
    archived: true, // finished last summer: hidden from join, still counted in reports
    modules: ['Python basics: print and variables'],
    stories: [['done'], ['done'], ['ceiling'], ['done'], ['negative'], ['done']],
    students: ['Ariana L.', 'Ben C.', 'Carmen D.', 'Dominic F.', 'Elena G.', 'Felix H.'],
  },
];

// Short, believable answers for worksheets and exit tickets.
export const SAMPLE_ANSWERS = [
  'A variable is like a box with a label that keeps one thing in it.',
  'I learned how to make the program change based on what you type. Still unsure about indentation.',
  'Loops save time because you write the line once and it repeats.',
  'The AI got the theme right but used a variable we did not have, so we renamed it.',
  'Cleaning the data changed the answer, takis won once the spelling matched.',
  'You use = to store something and == to check if two things are the same.',
  'Bias happens when the data leaves people out, so test it with everyone.',
  'My reader is my little brother, he loves dinosaurs and space.',
];
