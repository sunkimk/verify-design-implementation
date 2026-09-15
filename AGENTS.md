# Design acceptance workbench

This package is a reusable Skill and its React workbench. User instructions define the task; these rules preserve project-specific behavior, not extra approval gates.

## Work within the requested scope

Use `assets/shadcn-review-app/` as the single interactive implementation. Maintain the existing shadcn/Stone/Blue/Inter design and HugeIcons family. Import HugeIcons through individual icon subpaths, not the package barrel. Do not recreate removed templates or ship test images/reports as product defaults.

Read what the change touches:
- `SKILL.md`: using the acceptance workflow, not a prerequisite for every code edit.
- `references/workbench-maintenance.md`: intake, pairing, canvas, history and export behavior.
- `references/visual-report.md`: reviewer-facing evidence and issue presentation.
- `references/runtime-detection.md`: changing the AI prompt or bridge contract.
- `docs/VALIDATION_CHECKLIST.md`: select relevant regression scenarios; this is not an every-task test suite.

## Evidence and data boundaries

Preserve originals, user edits, backups and unrelated work. Normalize density with one uniform scale, never stretch images to conceal differences. Each side has its own original-pixel bounds; canvas, issue crops and exports use the same bounds. Unsupported measurements stay qualitative.

A failed, incomplete or incomparable check is not a pass. Similarity and issue count are not reviewer sign-off. Ignoring is reversible; screen results are isolated. Distinguish a new history-based review round from the explicitly confirmed overwrite/rerun action. Do not silently discard findings to repair pairing.

Keep the bridge bound to `127.0.0.1`, preserve token checks and authenticated-provider detection. Codex is the currently supported image provider; use its configured model. Do not persist/expose credentials or transfer evidence to an unapproved destination.

## Completion and validation

Carry authorized work through implementation and relevant verification. Make routine reversible choices without another approval; respect explicit stop/review requests. A successful build alone does not prove an interaction or an AI finding.

- Docs/metadata: check references and conflicting contracts; no app build or AI calls needed.
- UI: run `npm run build` in `assets/shadcn-review-app/`, then test affected interactions in the served workbench. The build generates `workbench.html`; do not hand-edit it.
- Bridge/prompt: validate syntax/schema and a small representative evidence set; restart an isolated bridge to load changed prompt constants. Do not replace a user's active session just to test.
- Validation scripts: test accepted and rejected reports, including explicit legacy compatibility.

Once relevant checks pass, stop unless a change, failure or unresolved risk warrants more. Use independent disposable fixtures for local tests; preserve real source files and existing review records. Report blocked checks accurately. Do not run a full paid image batch for an unrelated UI change. Search and delegate only when useful for the task and supported by the host's rules.

Start the workbench with `node scripts/start_workbench.mjs` and use its emitted URL. Existing sessions may use another port. HTML is read per request, but bridge prompt constants require a restart. For slow builds, investigate actual files/process activity; barrel imports are a known cause, not the only possible cause.
