# Shared-component regression

Synthetic images only; no user screenshots or private data.

Design is 375×812 @1x; implementation is 1125×2436 @3x. Shared sheet top is logical y=100. Title moves upward and grows; subtitle left inset differs; close-button circular background grows/moves, but its inner X stays the same size. Search icon shrinks with unchanged center; typed input becomes placeholder (coverage limitation, not proof of wrong implementation). Avatar circles stay 32 logical pixels; horizontal center pitch changes 56→80.

Expected: compare shared sheet despite input-state mismatch; find header/close/search/spacing differences, do not claim avatar shape change or changed X size. Use design against itself as the zero-difference control. Evaluate factual claims against this geometry, not just issue count. Full-image tests use configured Codex via the local bridge; run only on explicit detection work, not ordinary UI edits.

2026-09-13 first run found key regions and spacing; identical control returned no issues. It still overclaimed some icon properties and classified input-state mismatch as implementation, prompting rule refinement. See references/detection-lessons.md for final validation status.

Refined run passed the key boundaries: no whole-page blocker, no avatar-shape claim, no inner-X growth claim; input-state mismatch reported as advice. Header geometry, typography, search icon and avatar spacing retained.
