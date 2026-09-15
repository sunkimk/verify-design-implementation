# Acceptance report contract

## Human report order

Use this order:

1. Project name and reviewer/designer
2. Verdict and one-sentence rationale
3. Scope and evidence level
4. Coverage matrix summary and gaps
5. Blocking issues
6. Other confirmed issues
7. Observations requiring stronger evidence
8. Accepted deviations and exclusions
9. Assumptions, capture details, and tool transforms
10. Rerun and verification instructions

Keep the verdict independent of issue count. A single P0 can matter more than hundreds of harmless pixel clusters.

## Issue format

Use this compact form for each confirmed issue:

```markdown
### DA-001 — Primary action is clipped at 320 px [P1, high, E3]
- Owner / disposition: frontend-team / open
- Scope: Checkout / error state / 320×800 CSS px / web
- Location: x=248, y=612, w=72, h=44 screenshot px
- Expected: Full button label and 44 CSS px target remain visible.
- Actual: Right 18 CSS px are outside the viewport.
- Delta: 18 CSS px horizontal overflow, reproduced at 320 and 360 px.
- Impact: Users cannot identify the primary recovery action.
- Evidence: design node …; capture …; DOM selector …
- Recommendation: Allow the action row to wrap and remove the fixed container width.
- Verify: At 320, 360, and 390 px, the full label is visible and keyboard focus remains in view.
```

If the cause is unproven, phrase the recommendation as an outcome rather than a CSS prescription.

## JSON contract

The validator requires this minimum structure:

```json
{
  "schema_version": "1.0",
  "review_metadata": {
    "project_name": "Checkout refresh",
    "designer_name": "Designer name"
  },
  "verdict": "FAIL",
  "scope": {
    "design_source": "figma://file/node@version",
    "implementation_source": "https://example.test@commit",
    "policy": "project-policy-v2 or provisional"
  },
  "evidence": {
    "level": "E3",
    "sources": ["design.png", "implementation.png", "DOM inspection"],
    "transforms": [],
    "masks": []
  },
  "coverage": [
    {
      "screen": "checkout",
      "state": "error",
      "viewport": "320x800@1x",
      "platform": "web",
      "status": "covered"
    }
  ],
  "assumptions": [],
  "exclusions": [],
  "issues": [
    {
      "id": "DA-001",
      "title": "Primary action is clipped at 320 px",
      "severity": "P1",
      "confidence": "high",
      "evidence_level": "E3",
      "category": "responsive",
      "owner": "frontend-team",
      "disposition": "open",
      "scope": "checkout / error / 320x800@1x / web",
      "location": {"x": 248, "y": 612, "width": 72, "height": 44, "unit": "screenshot_px"},
      "expected": "Full label and target are visible.",
      "actual": "Right edge is clipped.",
      "delta": "18 CSS px overflow",
      "impact": "Primary recovery action is unclear.",
      "sources": ["design.png", "implementation-320.png", "DOM .actions"],
      "recommendation": "Allow the action row to wrap.",
      "verification": "Repeat at 320, 360, and 390 CSS px."
    }
  ],
  "observations": [],
  "summary": {
    "p0": 0,
    "p1": 1,
    "p2": 0
  }
}
```

Allowed verdicts: `PASS`, `CONDITIONAL_PASS`, `FAIL`.

Allowed coverage statuses: `covered`, `blocked`, `out_of_scope`, `not_run`.

Allowed evidence levels: `E1`, `E2`, `E3`.

Allowed issue categories are defined in `acceptance-model.md`.

Allowed dispositions: `open`, `accepted`, `deferred`, `fixed`. Use `accepted` only for an explicit acceptance decision, not as a synonym for “detected.”

## Evidence language

- Use **measured** only for values obtained from controlled pixel analysis, design metadata, DOM, code, or runtime inspection.
- Use **observed** for visible symptoms.
- Use **inferred** for likely causes and say what would confirm them.
- Use `unknown` instead of a fabricated value.

## Compatibility

New reports use P0/P1/P2. To inspect an unchanged historical report containing P3, pass `--allow-legacy-p3` to the validator. This is read-only validation, not permission to create new P3 findings or silently migrate history.

This formal acceptance contract is not the bridge diagnostic schema; see [runtime detection](runtime-detection.md).
