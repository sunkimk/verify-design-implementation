# Runtime detection

`scripts/start_workbench.mjs` defines the actual prompt and structured schemas. It invokes authenticated Codex with images in an ephemeral read-only temporary workspace. Project AGENTS/Skill text is not copied into that request. Keep behavior-critical evidence rules in the runtime prompt; editing Markdown alone does not change model calls.

## Contracts

- Full-image diagnostics: `reports` containing comparison relations, verdict FAIL/REVIEW/VISUAL_OK, detected platform, issues and metrics. Each issue has kind implementation/standard/advice/blocker and independent original-pixel bounds. The executable schema is authoritative for this transport.
- Crop diagnostics: verdict ISSUE/UNCERTAIN/MATCH, kind and issue fields. Do not force full-page checks onto a local crop or classify an ordinary crop mismatch as a whole-screen blocker.
- Formal acceptance JSON is a separate reviewer artifact: PASS/CONDITIONAL_PASS/FAIL, evidence, coverage, decisions and owners. Only this artifact uses `validate_acceptance_report.py`. VISUAL_OK never automatically maps to PASS; human-approved gate/coverage must support the latter. Preserve existing transport field names and enums.

## Prompt changes

Compare the images directly; candidate regions aid location and are not ground truth. Require supported findings, quiet handling of dynamic sample data/rendering noise, independent content defects and shared-cause grouping. Preserve ZYMIX standards as standards findings, not implementation mismatches. Unknown platform/scale must stay unknown; prefer qualitative descriptions to invented numbers.

Use one copy of each rule per call. Keep local crop scope explicit. Do not add unconditional per-element enumeration or claims that every non-exempt difference is a defect. Keep configured Codex model, supported low reasoning default and low verbosity unless measured quality or user intent warrants a separate change.

## Verify and operate

Check syntax and schema, then use a bounded representative set: identical pair, clear difference, incomparable pair, dynamic content, and cross-platform where relevant. Do not run a full paid batch for pure UI changes. Preserve actual source files and existing histories; use an isolated bridge on an available port for prompt validation. Restart is required to load changed constants. Preserve localhost binding, token checks, authentication detection and evidence cleanup.

## Shared-component coverage
Do not stop the whole review for search/keyboard/list/background-state differences when shared components remain comparable. Normalize logical scale once, anchor to the component edge, and check container geometry separately from internal title/subtitle/close controls and search icon/text geometry. Merge only shared causes; a broad box must not suppress independent child differences. Keep explicit coverage limitations and REVIEW/FAIL when necessary.

For repeated avatars/icons, distinguish element bounds from center pitch, edge gaps and container padding. Equal-sized elements with wider pitch are a layout spacing issue; changing photos or independently scaled crops is not proof of a shape change.
