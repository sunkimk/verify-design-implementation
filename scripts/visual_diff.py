#!/usr/bin/env python3
"""Create reproducible candidate-difference artifacts for a controlled image pair.

This script performs evidence collection, not design sign-off. It never assigns
product severity or a pass/fail verdict.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("design", type=Path)
    parser.add_argument("implementation", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--mask-file", type=Path)
    parser.add_argument(
        "--align",
        choices=("none", "translation"),
        default="none",
        help="Diagnose capture translation; raw metrics are always preserved.",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=24,
        help="Per-pixel maximum RGB difference threshold, 0-255 (default: 24).",
    )
    parser.add_argument(
        "--min-region-area",
        type=int,
        default=16,
        help="Minimum connected candidate area in pixels (default: 16).",
    )
    return parser.parse_args()


def load_rgb(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        return np.asarray(image.convert("RGB"), dtype=np.uint8)


def load_masks(path: Path | None, width: int, height: int) -> tuple[np.ndarray, list[dict[str, Any]]]:
    included = np.ones((height, width), dtype=bool)
    if path is None:
        return included, []
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("Mask file must be a JSON array of rectangles")
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(data):
        if not isinstance(item, dict):
            raise ValueError(f"Mask {index} must be an object")
        try:
            x = int(item["x"])
            y = int(item["y"])
            w = int(item["width"])
            h = int(item["height"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Mask {index} needs integer x, y, width, height") from exc
        if w <= 0 or h <= 0:
            raise ValueError(f"Mask {index} must have positive width and height")
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(width, x + w), min(height, y + h)
        if x0 >= x1 or y0 >= y1:
            raise ValueError(f"Mask {index} does not intersect the image")
        included[y0:y1, x0:x1] = False
        normalized.append({**item, "x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0})
    return included, normalized


def estimate_translation(
    design: np.ndarray, implementation: np.ndarray
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    design_gray = cv2.cvtColor(design, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    impl_gray = cv2.cvtColor(implementation, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    warp = np.eye(2, 3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-6)
    try:
        score, warp = cv2.findTransformECC(design_gray, impl_gray, warp, cv2.MOTION_TRANSLATION, criteria)
    except cv2.error as exc:
        raise RuntimeError("Translation alignment failed; compare the raw pair or recapture it") from exc
    aligned = cv2.warpAffine(
        implementation,
        warp,
        (design.shape[1], design.shape[0]),
        flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0),
    )
    valid_source = np.ones(design.shape[:2], dtype=np.uint8) * 255
    valid = cv2.warpAffine(
        valid_source,
        warp,
        (design.shape[1], design.shape[0]),
        flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    ) > 0
    return aligned, valid, {
        "mode": "translation",
        "estimated_dx_px": float(warp[0, 2]),
        "estimated_dy_px": float(warp[1, 2]),
        "ecc_score": float(score),
        "warning": "Diagnostic transform only; do not use it to excuse implementation geometry.",
    }


def ssim_map(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    a_gray = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY).astype(np.float64)
    b_gray = cv2.cvtColor(b, cv2.COLOR_RGB2GRAY).astype(np.float64)
    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2
    mu_a = cv2.GaussianBlur(a_gray, (11, 11), 1.5)
    mu_b = cv2.GaussianBlur(b_gray, (11, 11), 1.5)
    mu_a2, mu_b2, mu_ab = mu_a * mu_a, mu_b * mu_b, mu_a * mu_b
    sigma_a2 = cv2.GaussianBlur(a_gray * a_gray, (11, 11), 1.5) - mu_a2
    sigma_b2 = cv2.GaussianBlur(b_gray * b_gray, (11, 11), 1.5) - mu_b2
    sigma_ab = cv2.GaussianBlur(a_gray * b_gray, (11, 11), 1.5) - mu_ab
    numerator = (2 * mu_ab + c1) * (2 * sigma_ab + c2)
    denominator = (mu_a2 + mu_b2 + c1) * (sigma_a2 + sigma_b2 + c2)
    return np.clip(numerator / np.maximum(denominator, 1e-12), -1.0, 1.0)


def measure(design: np.ndarray, implementation: np.ndarray, included: np.ndarray, threshold: int) -> tuple[dict[str, Any], np.ndarray, np.ndarray]:
    absolute = np.abs(design.astype(np.int16) - implementation.astype(np.int16)).astype(np.uint8)
    per_pixel = absolute.max(axis=2)
    candidate = (per_pixel >= threshold) & included
    values = per_pixel[included]
    structural_design = design.copy()
    structural_implementation = implementation.copy()
    structural_implementation[~included] = structural_design[~included]
    ssim_values = ssim_map(structural_design, structural_implementation)[included]
    design_edges = cv2.Canny(cv2.cvtColor(structural_design, cv2.COLOR_RGB2GRAY), 100, 200) > 0
    impl_edges = cv2.Canny(cv2.cvtColor(structural_implementation, cv2.COLOR_RGB2GRAY), 100, 200) > 0
    edge_xor = (design_edges ^ impl_edges) & included
    metrics = {
        "included_pixels": int(included.sum()),
        "masked_pixels": int((~included).sum()),
        "candidate_pixels": int(candidate.sum()),
        "candidate_pixel_ratio": float(candidate.sum() / max(included.sum(), 1)),
        "mean_max_channel_difference": float(values.mean()) if values.size else 0.0,
        "p95_max_channel_difference": float(np.percentile(values, 95)) if values.size else 0.0,
        "mean_ssim": float(ssim_values.mean()) if ssim_values.size else 1.0,
        "edge_mismatch_ratio": float(edge_xor.sum() / max(included.sum(), 1)),
        "threshold": threshold,
    }
    return metrics, absolute, candidate


def find_regions(candidate: np.ndarray, difference: np.ndarray, min_area: int) -> list[dict[str, Any]]:
    binary = candidate.astype(np.uint8) * 255
    kernel = np.ones((3, 3), dtype=np.uint8)
    grouped = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)
    contours, _ = cv2.findContours(grouped, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    regions: list[dict[str, Any]] = []
    per_pixel = difference.max(axis=2)
    for contour in contours:
        x, y, width, height = cv2.boundingRect(contour)
        area = int(cv2.contourArea(contour))
        if area < min_area:
            continue
        local_candidate = candidate[y : y + height, x : x + width]
        local_difference = per_pixel[y : y + height, x : x + width][local_candidate]
        regions.append(
            {
                "x": int(x),
                "y": int(y),
                "width": int(width),
                "height": int(height),
                "contour_area": area,
                "candidate_pixels": int(local_candidate.sum()),
                "mean_difference": float(local_difference.mean()) if local_difference.size else 0.0,
                "max_difference": int(local_difference.max()) if local_difference.size else 0,
            }
        )
    regions.sort(key=lambda item: (-item["candidate_pixels"], item["y"], item["x"]))
    for index, region in enumerate(regions, 1):
        region["candidate_id"] = f"VD-{index:03d}"
    return regions


def save_artifacts(output_dir: Path, design: np.ndarray, implementation: np.ndarray, difference: np.ndarray, candidate: np.ndarray, regions: list[dict[str, Any]]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    overlay = ((design.astype(np.uint16) + implementation.astype(np.uint16)) // 2).astype(np.uint8)
    heatmap = implementation.copy()
    heatmap[candidate] = (0.35 * heatmap[candidate] + 0.65 * np.array([255, 0, 48])).astype(np.uint8)
    annotated = implementation.copy()
    for region in regions:
        x, y, width, height = (region[key] for key in ("x", "y", "width", "height"))
        cv2.rectangle(annotated, (x, y), (x + width - 1, y + height - 1), (255, 0, 48), 2)
        cv2.putText(annotated, region["candidate_id"], (x, max(12, y - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 0, 48), 1, cv2.LINE_AA)
    Image.fromarray(overlay).save(output_dir / "overlay.png")
    Image.fromarray(np.clip(difference * 4, 0, 255).astype(np.uint8)).save(output_dir / "difference-amplified.png")
    Image.fromarray(heatmap).save(output_dir / "candidate-heatmap.png")
    Image.fromarray(annotated).save(output_dir / "candidate-regions.png")


def main() -> int:
    args = parse_args()
    if not 0 <= args.threshold <= 255:
        raise SystemExit("--threshold must be between 0 and 255")
    design = load_rgb(args.design)
    implementation = load_rgb(args.implementation)
    if design.shape != implementation.shape:
        raise SystemExit(
            f"Images are not comparable: design {design.shape[1]}x{design.shape[0]}, "
            f"implementation {implementation.shape[1]}x{implementation.shape[0]}. "
            "Recapture at the same dimensions; this script will not rescale evidence."
        )

    height, width = design.shape[:2]
    included, masks = load_masks(args.mask_file, width, height)
    raw_metrics, raw_difference, raw_candidate = measure(design, implementation, included, args.threshold)
    result: dict[str, Any] = {
        "schema_version": "1.0",
        "purpose": "candidate evidence only; not an acceptance verdict",
        "design": str(args.design),
        "implementation": str(args.implementation),
        "width": width,
        "height": height,
        "masks": masks,
        "raw_metrics": raw_metrics,
        "alignment": {"mode": "none"},
    }

    compared = implementation
    difference = raw_difference
    candidate = raw_candidate
    if args.align == "translation":
        compared, valid_alignment_pixels, alignment = estimate_translation(design, implementation)
        aligned_included = included & valid_alignment_pixels
        alignment["invalid_border_pixels_excluded"] = int((included & ~valid_alignment_pixels).sum())
        aligned_metrics, difference, candidate = measure(design, compared, aligned_included, args.threshold)
        result["alignment"] = alignment
        result["aligned_metrics"] = aligned_metrics

    regions = find_regions(candidate, difference, args.min_region_area)
    result["candidate_regions"] = regions
    save_artifacts(args.output_dir, design, compared, difference, candidate, regions)
    (args.output_dir / "metrics.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output_dir": str(args.output_dir), "candidate_regions": len(regions), **raw_metrics}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
