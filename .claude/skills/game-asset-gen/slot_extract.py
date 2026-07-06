#!/usr/bin/env python3
"""Force even-slot sprite extraction (skip connected-component grouping).

sprite-gen's extract_sprite_row_frames.py groups pixels into frames via connected
components. That merges poses whenever a prop bridges two slots -- e.g. a fighter's
katana held low crossing into the neighbor slot -> one giant component, a degenerate
N-way split, and empty frames (observed on the `idle` row of a crimson katana duelist:
3 of 4 frames came out ~2px while the whole figure landed squished in one cell).

Our strips are ALWAYS evenly laid out because we generate them on sprite-gen's own
even layout guide, so fixed-slot slicing is both correct and robust. This driver reuses
the vendored keyer / fit-to-cell / inspection verbatim and only forces extract_slot_frames.
Drop-in replacement for `extract_sprite_row_frames.py --run-dir <run>`; same output
(frames/<state>/frame-N.png + frames-manifest.json) and same stdout JSON shape.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

# vendored sprite-gen scripts are a flat dir (not a package) -> import by path
VENDOR = Path(__file__).resolve().parent / "vendor" / "sprite-gen" / "scripts"
sys.path.insert(0, str(VENDOR))
import extract_sprite_row_frames as E  # noqa: E402
from runio import acquire_run_dir_lock, atomic_save_image, atomic_write_text  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="force even-slot sprite extraction")
    p.add_argument("--run-dir", required=True, type=Path)
    p.add_argument("--states", default="all")
    p.add_argument("--key-threshold", type=float, default=96.0)
    p.add_argument("--fringe-key-threshold", type=float, default=180.0)
    p.add_argument("--fringe-delta", type=float, default=18.0)
    # inspect_frames() reads these thresholds off the args namespace:
    p.add_argument("--min-used-pixels", type=int, default=400)
    p.add_argument("--edge-margin", type=int, default=2)
    p.add_argument("--edge-pixel-threshold", type=int, default=24)
    p.add_argument("--chroma-adjacent-threshold", type=float, default=150.0)
    p.add_argument("--chroma-adjacent-pixel-threshold", type=int, default=120)
    p.add_argument("--small-outlier-ratio", type=float, default=0.35)
    p.add_argument("--large-outlier-ratio", type=float, default=2.75)
    args = p.parse_args()
    if args.fringe_key_threshold < args.key_threshold:
        raise SystemExit("--fringe-key-threshold must be >= --key-threshold")

    run_dir = args.run_dir.expanduser().resolve()
    acquire_run_dir_lock(run_dir, "slot_extract")
    request = json.loads((run_dir / "sprite-request.json").read_text(encoding="utf-8"))
    states = (
        list(request["states"])
        if args.states == "all"
        else [s.strip() for s in args.states.split(",") if s.strip()]
    )
    cell_w, cell_h, margin_x, margin_y = E.cell_geometry(request["cell"])
    chroma = tuple(int(v) for v in request["chroma_key"]["rgb"])
    frames_root = run_dir / "frames"
    rows: list[dict] = []
    all_errors: list[str] = []
    all_warnings: list[str] = []

    for state in states:
        if state not in request["states"]:
            raise SystemExit(f"unknown state in request: {state}")
        raw_path = run_dir / "raw" / f"{state}.png"
        if not raw_path.is_file():
            all_errors.append(f"{state}: missing raw strip {raw_path}")
            continue
        frame_count = int(request["states"][state]["frames"])
        with Image.open(raw_path) as opened:
            strip = E.remove_chroma_background(
                opened, chroma, args.key_threshold, args.fringe_key_threshold, args.fringe_delta
            )
        frames = E.extract_slot_frames(strip, frame_count, cell_w, cell_h, margin_x, margin_y)

        state_dir = frames_root / state
        state_dir.mkdir(parents=True, exist_ok=True)
        files = []
        for index, frame in enumerate(frames):
            out = state_dir / f"frame-{index}.png"
            atomic_save_image(frame, out)
            files.append(str(out.relative_to(run_dir)))

        errors, warnings, records = E.inspect_frames(frames, chroma, args)
        all_errors.extend(f"{state}: {e}" for e in errors)
        all_warnings.extend(f"{state}: {w}" for w in warnings)
        rows.append({
            "state": state, "frames": frame_count, "method": "slots-forced",
            "files": files, "frame_records": records, "ok": not errors,
        })

    result = {
        "ok": not all_errors, "engine": "component-row", "run_dir": str(run_dir),
        "cell": request["cell"], "chroma_key": request["chroma_key"], "rows": rows,
        "errors": all_errors, "warnings": all_warnings,
    }
    atomic_write_text(frames_root / "frames-manifest.json", json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "rows"}, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
