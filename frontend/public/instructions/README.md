# Instruction modal screenshots

Drop PNGs here, named `<role>-<step number>-<n>.png` — step number = the
step's position in `src/lib/instructionContent.js` (starting at 1), and `n`
is which screenshot within that step (also starting at 1). Most steps only
need one: `super-admin-2-1.png`. A step that needs to walk through more than
one screen (e.g. "Start a season" showing the empty state, then the create
dialog, then the result) can have `-2`, `-3`, etc. too — the modal shows them
as a small gallery (arrows + dots) the user can step through.

**`n` must be CONTIGUOUS, starting at 1** — the modal probes `-1`, `-2`, `-3`…
in order and stops at the first one that's missing, so `-1.png` + `-3.png`
with no `-2.png` would only ever show the first image. If a step only needs
one screenshot, just add `-1.png`.

**Super Admin** (7): `super-admin-1-1.png` … `super-admin-7-1.png` (+ `-2`, `-3`… as needed)
1 Welcome (dashboard) · 2 Season · 3 Reference List · 4 Review Queue ·
5 League Setup · 6 Tournaments · 7 Accounts

**Barangay Admin** (4): `barangay-admin-1-1.png` … `barangay-admin-4-1.png`
1 Welcome · 2 Team Registration · 3 Document Submission · 4 Submit & track

**Organizer** (5): `organizer-1-1.png` … `organizer-5-1.png`
1 Welcome · 2 Match list · 3 Start & score · 4 End the match · 5 Player stats form

A step with no files at all just shows its icon instead. Use a wide
(16:9-ish) capture; users can click a screenshot to enlarge it (and, with
multiple, step through them in the enlarged view too).
