# Memory

Durable agent memory for this repository: working agreements and facts that are NOT
derivable from the code, git history, or SPEC/STATE/HISTORY.

This is the ONLY agent memory store in the project. Do not use external or per-tool memory
stores — memory must travel with the repo (see AGENTS.md -> Memory). Read at the start of
every session; when you learn something durable, append a short bullet here and commit it
together with the related change.

MEMORY.md = durable facts/agreements; current state -> STATE.md; iteration log -> HISTORY.md.

## Working agreements (feedback)

- Page dumps the user provides contain real medical/personal data; keep them gitignored and only use anonymized fixtures in commits. Why: the repo is public.
- SM-Clinic file name: `Приём <date> <specialty>`, no doctor name (user request 2026-10-30).

## Project facts

- SM-Clinic visit page (app.smclinic.ru, Vue): class names are readable BEM (`admission-info-wrapper`, `doctor-info-wrapper`), not hashed; the visit date has no year ("Понедельник, 12 октября, 15:06") and no other year exists on the page (only birth date, promo dates, copyright). Weekday inference is ambiguous: "Понедельник, 01 апреля" was a 2019 visit, the guess gave 2024.
- SM-Clinic doctor notes (`.doctor-extra-text--list`, `white-space: pre-line`) contain dozens of tabs and tab-only lines per line break.
- The Claude preview pane opens local files as `data:` URLs, so relative scripts fail; serve the repo with `tools/serve.ps1` instead.
