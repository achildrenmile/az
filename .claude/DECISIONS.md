# Architecture Decisions (ADR)

This document records accepted architectural decisions.
Claude Code must respect all decisions marked as "Accepted".

---

## ADR-001: Arbeitszeiterfassung and Leistungsnachweise are separate domains

Status: Accepted

- AZ is legally required and audit-relevant
- Leistungsnachweise are optional and commercial
- No automatic data synchronization
- Optional references are read-only

---

## ADR-002: Audit logs are append-only

Status: Accepted

- Audit entries may not be updated or deleted
- Each entry must include:
  - user
  - timestamp
  - action
  - old value
  - new value

---

## ADR-003: Compliance logic is backend-only

Status: Accepted

- Break rules
- Daily and weekly limits
- Overtime calculation

These must not be implemented in frontend code.

---

## ADR-004: Navigation changes must not affect routes

Status: Accepted

- UI navigation may change
- URLs and routes must remain stable
