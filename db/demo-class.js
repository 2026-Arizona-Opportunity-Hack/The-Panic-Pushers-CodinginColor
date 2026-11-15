// Demo class loaded by `npm run db:seed`, so the student join flow can be tried
// straight away: open /join.html?code=PHX234. Names are made up. Every demo
// student uses the PIN in DEMO_PIN (default 1234). Delete the class, or
// archive it, before real students use the site.

export const demoClass = {
  name: 'Intro to Python · Period 3',
  school: 'Demo High School',
  cohort: 'AI Academy Fall 2026 (demo)',
  join_code: 'PHX234',
  // Modules in the order the class takes them (titles from demo-curriculum.js).
  modules: ['Python basics: print and variables', 'Loops: make the computer repeat', 'Decisions with if'],
  students: [
    'Aaliyah B.', 'Andre M.', 'Camila R.', 'Darnell W.', 'Destiny J.', 'Elijah T.',
    'Imani K.', 'Jayden C.', 'José L.', 'Keanu P.', 'Maria G.', 'Nia S.',
    'Ravi N.', 'Sofia H.', 'Tyrese D.', 'Yazmin A.',
  ],
};
