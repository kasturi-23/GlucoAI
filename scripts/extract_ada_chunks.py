#!/usr/bin/env python3
"""
ADA Standards of Care in Diabetes 2026 — PDF chunk extractor.
Extracts Section 5 (Nutrition, pp 94-130) and Section 2 (Glucose, pp 32-55).
Outputs ./data/ada_chunks.json with ~250-320 tagged chunks.

Usage:
  pip install pdfplumber
  python3 scripts/extract_ada_chunks.py
"""

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

try:
    import pdfplumber
except ImportError:
    print("ERROR: pdfplumber not installed.  Run: pip install pdfplumber")
    sys.exit(1)

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT     = Path(__file__).parent.parent
PDF_PATH = ROOT / "data" / "standards-of-care-2026.pdf"
OUT_PATH = ROOT / "data" / "ada_chunks.json"

if not PDF_PATH.exists():
    print(f"ERROR: PDF not found at {PDF_PATH}")
    print("Place standards-of-care-2026.pdf in the ./data/ directory first.")
    sys.exit(1)

# ── Page ranges (zero-indexed) ─────────────────────────────────────────────────
PAGE_RANGES = [
    (32,  55,  "Section 2"),   # Glucose Classification Thresholds
    (94,  130, "Section 5"),   # Nutrition & Health Behaviors (PRIMARY)
]

# ── Chunking parameters ────────────────────────────────────────────────────────
CHUNK_WORDS    = 500
OVERLAP_WORDS  = 80
MIN_CHUNK_WORDS = 40

# ── Tag detection keyword map ──────────────────────────────────────────────────
TAG_MAP = {
    "mnt_recommendations": [
        "5.13", "5.14", "5.15", "5.20", "5.21", "5.24",
        "5.25", "5.29", "5.30", "5.31", "medical nutrition",
    ],
    "carbohydrate": [
        "carbohydrate", "glycemic index", "glycemic load",
        "fiber", "refined grain", "whole grain", "sugar",
    ],
    "protein": [
        "protein", "plant protein", "legume", "bean", "lentil",
    ],
    "fat": [
        "fat", "saturated fat", "mediterranean", "olive oil",
    ],
    "sodium": [
        "sodium", "salt", "processed food", "ultra-processed",
    ],
    "alcohol": [
        "alcohol", "hypoglycemia risk",
    ],
    "weight": [
        "weight loss", "obesity", "overweight", "calorie",
    ],
    "eating_patterns": [
        "mediterranean", "dash", "plate method", "meal plan",
        "eating pattern", "vegetarian", "vegan",
    ],
    "glucose_classification": [
        " 70 ", " 99 ", "100", "125", "126", "a1c", "prediabetes",
        "fasting glucose", "diagnosis",
    ],
}

# ── Noise patterns to strip ────────────────────────────────────────────────────
NOISE_PATTERNS = [
    re.compile(r"diabetesjournals\.org/care", re.IGNORECASE),
    re.compile(r"S\d{1,3}\s+Facilitating[^\n]*", re.IGNORECASE),
    re.compile(r"Diabetes Care\s+Volume\s+\d+[^\n]*", re.IGNORECASE),
    re.compile(r"Downloaded from[^\n]*", re.IGNORECASE),
    re.compile(r"Copyright\s*©[^\n]*", re.IGNORECASE),
    # Single-char artifact lines common in PDF extraction
    re.compile(r"(?m)^[a-zA-Z\d]\s*$"),
    # Lines that are just digits (page numbers)
    re.compile(r"(?m)^\d{1,4}\s*$"),
]


def clean_text(raw: str) -> str:
    text = raw
    for pattern in NOISE_PATTERNS:
        text = pattern.sub("", text)
    # Collapse 3+ newlines → double newline
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Collapse excessive spaces
    text = re.sub(r"[ \t]{2,}", " ", text)
    # Strip leading/trailing whitespace from lines
    lines = [ln.strip() for ln in text.split("\n")]
    # Remove lines that are entirely punctuation/digits (PDF artifacts)
    lines = [ln for ln in lines if len(ln) > 2 or ln == ""]
    return "\n".join(lines).strip()


def detect_tags(text: str) -> list[str]:
    low = text.lower()
    tags = []
    for tag, keywords in TAG_MAP.items():
        if any(kw.lower() in low for kw in keywords):
            tags.append(tag)
    return tags


def sliding_window_chunks(text: str, window: int, overlap: int) -> list[str]:
    words = text.split()
    step  = window - overlap
    chunks = []
    i = 0
    while i < len(words):
        chunk_words = words[i : i + window]
        chunks.append(" ".join(chunk_words))
        i += step
    return chunks


def extract_and_chunk() -> list[dict]:
    all_chunks = []
    global_chunk_idx = 0

    print(f"Opening {PDF_PATH.name} …")
    with pdfplumber.open(PDF_PATH) as pdf:
        total_pages = len(pdf.pages)
        print(f"  Total pages in PDF: {total_pages}")

        for (start_page, end_page, section_label) in PAGE_RANGES:
            if end_page >= total_pages:
                end_page = total_pages - 1
            print(f"  Extracting {section_label}: pages {start_page}–{end_page} …")

            section_text_parts = []
            for page_idx in range(start_page, end_page + 1):
                page = pdf.pages[page_idx]
                raw  = page.extract_text(x_tolerance=2, y_tolerance=2) or ""
                cleaned = clean_text(raw)
                if cleaned:
                    section_text_parts.append((page_idx, cleaned))

            # Chunk each page's text independently so we retain page numbers
            for (pdf_page, page_text) in section_text_parts:
                raw_chunks = sliding_window_chunks(page_text, CHUNK_WORDS, OVERLAP_WORDS)
                for local_idx, chunk_text in enumerate(raw_chunks):
                    word_count = len(chunk_text.split())
                    if word_count < MIN_CHUNK_WORDS:
                        continue

                    chunk_id = f"ada2026_p{pdf_page}_c{local_idx}"
                    tags     = detect_tags(chunk_text)

                    all_chunks.append({
                        "id":          chunk_id,
                        "source":      "ADA Standards of Care in Diabetes 2026",
                        "document":    "standards-of-care-2026.pdf",
                        "journal_ref": "Diabetes Care 2026;49(Suppl. 1)",
                        "section":     section_label,
                        "pdf_page":    pdf_page,
                        "chunk_index": global_chunk_idx,
                        "tags":        tags,
                        "text":        chunk_text,
                    })
                    global_chunk_idx += 1

    return all_chunks


def main():
    chunks = extract_and_chunk()

    print(f"\n── Extraction summary ──────────────────────────")
    print(f"  Total chunks : {len(chunks)}")
    tag_counts = {}
    for c in chunks:
        for t in c["tags"]:
            tag_counts[t] = tag_counts.get(t, 0) + 1
    for tag, count in sorted(tag_counts.items(), key=lambda x: -x[1]):
        print(f"  {tag:<28} {count} chunks")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(chunks, f, indent=2, ensure_ascii=False)

    print(f"\n✓ Wrote {len(chunks)} chunks → {OUT_PATH}")
    if len(chunks) < 100:
        print("  WARNING: fewer chunks than expected — check PDF page ranges.")


if __name__ == "__main__":
    main()
