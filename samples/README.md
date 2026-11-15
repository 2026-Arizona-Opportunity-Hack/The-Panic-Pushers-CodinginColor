# Sample data

Files for trying features and for tests. Every name here is made up.

| File | What it is for |
| --- | --- |
| `roster-clean.csv` | A clean 20-student roster, as a school export would look. Import it into a new class to see the happy path. |
| `roster-edge-cases.csv` | Every problem a real roster export has, in one file (see below). |
| `roster-edge-cases.expected.csv` | What the roster importer must do with each line of the file above. Use it as the importer's test. |
| `learning-gain-fixture.csv` | Pre and post scores with hand-checked gains, including the awkward cases. `test/gain.test.js` checks `server/gain.js` against it. |

## Roster import rules

Students appear in class as **first name + last initial** ("Maria G."), which matches how CIC rosters look and keeps last names off the screen.

- **Columns:** header names are matched ignoring case, spaces and underscores (`First Name`, `first_name` and `FIRSTNAME` all work). `first_name` is required, while `last_name` and `student_id` are optional. Other columns, like `Grade` and `Notes`, are ignored.
- **File format:** handles a UTF-8 byte-order mark (Excel adds one), Windows line endings, quoted fields with commas or `""`, and a last line with no line ending.
- **Cleaning:** spaces and tabs are trimmed, and a name typed in all capitals is changed to normal capitals. Accents, apostrophes and hyphens are kept.
- **Short-name clashes:** when two students would share a name ("Maria G."), both get one more letter ("Maria Ga.", "Maria Go.").
- **Duplicates:** a row with the same student ID as an earlier row is skipped. Without IDs, an identical first and last name is skipped.
- **Already in the class:** shown as a conflict for the teacher to skip or rename. It is never silently merged.
- **Errors:** a name with characters other than letters, spaces, `. ' -` is rejected with a reason. It is never "fixed" silently. Injection attempts are rejected by the same rule, and are harmless anyway because every query is parameterized.
- **Preview first:** the importer shows every line's result before anything is saved. The edge-case file should preview as **16 to add, 1 conflict, 5 errors, 2 duplicates, 1 blank**.

## Learning gain rules

See `server/gain.js`. In short: a student counts only with both a pretest and a post-test. A student who scored 100% on the pretest has no room to grow, so their normalized gain is left blank and kept out of the normalized average. Retakes use the first pretest and the latest post-test. Scores above the maximum are treated as bad data and left out.

## Demo classes (`npm run db:seed`)

| Code | Class | What it shows |
| --- | --- | --- |
| `PHX234` | Intro to Python · Period 3 | 16 students on the three starter modules. The class is on module 2. |
| `SPK7QR` | AI Academy Spark · Saturday | Data & AI, then the Story Generator. 14 students. |
| `STR9KM` | Story Lab · Period 5 | A closed class (no self-join) with one locked-out student. 18 students. |
| `SUM26X` | Summer Bootcamp 2026 | Archived: you can't join it, but it still counts in reports. |

Each class has students who are done, stuck (failed attempts and hints), in progress, not started, at the ceiling, showing negative gain, retaking the post-test, or joining late. Every demo student's PIN is `1234`, or whatever `DEMO_PIN` is set to.
