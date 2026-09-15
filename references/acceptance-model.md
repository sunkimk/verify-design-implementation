# Acceptance model

Use this model to turn comparison evidence into a defensible release decision.

## Evidence levels

| Level | Available evidence | Allowed claims |
|---|---|---|
| E1 | Uncontrolled screenshots or video frames | Visible symptom and approximate location only |
| E2 | Controlled, same-state screenshots with provenance | Pixel-space geometry, color samples, and visual-diff measurements with rendering caveats |
| E3 | E2 plus design metadata and implementation DOM/code/runtime inspection | Exact tokens/properties, root-cause evidence, responsive/interaction/accessibility findings supported by inspection |

Never upgrade an issue beyond the evidence actually collected.

## Required coverage

Build a coverage matrix with one row per contractual combination of:

`screen/component × state × viewport/platform × theme × locale`

Mark each row `covered`, `blocked`, `out_of_scope`, or `not_run`. The denominator must exclude only explicitly out-of-scope rows. Do not use screenshot area or pixel similarity as coverage.

## Categories

- `content-state`
- `structure-geometry`
- `typography`
- `visual-style`
- `asset-iconography`
- `responsive`
- `interaction-motion`
- `accessibility`
- `evidence-capture`

## Severity

Assign severity from impact and scope, not raw pixel distance.

| Severity | Meaning | Typical examples |
|---|---|---|
| P0 | Blocks use, causes harmful/legal failure, or makes the release invalid | Primary task impossible; critical content absent; dangerous control mismatch |
| P1 | Major user, brand, or systemic fidelity failure | Primary layout broken; wrong state; widespread component/token error; required accessibility failure |
| P2 | Clear localized defect with a workaround or limited scope | Noticeable spacing, wrapping, icon, color, or component-state mismatch |

When uncertain between levels, state confidence and choose the lower severity unless the potential harm requires escalation.

## Confidence

- `high`: directly measured or reproduced with a controlled source.
- `medium`: clearly observed but the exact cause or magnitude is partly inferred.
- `low`: plausible candidate requiring recapture or stronger evidence.

Low-confidence candidates do not block release by default. Put them in observations unless policy says otherwise.

## Tolerances

Use project tokens and component specifications before defaults. When no tolerance is supplied, use these only as triage hints, not universal truth:

- geometry: investigate deltas above 2 CSS px or 1%, whichever is larger;
- text wrapping: treat a changed line break, truncation, or overflow as a functional visual change;
- color: sample flat interior regions and investigate perceptible shifts; avoid edges, transparency, shadows, and anti-aliased glyphs;
- repeated components: investigate consistent drift even when each individual delta is small;
- raster effects: compare shadows, gradients, images, and anti-aliasing visually unless exact source metadata exists.

Record the unit. Screenshot pixels are not CSS pixels unless device scale is known.

## Provisional gate

Use this only when the user has not provided a policy:

1. Require 100% of contractual coverage rows to be `covered`, or explicitly accept each gap.
2. Require zero open P0 and P1 issues.
3. Require every open P2 issue to have an owner and an explicit accept/defer decision.
4. Return `FAIL` when evidence is insufficient for required coverage; do not translate uncertainty into `PASS`.

Pixel-difference ratio, SSIM, or issue count may support triage but may not replace this gate.

## Root-cause grouping

Group issues when one change is likely to resolve multiple symptoms. Examples:

- one incorrect container width causing many child offsets;
- one typography token causing wrapping and height drift across components;
- one icon pipeline causing repeated size and baseline errors;
- one missing breakpoint rule causing multiple responsive defects.

Use a module-first hierarchy:

1. Create one module-level issue when component shape, layout rule, spacing, clipping, overflow, or module height are symptoms of the same system mismatch.
2. Add a content issue only for independent copy, field, item-count, order, or asset differences.
3. Add a state issue only for independent selected, disabled, loading, error, focus, or interaction-state differences.
4. Merge adjacent pixel candidates before writing issues. Repeated components with the same expected outcome, recommendation, owner, severity, and verification belong to one issue with an affected-instance count.
5. Split only when the fix, owner, severity, verification, or user impact materially differs.

Order module issues before their content and state details. Include representative bounds, affected-instance count, and exceptions. Never create separate issues for each child label when one parent layout correction resolves them all.
