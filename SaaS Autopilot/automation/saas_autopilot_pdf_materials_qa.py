"""
QA checks for SaaS Autopilot downloadable PDF materials.

Checks every per-video PDF folder and fails on missing PDFs, unreadable PDFs,
blank extraction, and text positioned outside the page media box. Blueprint PDFs
are called out separately because they carry the widest tables.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader
from reportlab.pdfbase.pdfmetrics import stringWidth


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "downloadable_materials" / "video_folders"
REPORTS_DIR = ROOT / "metadata" / "qa_reports"
EXPECTED_SUFFIXES = ["blueprint", "templates", "setup_checklist"]
POSITION_TOLERANCE = 6


def pdf_text_positions(page):
    positions = []

    def visitor(text, cm, tm, font_dict, font_size):
        raw_text = str(text or "").strip()
        if not raw_text:
            return
        x = float(cm[0]) * float(tm[4]) + float(cm[2]) * float(tm[5]) + float(cm[4])
        y = float(cm[1]) * float(tm[4]) + float(cm[3]) * float(tm[5]) + float(cm[5])
        font_name = "Helvetica"
        if font_dict and font_dict.get("/BaseFont"):
            font_name = str(font_dict.get("/BaseFont")).replace("/", "").split("+")[-1]
        try:
            rendered_width = stringWidth(raw_text, font_name, float(font_size or 0))
        except Exception:
            rendered_width = 0
        positions.append({
            "text": raw_text[:80],
            "x": x,
            "y": y,
            "font_size": float(font_size or 0),
            "rendered_width": rendered_width,
        })

    try:
        text = page.extract_text(visitor_text=visitor) or ""
    except TypeError:
        text = page.extract_text() or ""
    return text, positions


def check_pdf(pdf_path: Path):
    issues = []
    warnings = []
    page_count = 0
    extracted_chars = 0
    out_of_bounds = []

    try:
        reader = PdfReader(str(pdf_path))
        page_count = len(reader.pages)
    except Exception as exc:
        return {
            "file": str(pdf_path.relative_to(ROOT)),
            "status": "failed",
            "page_count": 0,
            "extracted_chars": 0,
            "issues": [f"PDF could not be read: {exc}"],
            "warnings": [],
        }

    if page_count == 0:
        issues.append("PDF has no pages.")

    for index, page in enumerate(reader.pages, start=1):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        text, positions = pdf_text_positions(page)
        extracted_chars += len(text.strip())
        for pos in positions:
            x = pos["x"]
            y = pos["y"]
            rendered_right = x + max(pos.get("rendered_width", 0), 0)
            if x < -POSITION_TOLERANCE or rendered_right > width + POSITION_TOLERANCE:
                out_of_bounds.append({
                    "page": index,
                    "x": round(x, 2),
                    "y": round(y, 2),
                    "rendered_right": round(rendered_right, 2),
                    "page_width": round(width, 2),
                    "page_height": round(height, 2),
                    "text": pos["text"],
                })

    if extracted_chars < 80:
        issues.append("PDF text extraction is unexpectedly sparse; file may be blank or malformed.")
    if out_of_bounds:
        issues.append(f"Detected {len(out_of_bounds)} text fragment(s) outside the page bounds.")

    if "blueprint" in pdf_path.name.lower() and page_count > 6:
        warnings.append("Blueprint PDF is longer than expected; review for table wrapping or duplicate content.")

    return {
        "file": str(pdf_path.relative_to(ROOT)),
        "status": "failed" if issues else "passed",
        "page_count": page_count,
        "extracted_chars": extracted_chars,
        "out_of_bounds_samples": out_of_bounds[:10],
        "issues": issues,
        "warnings": warnings,
    }


def main():
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    results = []

    if not OUTPUT_ROOT.exists():
        results.append({
            "folder": str(OUTPUT_ROOT.relative_to(ROOT)),
            "status": "failed",
            "issues": ["PDF output folder does not exist."],
            "warnings": [],
            "files": [],
        })
    else:
        for folder in sorted(p for p in OUTPUT_ROOT.iterdir() if p.is_dir()):
            folder_issues = []
            files = []
            for suffix in EXPECTED_SUFFIXES:
                pdf_path = folder / f"{folder.name}_{suffix}.pdf"
                if not pdf_path.exists():
                    folder_issues.append(f"Missing {pdf_path.name}.")
                    continue
                files.append(check_pdf(pdf_path))

            file_failures = [item for item in files if item["status"] != "passed"]
            results.append({
                "folder": str(folder.relative_to(ROOT)),
                "video_id": folder.name,
                "status": "failed" if folder_issues or file_failures else "passed",
                "issues": folder_issues,
                "warnings": [warning for item in files for warning in item.get("warnings", [])],
                "files": files,
            })

    failed = [item for item in results if item["status"] != "passed"]
    blueprint_failures = [
        file_item
        for item in results
        for file_item in item.get("files", [])
        if "blueprint" in file_item["file"].lower() and file_item["status"] != "passed"
    ]

    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "output_root": str(OUTPUT_ROOT.relative_to(ROOT)),
        "summary": {
            "folders": len(results),
            "passed": len(results) - len(failed),
            "failed": len(failed),
            "blueprint_failures": len(blueprint_failures),
            "warnings": sum(len(item.get("warnings", [])) for item in results),
        },
        "results": results,
    }

    json_path = REPORTS_DIR / "pdf_materials_qa_report.json"
    md_path = REPORTS_DIR / "pdf_materials_qa_report.md"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    lines = [
        "# SaaS Autopilot PDF Materials QA Report",
        "",
        f"Checked at: {report['checked_at']}",
        f"Folders: {report['summary']['folders']}",
        f"Passed: {report['summary']['passed']}",
        f"Failed: {report['summary']['failed']}",
        f"Blueprint failures: {report['summary']['blueprint_failures']}",
        "",
        "| Folder | Status | Issues | Warnings |",
        "|---|---|---:|---:|",
    ]
    for item in results:
        file_issue_count = sum(len(file_item.get("issues", [])) for file_item in item.get("files", []))
        lines.append(
            f"| {item.get('video_id', item.get('folder'))} | {item['status'].upper()} | "
            f"{len(item.get('issues', [])) + file_issue_count} | {len(item.get('warnings', []))} |"
        )
    md_path.write_text("\n".join(lines), encoding="utf-8")

    print(f"PDF QA report: {json_path}")
    print(f"PDF QA markdown: {md_path}")

    if failed:
        print(f"PDF materials QA failed for {len(failed)} folder(s).")
        raise SystemExit(1)

    print("PDF materials QA passed.")


if __name__ == "__main__":
    main()
