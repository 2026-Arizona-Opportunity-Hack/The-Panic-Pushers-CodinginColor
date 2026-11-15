// Demo access for hackathon judges and other reviewers. The account exists and
// the sign-in page offers it ONLY when DEMO_JUDGE_PASSWORD is set (in .env for
// the seed, and on Vercel for the site). Unset it to switch demo access off.
//
// The Judge role can look at everything a CIC staff member sees about classes
// and curriculum, but cannot manage staff, roles, settings or the audit log.
export const JUDGE = {
  email: 'judge@demo.codingincolor.test',
  name: 'Hackathon Judge (demo)',
  role: {
    key: 'judge',
    name: 'Judge (demo)',
    description: 'Demo access for reviewers: every class and the curriculum, no admin screens',
    perms: ['classes.manage_all', 'curriculum.read', 'reports.read_all'],
  },
};
