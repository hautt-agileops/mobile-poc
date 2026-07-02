"""Shared config loader for the GDD generator scripts.

game_config.json shape (all keys optional except meta.title):

{
  "meta": {
    "title": "Game Title",          # required
    "subtitle": "One-line hook",
    "tagline": "Elevator pitch",
    "genre": "Action Roguelike",
    "platform": "PC / Switch",
    "audience": "Core 18-34",
    "version": "v0.1",
    "author": "Jane Dev",
    "studio": "Studio Name",
    "date": "2026-07-02"
  },
  "sections": [
    {
      "heading": "1. Executive Summary",
      "body": "Paragraph.\n\nAnother paragraph.",
      "bullets": ["Point A", "Point B"],
      "tables": [
        {"caption": "Core loop", "headers": ["Beat", "Detail"],
         "rows": [["Action", "Player attacks"], ["Reward", "Loot drops"]]}
      ],
      "subsections": [
        {"heading": "1.1 Vision", "body": "...", "bullets": [...], "tables": [...]}
      ]
    }
  ],
  "pitch": {
    "slides": [
      {"title": "The Hook", "bullets": ["...", "..."], "notes": "speaker notes"}
    ]
  },
  "one_pager": {
    "title": "GAME TITLE", "genre": "...", "platform": "...", "tagline": "...",
    "pillars": ["...", "...", "..."], "usp": "...", "target": "...",
    "monetization": "...", "contact": "..."
  }
}
"""
import json
import sys
from pathlib import Path


def load_config(path):
    p = Path(path)
    if not p.is_file():
        sys.exit(f"error: config not found: {path}")
    try:
        cfg = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"error: invalid JSON in {path}: {e}")
    if not isinstance(cfg, dict):
        sys.exit("error: config root must be a JSON object")
    cfg.setdefault("meta", {})
    cfg.setdefault("sections", [])
    if not cfg["meta"].get("title"):
        sys.exit("error: config.meta.title is required")
    return cfg


def meta_line(meta):
    """Compact 'Genre · Platform · Audience · vX' descriptor, skipping blanks."""
    parts = [meta.get("genre"), meta.get("platform"),
             meta.get("audience"), meta.get("version")]
    return "  ·  ".join(p for p in parts if p)
