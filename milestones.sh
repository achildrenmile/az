#!/bin/bash

gh api repos/:owner/:repo/milestones \
  -f title="Legal Core Compliance (AZG)" \
  -f description="Mandatory Austrian legal compliance"

gh api repos/:owner/:repo/milestones \
  -f title="Employee Transparency & Risk Reduction" \
  -f description="Employee rights, confirmations, inspections"

gh api repos/:owner/:repo/milestones \
  -f title="Market Differentiation" \
  -f description="Advanced & competitive features"
