#!/usr/bin/env python3
"""Render a single-page game concept sheet (.pdf) for cold outreach.

Two input modes (config wins when both given):
    python scripts/generate_one_pager_pdf.py --config game_config.json --output out.pdf
    python scripts/generate_one_pager_pdf.py --title "GAME" --genre "Genre" \
        --platform "Platform" --tagline "..." --output out.pdf

Config source: config.one_pager (falls back to config.meta for title/genre/etc).
Needs: fpdf2==2.8.3
"""
import argparse
import json
import sys
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

ACCENT = (31, 78, 121)
MUTED = (96, 96, 96)


def _txt(s):
    return str(s).encode("latin-1", "replace").decode("latin-1")


def _mc(pdf, w, h, text, align="L"):
    """multi_cell that returns cursor to the left margin (see gdd_pdf note)."""
    pdf.multi_cell(w, h, text, align=align, new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def _from_config(path):
    p = Path(path)
    if not p.is_file():
        sys.exit(f"error: config not found: {path}")
    cfg = json.loads(p.read_text(encoding="utf-8"))
    meta = cfg.get("meta", {})
    op = cfg.get("one_pager", {})
    return {
        "title": op.get("title") or meta.get("title"),
        "genre": op.get("genre") or meta.get("genre"),
        "platform": op.get("platform") or meta.get("platform"),
        "tagline": op.get("tagline") or meta.get("tagline") or meta.get("subtitle"),
        "pillars": op.get("pillars", []),
        "usp": op.get("usp"),
        "target": op.get("target") or meta.get("audience"),
        "monetization": op.get("monetization"),
        "contact": op.get("contact") or meta.get("author"),
    }


def _heading(pdf, text):
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*ACCENT)
    _mc(pdf,0, 7, _txt(text))
    pdf.set_text_color(0, 0, 0)


def build(d, output):
    if not d.get("title"):
        sys.exit("error: a title is required (--title or config)")
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margins(18, 16, 18)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(*ACCENT)
    _mc(pdf,0, 12, _txt(d["title"]))
    descriptor = "  ·  ".join(x for x in (d.get("genre"), d.get("platform")) if x)
    if descriptor:
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(*MUTED)
        _mc(pdf,0, 6, _txt(descriptor))
    if d.get("tagline"):
        pdf.ln(1)
        pdf.set_font("Helvetica", "I", 13)
        pdf.set_text_color(0, 0, 0)
        _mc(pdf,0, 7, _txt(d["tagline"]))

    if d.get("usp"):
        _heading(pdf, "Unique Selling Point")
        pdf.set_font("Helvetica", "", 11)
        _mc(pdf,0, 6, _txt(d["usp"]))

    if d.get("pillars"):
        _heading(pdf, "Design Pillars")
        pdf.set_font("Helvetica", "", 11)
        for p in d["pillars"]:
            _mc(pdf,0, 6, _txt(f"  -  {p}"))

    for label, key in (("Target Audience", "target"),
                       ("Monetization", "monetization"),
                       ("Contact", "contact")):
        if d.get(key):
            _heading(pdf, label)
            pdf.set_font("Helvetica", "", 11)
            _mc(pdf,0, 6, _txt(d[key]))

    pdf.output(output)
    print(f"wrote {output}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config")
    ap.add_argument("--title")
    ap.add_argument("--genre")
    ap.add_argument("--platform")
    ap.add_argument("--tagline")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    if args.config:
        d = _from_config(args.config)
        # CLI flags override config when explicitly passed
        for k in ("title", "genre", "platform", "tagline"):
            v = getattr(args, k)
            if v:
                d[k] = v
    else:
        d = {"title": args.title, "genre": args.genre,
             "platform": args.platform, "tagline": args.tagline}
    build(d, args.output)


if __name__ == "__main__":
    main()
