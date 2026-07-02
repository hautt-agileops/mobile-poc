#!/usr/bin/env python3
"""Render game_config.json into a print-ready GDD .pdf.

Usage:
    python scripts/generate_gdd_pdf.py --config game_config.json --output "Title_GDD_v01.pdf"

Needs: fpdf2==2.8.3
"""
import argparse

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from _config import load_config, meta_line

ACCENT = (31, 78, 121)
MUTED = (96, 96, 96)


def _txt(s):
    """fpdf2 core fonts are latin-1; drop unencodable chars gracefully."""
    return str(s).encode("latin-1", "replace").decode("latin-1")


def _mc(pdf, w, h, text, align="L"):
    """multi_cell that always returns the cursor to the left margin on a new
    line — fpdf2's default leaves x at the right edge, which starves the next
    w=0 multi_cell of horizontal space."""
    pdf.multi_cell(w, h, text, align=align, new_x=XPos.LMARGIN, new_y=YPos.NEXT)


class GDD(FPDF):
    def __init__(self, title):
        super().__init__(format="A4")
        self.doc_title = title
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(20, 18, 20)

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-15)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 10, _txt(f"{self.doc_title}   |   p. {self.page_no()}"),
                  align="C")


def _cover(pdf, meta):
    pdf.add_page()
    pdf.ln(70)
    pdf.set_font("Helvetica", "B", 32)
    pdf.set_text_color(*ACCENT)
    _mc(pdf,0, 14, _txt(meta["title"]), align="C")
    if meta.get("subtitle"):
        pdf.set_font("Helvetica", "I", 15)
        pdf.set_text_color(*MUTED)
        pdf.ln(2)
        _mc(pdf,0, 9, _txt(meta["subtitle"]), align="C")
    if meta.get("tagline"):
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)
        _mc(pdf,0, 7, _txt(meta["tagline"]), align="C")
    pdf.ln(30)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*MUTED)
    _mc(pdf,0, 7, _txt(meta_line(meta)), align="C")
    footer_bits = [b for b in (meta.get("studio"), meta.get("author"),
                               meta.get("date")) if b]
    if footer_bits:
        _mc(pdf,0, 7, _txt("   |   ".join(footer_bits)), align="C")


def _table(pdf, tbl):
    headers = tbl.get("headers", [])
    rows = tbl.get("rows", [])
    if tbl.get("caption"):
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(*MUTED)
        _mc(pdf,0, 5, _txt(tbl["caption"]))
    ncols = len(headers) or (len(rows[0]) if rows else 1)
    w = (pdf.w - pdf.l_margin - pdf.r_margin) / ncols
    pdf.set_text_color(0, 0, 0)
    if headers:
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(230, 236, 245)
        for h in headers:
            pdf.cell(w, 7, _txt(h), border=1, fill=True)
        pdf.ln()
    pdf.set_font("Helvetica", "", 9)
    for row in rows:
        for i in range(ncols):
            val = row[i] if i < len(row) else ""
            pdf.cell(w, 6, _txt(val), border=1)
        pdf.ln()
    pdf.ln(3)


def _body(pdf, block):
    if block.get("body"):
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(0, 0, 0)
        for para in str(block["body"]).split("\n\n"):
            para = para.strip()
            if para:
                _mc(pdf,0, 6, _txt(para))
                pdf.ln(1)
    for b in block.get("bullets", []):
        pdf.set_font("Helvetica", "", 11)
        _mc(pdf,0, 6, _txt(f"  -  {b}"))
    for tbl in block.get("tables", []):
        _table(pdf, tbl)


def build(cfg, output):
    meta = cfg["meta"]
    pdf = GDD(meta["title"])
    _cover(pdf, meta)

    pdf.add_page()
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*ACCENT)
    _mc(pdf,0, 10, "Table of Contents")
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(0, 0, 0)
    for sec in cfg["sections"]:
        _mc(pdf,0, 7, _txt(sec.get("heading", "Untitled")))

    for sec in cfg["sections"]:
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(*ACCENT)
        _mc(pdf,0, 9, _txt(sec.get("heading", "Untitled")))
        pdf.ln(1)
        _body(pdf, sec)
        for sub in sec.get("subsections", []):
            pdf.set_font("Helvetica", "B", 13)
            pdf.set_text_color(*ACCENT)
            _mc(pdf,0, 8, _txt(sub.get("heading", "")))
            _body(pdf, sub)

    pdf.output(output)
    print(f"wrote {output}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()
    build(load_config(args.config), args.output)


if __name__ == "__main__":
    main()
