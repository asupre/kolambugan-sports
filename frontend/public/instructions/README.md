# Instruction guide screenshots

The first-login guide (the "?" button in the admin header) shows these on the
right-hand side of each step: one large, plus a thumbnail strip of every
screenshot for that step. Clicking the large one opens a zoomable view
(wheel / pinch / double-click / +/-), which can also step through them.

Files live in one folder per role:

- `super-admin/`
- `barangay-admin/`
- `organizer/`

They are NOT picked up by name automatically. Each step in
`src/lib/instructionContent.js` lists its own screenshots, in order, with a
caption:

```js
shots: [
  ["create-season.png", "No season yet: tap Create Season"],
  ["create-season-modal.png", "Name the season"],
],
```

To add or replace a screenshot: drop the PNG in the role's folder (lower-case,
no spaces) and add or edit its line in that step. A step with no `shots` shows
its icon instead.

Guidelines:

- Capture at about 1366x768. Wide captures fill the viewer best; small crops
  (one card, one dialog) are fine too.
- Everything here is served PUBLICLY. Never capture a real password, a
  recovery code, a residency document, or a real resident's personal data.
  Blank it out first (the recovery-code screenshot has its code replaced with
  XXXX).
- Re-capture the affected screenshots after a UI pass on those pages.
