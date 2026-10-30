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

- SM-Clinic visit page (app.smclinic.ru, Vue): class names are readable BEM (`admission-info-wrapper`, `doctor-info-wrapper`), not hashed; the visit date has no year ("Понедельник, 12 октября, 15:06") and no other year exists on the page (only birth date, promo dates, copyright). Weekday inference is ambiguous ("Понедельник, 01 апреля" was 2019, the guess gave 2024), hence the year dialog.
- SM-Clinic API: visit page loads `GET /api/visits/<uuid>?accountId=…&patientId=…` → `{ visit: { dateTime: "2019-04-01T18:14:00", … } }`; the response also holds full patient data (phone, e-mail, cards), so read only the needed path and never log it.
- SM-Clinic visit list (`/history?page=N`): each `.medical-info-card` has `.date__day`, `.date__month` ("апр."), `.date__year` ("2019 г."), `.doctor-info__specialization`; "Подробнее о приёме" is a click handler, not a link.
- SM-Clinic doctor notes (`.doctor-extra-text--list`, `white-space: pre-line`) contain dozens of tabs and tab-only lines per line break.
- The Claude preview pane opens local files as `data:` URLs, so relative scripts fail; serve the repo with `tools/serve.ps1` instead.
- SM-Clinic study page ("Информация об исследовании", Vue): `.diagnostic__headline h2`, `.analysis-info` (nested twice; date after "Дата проведения исследования", patient, referring doctor), `.analysis-examination` (assigned studies, results). The date has no year ("Среда, 23 сентября, 16:43"). Results: `.result-wrapper` with "Результаты обследования.pdf" and "Посмотреть результаты обследования" (click handler, no URL in the DOM; downloads the PDF).
- SM-Clinic results PDF: OpenPDF, Type0 DejaVuSans Identity-H + ToUnicode, FlateDecode, one narrow text column wrapped to the page (lines must be re-joined); text has runs of spaces; CreationDate = download time, not the study date.
- SM-Clinic study API: the study page loads `GET /api/diagnostics/<uuid>?accountId=…&patientId=…&cityId=…&patientBirthday=…` → `{ diagnostic: { analysisDateTime, appointmentDateTime, services[].title, result, … } }`; `result` is the same text as the PDF with the original line breaks (runs of spaces, trailing spaces). The URL carries the birth date: never log or store it.
