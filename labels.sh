#!/bin/bash

labels=(
  "P0:Must-have"
  "P1:Recommended"
  "P2:Advanced"
  "compliance"
  "audit"
  "export"
  "calculation"
  "validation"
  "gdpr"
  "gleitzeit"
  "kv"
  "frontend"
  "backend"
)

for label in "${labels[@]}"; do
  gh label create "$label" --force || true
done
