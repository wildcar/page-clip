# Environment

Host facts, tools, credentials, and command cheat-sheet for this project.
Update whenever a new tool, credential, or host-specific quirk is learned.

## Host

- **Dev**: Windows 11, PowerShell + Git Bash, user `wildcar`, repo `C:\Users\wildcar\D\repo\page-clip`.
- **Runtime**: Yandex Browser (Chromium), extension loaded unpacked. No server side.

## Tools

- git 2.55, gh CLI (authenticated as `wildcar`).
- Node.js and Python: not installed (Node is needed only for optional `node --check` / ESLint).

## Credentials & secrets

- None. `.claude/settings.local.json` is gitignored.

## Commands cheat-sheet

```
git remote: https://github.com/wildcar/page-clip (branch main)
browser://extensions   — load / reload the unpacked extension (folder extension/)
```

## Host-specific quirks

- SM-Clinic pages require login: agents cannot see the DOM, the user must provide outerHTML for locator tuning.
