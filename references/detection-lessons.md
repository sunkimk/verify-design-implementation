# Detection lessons

Read when reviewing a reported false positive/miss or changing the detector. These are scoped decision corrections, not a requirement to manufacture findings.

| Case | Failure | Better decision / boundary | Regression expectation |
|---|---|---|---|
| Search input vs idle, same Send To sheet | Treated different local state as whole-page blocker, skipping header | Match shared sheet first. Search/keyboard state limits that region, not shared title/subtitle/close geometry. Truly unrelated core pages remain blocker. | Shared header differences are found without whole-page blocker. |
| Sheet header spacing | Large state/position box hid title and close-control differences | Use sheet top/side edges as local anchors; compare title top inset, subtitle alignment and gap, close-control size and offsets after uniform density normalization. | Independent header causes retained; parent translation not duplicated per child. |
| Search icon and text | Same word Search was assumed to mean same appearance | Compare icon visible bounds/stroke, icon-text gap, text baseline/size/weight and input padding independently of placeholder content. | Visible size/layout differences found; identical control not flagged. |
| Avatar row | Wider spacing misdescribed as circle-to-rounded-square change | Compare element bounds separately from center pitch and edge gaps across several items. Photo content and independently scaled crops do not establish shape. | Equal circles with wider spacing reported as layout; no shape claim. |
| Mix in Tab Bar | Enforced full name The Mix in short navigation context | Apply text standard 1.4.1: Mix is valid for navigation. Do not generalize this exemption to unrelated text. | No missing-The finding for the tab label. |

## Maintain from user feedback

When the user reports a detection mistake, inspect the cited evidence and actual runtime path; distinguish confirmed error from an unverified hypothesis. Amend the relevant existing case rather than duplicating it. Record the corrected cause, applicable scope, counterexample and validation status. Update runtime prompts/logic when that is where the failure occurs; a Markdown edit alone does not update the running bridge. Prefer a small synthetic regression with known geometry and an unchanged control over repeated full paid batches. Report remaining misses honestly and do not convert a single user example into a universal visual rule.

The September 13 header/search/avatar changes are strategy corrections in the runtime prompt. They are not a new pixel measurement algorithm. Numerical claims still require measured geometry or a declared estimate. Existing reports are not silently rewritten.

## Validation 2026-09-13
Synthetic shared-sheet pair at @1x/@3x: header alignment/inset, close control, search icon and equal-size avatar spacing were detected; no whole-screen blocker or avatar-shape finding. Identical control returned zero issues. First run still overclaimed icon positioning and classified input-state mismatch as implementation; tightened those distinctions. This verifies the synthetic cases, not every user screenshot. Keep original reports unchanged until a new review is requested.

Refined run: retained header position/alignment, typography, close-circle, search-icon and avatar-spacing findings; no avatar-shape or whole-screen blocker. Input-state mismatch became advice/coverage limitation, and the inner X was no longer claimed to grow. Image-only judgments remain estimates; real user cases still need a new review. Regression assets: `tests/fixtures/detection-regression/`.

## Cross-platform sheet corners
Android/iOS alone does not exempt custom product sheet corner geometry. Compare visible curvature after uniform logical scaling. Report clear deviations unless an explicit platform adaptation applies; do not invent a CSS radius. This user-reported case is recorded; the new corner rule has not yet been separately benchmarked.

## Issue titles: current deviation and expected correction
User feedback: a title describing only compressed header spacing and an upward-shifted list does not communicate the expected outcome. Full and crop review share a rule to state the object, supported current deviation, and expected correction in one concise sentence. Example: “弹窗顶部间距不足导致列表上移，应恢复设计间距并对齐副标题。” Do not invent measurements or remedies to fill the format; blockers name the evidence needed, and uncertain/matching regions must not become fabricated defects. This is an output-writing rule, not a geometry detection change. Existing reports and user edits remain unchanged. Validation: shared prompt wiring and syntax checked; no additional model benchmark was run for this wording change.
