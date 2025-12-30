# Instructions for Claude Code

Before making any code changes:

1. Read ARCHITECTURE.md
2. Read DECISIONS.md
3. Read CODING_RULES.md

Rules:
- GitHub issues define scope
- Architecture documents override issues
- If a conflict exists, stop and ask for clarification
- Do not proceed to the next issue without confirmation

---

## Architecture Decisions (ADR)

- All non-trivial architectural decisions must be documented as ADRs
- New ADRs must be created from `.claude/adr/ADR-TEMPLATE.md`
- Claude Code must not introduce new architectural decisions without an ADR
- If a decision is required but no ADR exists, stop and ask for clarification

---

## Claude Execution Rules

Claude Code must follow `.claude/EXECUTION_CHECKLIST.md` for every session.
No code changes are allowed unless all checklist items are satisfied.
