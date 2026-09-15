# Reviewer-facing results

Use the existing workbench rather than generating another implementation. For code changes, see [workbench maintenance](workbench-maintenance.md).

- Lead with coverage and the actual state. Not imported, incomplete, restoring, not checked, checking, failed, incomparable and successful-zero-difference are different facts. Do not translate a diagnostic result into human approval.
- Show design and implementation with independent labeled evidence bounds; offer annotation and opacity-overlay views. An incomparable pair needs recapture/re-pairing, not made-up fidelity issues.
- Present editable ID, P0/P1/P2, normalized type, two exact crops, design expectation, actual behavior and smallest supported correction. Separate implementation/standard/advice/blocker kinds. Standards findings cite the rule and acknowledge when the design also violates it.
- Selecting an issue and its marker stays synchronized. Give the crops an enlarged two-sided view and keep labels readable. Preserve the approved card layout.
- 问题项/已忽略 are the issue tabs. Every active issue is exported without another inclusion control. Ignoring is reversible and retains edits/crops. Displayed filter count and export count are distinct.
- HTML embeds exact issue crops and keeps uncropped evidence collapsible; PDF opens with complete uncropped evidence followed by issue detail. Preserve source aspect ratios, project/designer metadata, original-pixel coordinates and readable navigation.
- When the task requests a formal verdict, use [acceptance model](acceptance-model.md) and [report contract](report-contract.md). Do not require the formal schema for a bridge diagnostic response.
- Keep controls named, keyboard operable, focus visible, preview panels within the viewport, and long text accessible. Do not claim full accessibility from screenshots alone.
