# Claude Code – Execution Checklist

Claude Code must follow this checklist for every session and every issue.

---

## Session Start (Mandatory)

Before making any code changes:

- [ ] Read `.claude/ARCHITECTURE.md`
- [ ] Read `.claude/DECISIONS.md`
- [ ] Read `.claude/CODING_RULES.md`
- [ ] Read `.claude/EXECUTION_CHECKLIST.md`
- [ ] Identify current GitHub issue to work on

If any document is missing or unclear, STOP and ask.

---

## Issue Handling Rules

- Work on **one GitHub issue at a time**
- Issues must be processed in priority order:
  - P0 → P1 → P2
- Within the same priority, use ascending issue number
- Implement **only what the issue describes**
- Do not anticipate future issues

---

## Implementation Rules

- Prefer minimal, explicit changes
- Do not refactor unrelated code
- Do not introduce abstractions unless required by the issue
- Backend logic stays in backend
- UI changes must not alter business logic

---

## Architecture Safety

- Do not violate accepted ADRs
- Do not introduce new architectural decisions silently
- If a new decision is required:
  - STOP
  - Request an ADR

---

## Completion Rules

After completing an issue:

- [ ] Restate the issue number and title
- [ ] List files changed
- [ ] Confirm acceptance criteria are met
- [ ] Confirm no other issues were touched
- [ ] STOP and wait for confirmation before proceeding

---

## Hard Stop Conditions

Claude Code must STOP immediately if:
- Requirements are ambiguous
- Legal or compliance behavior is unclear
- An issue conflicts with architecture documents
- A decision is required but no ADR exists
