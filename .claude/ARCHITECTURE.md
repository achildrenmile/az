# Architecture Principles

This document defines non-negotiable architectural rules.
Claude Code must follow these rules for all changes.

## Core Principles

### 1. Separation of Concerns
- Business logic must not live in UI components
- Arbeitszeiterfassung (AZ) logic is backend-only
- UI components may not contain calculation or compliance logic

### 2. Immutability & Auditability
- Recorded working time data must never be silently overwritten
- All changes must be traceable via an audit log
- Audit logs are append-only

### 3. Deterministic Behavior
- Same input must always produce the same output
- No hidden side effects
- No time-based or environment-dependent logic without explicit configuration

### 4. Explicit Over Implicit
- No magic defaults
- All rules and thresholds must be explicitly configured
- Configuration must be versioned

### 5. Backward Compatibility
- Existing routes must not break
- Existing exports must not change structure without migration
- Existing data must remain valid

---

## Domain Boundaries

### Arbeitszeiterfassung (AZ)
- Legally required
- Subject to Austrian Arbeitszeitgesetz (AZG)
- Focus: employee working time

### Leistungsnachweise
- Commercial / contractual documents
- Optional module
- Focus: customer confirmation
- Must not modify AZ data

---

## Forbidden Patterns

- Coupling AZ data with Leistungsnachweise
- Editing time records without audit logging
- UI-driven business logic
- Implicit rule inference
