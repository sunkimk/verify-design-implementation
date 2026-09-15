#!/usr/bin/env python3
"""Validate the minimum JSON contract for a design acceptance report."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


VERDICTS = {"PASS", "CONDITIONAL_PASS", "FAIL"}
SEVERITIES = {"P0", "P1", "P2"}
CONFIDENCE = {"high", "medium", "low"}
EVIDENCE_LEVELS = {"E1", "E2", "E3"}
COVERAGE_STATUSES = {"covered", "blocked", "out_of_scope", "not_run"}
DISPOSITIONS = {"open", "accepted", "deferred", "fixed"}
CATEGORIES = {
    "content-state",
    "structure-geometry",
    "typography",
    "visual-style",
    "asset-iconography",
    "responsive",
    "interaction-motion",
    "accessibility",
    "evidence-capture",
}
ISSUE_REQUIRED = {
    "id",
    "title",
    "severity",
    "confidence",
    "evidence_level",
    "category",
    "owner",
    "disposition",
    "scope",
    "expected",
    "actual",
    "impact",
    "sources",
    "recommendation",
    "verification",
}


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def nonempty_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate(data: Any, *, allow_legacy_p3: bool = False) -> list[str]:
    severities = SEVERITIES | ({"P3"} if allow_legacy_p3 else set())
    errors: list[str] = []
    require(isinstance(data, dict), "report must be a JSON object", errors)
    if not isinstance(data, dict):
        return errors

    for key in ("schema_version", "verdict", "scope", "evidence", "coverage", "assumptions", "exclusions", "issues", "observations", "summary"):
        require(key in data, f"missing top-level key: {key}", errors)
    require(data.get("schema_version") == "1.0", "schema_version must be '1.0'", errors)
    require(data.get("verdict") in VERDICTS, f"verdict must be one of {sorted(VERDICTS)}", errors)

    scope = data.get("scope")
    require(isinstance(scope, dict), "scope must be an object", errors)
    if isinstance(scope, dict):
        for key in ("design_source", "implementation_source", "policy"):
            require(nonempty_text(scope.get(key)), f"scope.{key} must be non-empty text", errors)

    evidence = data.get("evidence")
    require(isinstance(evidence, dict), "evidence must be an object", errors)
    if isinstance(evidence, dict):
        require(evidence.get("level") in EVIDENCE_LEVELS, f"evidence.level must be one of {sorted(EVIDENCE_LEVELS)}", errors)
        require(isinstance(evidence.get("sources"), list) and len(evidence["sources"]) > 0, "evidence.sources must be a non-empty array", errors)
        require(isinstance(evidence.get("transforms"), list), "evidence.transforms must be an array", errors)
        require(isinstance(evidence.get("masks"), list), "evidence.masks must be an array", errors)

    coverage = data.get("coverage")
    require(isinstance(coverage, list) and len(coverage) > 0, "coverage must be a non-empty array", errors)
    if isinstance(coverage, list):
        for index, row in enumerate(coverage):
            require(isinstance(row, dict), f"coverage[{index}] must be an object", errors)
            if not isinstance(row, dict):
                continue
            for key in ("screen", "state", "viewport", "platform"):
                require(nonempty_text(row.get(key)), f"coverage[{index}].{key} must be non-empty text", errors)
            require(row.get("status") in COVERAGE_STATUSES, f"coverage[{index}].status is invalid", errors)

    for key in ("assumptions", "exclusions", "observations"):
        require(isinstance(data.get(key), list), f"{key} must be an array", errors)

    issues = data.get("issues")
    require(isinstance(issues, list), "issues must be an array", errors)
    ids: set[str] = set()
    counts: Counter[str] = Counter()
    if isinstance(issues, list):
        for index, issue in enumerate(issues):
            prefix = f"issues[{index}]"
            require(isinstance(issue, dict), f"{prefix} must be an object", errors)
            if not isinstance(issue, dict):
                continue
            missing = ISSUE_REQUIRED - issue.keys()
            for key in sorted(missing):
                errors.append(f"{prefix} missing key: {key}")
            issue_id = issue.get("id")
            require(nonempty_text(issue_id), f"{prefix}.id must be non-empty text", errors)
            if nonempty_text(issue_id):
                require(issue_id not in ids, f"duplicate issue id: {issue_id}", errors)
                ids.add(issue_id)
            for key in ("title", "scope", "expected", "actual", "impact", "recommendation", "verification"):
                require(nonempty_text(issue.get(key)), f"{prefix}.{key} must be non-empty text", errors)
            require(nonempty_text(issue.get("owner")), f"{prefix}.owner must be non-empty text", errors)
            require(issue.get("disposition") in DISPOSITIONS, f"{prefix}.disposition is invalid", errors)
            severity = issue.get("severity")
            require(severity in severities, f"{prefix}.severity is invalid", errors)
            if severity in severities:
                counts[severity] += 1
            require(issue.get("confidence") in CONFIDENCE, f"{prefix}.confidence is invalid", errors)
            require(issue.get("evidence_level") in EVIDENCE_LEVELS, f"{prefix}.evidence_level is invalid", errors)
            require(issue.get("category") in CATEGORIES, f"{prefix}.category is invalid", errors)
            require(isinstance(issue.get("sources"), list) and len(issue["sources"]) > 0, f"{prefix}.sources must be a non-empty array", errors)
            if "location" in issue:
                location = issue["location"]
                require(isinstance(location, dict), f"{prefix}.location must be an object", errors)
                if isinstance(location, dict):
                    for key in ("x", "y", "width", "height", "unit"):
                        require(key in location, f"{prefix}.location missing key: {key}", errors)
                    for key in ("x", "y", "width", "height"):
                        require(isinstance(location.get(key), (int, float)), f"{prefix}.location.{key} must be numeric", errors)
                    require((location.get("width") or 0) > 0 and (location.get("height") or 0) > 0, f"{prefix}.location width and height must be positive", errors)

    summary = data.get("summary")
    require(isinstance(summary, dict), "summary must be an object", errors)
    if isinstance(summary, dict):
        for severity in sorted(severities):
            key = severity.lower()
            require(isinstance(summary.get(key), int) and summary[key] >= 0, f"summary.{key} must be a non-negative integer", errors)
            if isinstance(summary.get(key), int):
                require(summary[key] == counts[severity], f"summary.{key} does not match issues", errors)

    if isinstance(summary, dict) and not allow_legacy_p3 and "p3" in summary:
        require(summary["p3"] == 0, "summary.p3 requires --allow-legacy-p3 for historical reports", errors)

    verdict = data.get("verdict")
    blocking_coverage = isinstance(coverage, list) and any(
        isinstance(row, dict) and row.get("status") in {"blocked", "not_run"} for row in coverage
    )
    unresolved_blocker = isinstance(issues, list) and any(
        isinstance(issue, dict)
        and issue.get("severity") in {"P0", "P1"}
        and issue.get("disposition") in {"open", "deferred"}
        for issue in issues
    )
    accepted_residual = isinstance(issues, list) and any(
        isinstance(issue, dict) and issue.get("disposition") == "accepted" for issue in issues
    )
    if verdict == "PASS":
        require(not unresolved_blocker, "PASS cannot include unresolved P0 or P1 issues", errors)
        require(not accepted_residual, "PASS cannot include accepted residual issues; use CONDITIONAL_PASS", errors)
        require(not blocking_coverage, "PASS cannot include blocked or not_run coverage", errors)
    if verdict == "CONDITIONAL_PASS":
        require(not unresolved_blocker, "CONDITIONAL_PASS cannot include open or deferred P0/P1 issues", errors)

    policy = scope.get("policy", "") if isinstance(scope, dict) else ""
    if isinstance(policy, str) and "provisional" in policy.lower() and isinstance(issues, list):
        for index, issue in enumerate(issues):
            if not isinstance(issue, dict) or issue.get("severity") != "P2":
                continue
            require(issue.get("disposition") != "open", f"issues[{index}] P2 needs an accept, defer, or fixed decision under the provisional policy", errors)

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--allow-legacy-p3", action="store_true", help="Validate unchanged historical P3 reports without migrating them")
    args = parser.parse_args()
    try:
        data = json.loads(args.report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"INVALID: {exc}")
        return 1
    errors = validate(data, allow_legacy_p3=args.allow_legacy_p3)
    if errors:
        print("INVALID")
        for error in errors:
            print(f"- {error}")
        return 1
    print("VALID")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
