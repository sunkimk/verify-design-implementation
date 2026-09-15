---
name: verify-design-implementation
description: Compare approved UI designs with implementation evidence and review differences in the local acceptance workbench. Use for design fidelity checks and design acceptance reports.
---

# Verify design implementation

Use the provided design, screenshots and acceptance policy to identify supported differences and help the reviewer decide what needs fixing. Preserve the requested scope and existing approvals. Do not redesign the product being checked or treat image similarity as a release verdict.

## Choose the relevant path

- **Review screenshots or designs:** launch `node scripts/start_workbench.mjs`, use the emitted URL, import evidence, confirm ambiguous pairs, inspect findings and provide the requested export. Reuse a suitable live session. The prebuilt workbench needs Node, not an npm install.
- **Maintain the workbench:** follow [AGENTS.md](AGENTS.md) and the affected section of [workbench maintenance](references/workbench-maintenance.md). Do not run the complete acceptance workflow just to change a control.
- **Change AI detection:** read [runtime detection](references/runtime-detection.md). The bridge's prompt and schema are the actual model input; editing this file alone does not change detection.
- **Produce a formal report/JSON:** use [report contract](references/report-contract.md) and [acceptance model](references/acceptance-model.md). Validate formal JSON with `python3 scripts/validate_acceptance_report.py report.json`; the bridge diagnostic object has a different contract.

## Evidence contract

Use existing context to determine sources, platform, state and intended deviations. Missing optional identity information is not a blocker: default the designer to `设计师` and project name to the design filename. Explain onboarding only when useful. Ask only when missing evidence or scope would materially change the result.

Read [capture protocol](references/capture-protocol.md) when capturing or normalizing evidence. Preserve originals and record transformations. Different output densities can share a logical viewport; apply one uniform scale per image. Only globally incomparable pages block comparison. Local state differences (search text, keyboard, scrolling or background content) limit those regions; continue checking shared product components.

Judge visible content, structure, typography, assets and state from available evidence. Distinguish measured, observed and inferred claims; do not invent CSS, exact colors, fonts or interaction behavior from a screenshot. Group a shared cause while retaining independent actionable differences. Dynamic sample data and rendering noise are not defects unless the task requires those exact values or shows a formatting/overflow/state failure.

Separate implementation differences, violations of the [ZYMIX text standard](references/zymix-ui-text-standardization.md), optional advice and incomparable evidence. The ZYMIX standard applies to this product; a shared violation in design and implementation is a standards finding, not a failure to reproduce the design. Use only P0/P1/P2 and qualify uncertainty.

## Learn from reported detection errors

For each user-reported miss or false positive, consult and update [detection lessons](references/detection-lessons.md), correct the actual runtime rule or algorithm responsible, and verify the relevant behavior with a bounded case when feasible. Keep the confirmed cause, limits and validation result; consolidate repeated lessons. Do not claim a new detector is effective from documentation edits alone.

## Review and delivery

Use the existing workbench for dual-image annotations, overlay, issue editing and reversible ignoring. Follow [visual report](references/visual-report.md) for presentation. Keep two independent original-pixel locations per issue, shared by the canvas, crops and exports.

Report actual coverage and blocked checks. AI zero-difference findings are not human sign-off. For formal acceptance apply the agreed gate or the clearly identified provisional gate; insufficient evidence cannot become PASS. Export HTML/PDF when requested; do not create a second app or unnecessary artifacts.

Codex is the supported image provider, using its configured model and authenticated CLI. If unavailable, surface the real failure; do not publish local pixel candidates as finished AI findings. Preserve credentials, localhost/token protections, source files, user edits and existing records. Authorized local checks can proceed without repeated confirmation, but destructive overwrite is distinct from safe review.
