# Controlled capture protocol

Use this protocol when the review relies on screenshots or video frames.

## 1. Record provenance

Record for both the design and implementation:

- source path, URL, Figma file/node, build, or commit;
- capture time and operator;
- viewport CSS size and output pixel size;
- device-pixel ratio, browser/app, OS, theme, locale, and text scale;
- screen, component, route, state, data fixture, and authentication state;
- font-loading status and animation timing.

If a value is unknown, write `unknown`; do not guess.

## 2. Stabilize the implementation

- Use deterministic fixture data when possible.
- Wait for fonts, images, lazy content, and layout shifts to settle.
- Disable caret blinking, autoplay, timers, and non-essential animation.
- Use reduced motion only when it is an intended acceptance target.
- Fix the clock, random values, ads, avatars, and notification counts where possible.
- Capture each required interaction state separately.

## 3. Match the framing

- Match the logical viewport, orientation, zoom, and page state. Output pixel dimensions may differ when export density or device-pixel ratio differs.
- Match scroll position using a stable anchor, not an estimated percentage.
- Include or exclude browser chrome and OS status bars consistently.
- Avoid resampling unless the only mismatch is output density. When width and height imply one uniform scale within 0.5%, preserve the originals, infer a common logical viewport, record both scale factors, and compare normalized copies. Apply one scale factor per image to both axes; never stretch width and height independently. Align the shared viewport origin at the top-left and crop only sub-pixel right/bottom excess introduced by screenshot rounding.
- Reject a pair when different content, state, crop, or breakpoint makes it non-comparable.

## 4. Define masks

Mask only pre-approved dynamic regions. Store masks as source-pixel rectangles:

```json
[
  {"x": 0, "y": 0, "width": 390, "height": 47, "reason": "OS status bar"}
]
```

Do not mask a region merely because it contains a mismatch. Include the reason and approver in the report when the mask can affect the verdict.

## 5. Handle global alignment

Compare raw images first. If the whole implementation appears translated because of capture framing, diagnose with translation-only alignment. Preserve and report both raw and aligned metrics.

Do not use scale to hide a different logical viewport, breakpoint, crop, or geometry defect. Density-only normalization to a proven common logical viewport is allowed; rotation, perspective, and elastic alignment are not.

## 6. Capture responsive and behavioral evidence

For responsive work, capture every contractual breakpoint plus one intermediate width when reflow risk is high. For interactive work, capture or inspect default, hover, focus-visible, pressed, disabled, loading, error, empty, and success states as applicable.

A full-page screenshot shows one rendering only. It does not prove sticky behavior, keyboard order, animation timing, reduced motion, touch targets, zoom behavior, or screen-reader semantics.
