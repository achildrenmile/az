#!/bin/bash

create_issue () {
  gh issue create \
    --title "$1" \
    --body "$2" \
    --label "$3" \
    --milestone "$4"
}

# ---------- P0 ----------

create_issue \
"Auto-calculate weekly and monthly working hours" \
"Legal requirement (§26 AZG)

Acceptance Criteria:
- Weekly totals per calendar week
- Monthly totals per calendar month
- Includes overtime
- Recalculates on changes" \
"P0:Must-have,compliance,backend" \
"Legal Core Compliance (AZG)"

create_issue \
"Separate normal hours and overtime" \
"Acceptance Criteria:
- Configurable thresholds
- Separate display in UI and exports" \
"P0:Must-have,compliance,calculation,backend" \
"Legal Core Compliance (AZG)"

create_issue \
"Validate daily and weekly working time limits" \
"Acceptance Criteria:
- Warning at >10h/day
- Violation flag at >12h/day
- Weekly limit checks
- Visible in audit export" \
"P0:Must-have,validation,backend" \
"Legal Core Compliance (AZG)"

create_issue \
"Enforce minimum break durations" \
"Acceptance Criteria:
- Missing break detection
- Configurable rules
- Compliance warnings" \
"P0:Must-have,compliance,backend" \
"Legal Core Compliance (AZG)"

create_issue \
"Immutable audit trail for time changes" \
"Acceptance Criteria:
- Append-only log
- User + timestamp
- Old vs new values
- Non-deletable" \
"P0:Must-have,audit,backend" \
"Legal Core Compliance (AZG)"

create_issue \
"Legally compliant PDF and CSV export" \
"Acceptance Criteria:
- Daily records
- Breaks
- Weekly totals
- Overtime
- Violations" \
"P0:Must-have,export,frontend,backend" \
"Legal Core Compliance (AZG)"

# ---------- P1 ----------

create_issue \
"Monthly employee time statement" \
"Acceptance Criteria:
- Monthly PDF
- Employee access
- Optional email delivery" \
"P1:Recommended,frontend" \
"Employee Transparency & Risk Reduction"

create_issue \
"Employee confirmation of monthly records" \
"Acceptance Criteria:
- Explicit confirmation
- Timestamp stored
- Visible in audit log" \
"P1:Recommended,compliance,frontend,backend" \
"Employee Transparency & Risk Reduction"

create_issue \
"Gleitzeit and averaging period support" \
"Acceptance Criteria:
- Configurable periods
- Balance calculation
- Carry-over rules" \
"P1:Recommended,gleitzeit,backend" \
"Employee Transparency & Risk Reduction"

create_issue \
"Inspection-ready audit view" \
"Acceptance Criteria:
- Read-only mode
- Filters
- One-click export" \
"P1:Recommended,audit,frontend" \
"Employee Transparency & Risk Reduction"

# ---------- P2 ----------

create_issue \
"Collective agreement (KV) rule engine" \
"Acceptance Criteria:
- Configurable rules
- Employee/group assignment" \
"P2:Advanced,kv,backend" \
"Market Differentiation"

create_issue \
"Location and work type tagging" \
"Acceptance Criteria:
- Optional location
- Work type classification
- Included in exports" \
"P2:Advanced,frontend" \
"Market Differentiation"

create_issue \
"Automatic data retention and deletion rules" \
"Acceptance Criteria:
- Configurable retention
- Admin notifications
- Deletion logs" \
"P2:Advanced,gdpr,backend" \
"Market Differentiation"
