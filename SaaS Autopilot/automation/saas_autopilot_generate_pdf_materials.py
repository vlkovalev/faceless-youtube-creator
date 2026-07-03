"""
Generate per-video PDF downloadable materials for SaaS Autopilot.

Output:
  downloadable_materials/video_folders/SAAS-001/*.pdf
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts" / "saas_autopilot"
OUTPUT_ROOT = ROOT / "downloadable_materials" / "video_folders"
IMPROVED_PROMPT_ROOT = ROOT / "downloadable_materials" / "prompt_improved"


def clean_text(value: str) -> str:
    value = str(value or "")
    value = value.replace("\u2014", "-").replace("\u2013", "-").replace("\u2192", "->")
    value = value.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    value = re.sub(r"[\U00010000-\U0010ffff]", "", value)
    value = value.encode("latin-1", "ignore").decode("latin-1")
    return value.strip()


def styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle(
        name="DocTitle",
        parent=base["Title"],
        textColor=colors.HexColor("#0d1117"),
        fontSize=22,
        leading=26,
        spaceAfter=14,
    ))
    base.add(ParagraphStyle(
        name="Section",
        parent=base["Heading2"],
        textColor=colors.HexColor("#0969da"),
        fontSize=14,
        leading=18,
        spaceBefore=12,
        spaceAfter=8,
    ))
    base.add(ParagraphStyle(
        name="Small",
        parent=base["BodyText"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#57606a"),
    ))
    base.add(ParagraphStyle(
        name="Body",
        parent=base["BodyText"],
        fontSize=10.5,
        leading=14,
        spaceAfter=7,
        splitLongWords=True,
        wordWrap="LTR",
    ))
    base.add(ParagraphStyle(
        name="TableCell",
        parent=base["BodyText"],
        fontSize=8.0,
        leading=9.5,
        spaceAfter=0,
        splitLongWords=True,
        wordWrap="LTR",
    ))
    return base


def para(text: str, style):
    return Paragraph(escape(clean_text(text)).replace("\n", "<br/>"), style)


def bullet(text: str, style):
    return Paragraph("- " + escape(clean_text(text)), style)


def write_pdf(path: Path, title: str, story):
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(path),
        pagesize=letter,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
        title=clean_text(title),
    )
    doc.build(story)


def cell(text: str, style):
    return Paragraph(escape(clean_text(text)), style)


def improved_prompt_path(video_id: str) -> Path:
    return IMPROVED_PROMPT_ROOT / video_id / "improved_prompt_template.md"


def read_improved_prompt(video_id: str) -> str:
    path = improved_prompt_path(video_id)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace").strip()


def add_markdown_prompt(story, markdown_text: str, st, max_chars: int = 7000):
    if not markdown_text:
        story.append(para(
            "Prompt improver output is missing. Run automation/saas_autopilot_material_prompt_improver_agent.js before regenerating downloadable materials.",
            st["Body"],
        ))
        return

    text = markdown_text[:max_chars].replace("```markdown", "").replace("```", "")
    for raw_line in text.splitlines():
        line = clean_text(raw_line)
        if not line:
            continue
        if line.startswith("#"):
            story.append(para(line.lstrip("# ").strip(), st["Section"]))
        elif line.startswith("- "):
            story.append(bullet(line[2:], st["Body"]))
        else:
            story.append(para(line, st["Body"]))

    if len(markdown_text) > max_chars:
        story.append(para(
            "Prompt trimmed for PDF readability. The full improved prompt is stored in the local prompt_improved materials folder.",
            st["Small"],
        ))


def scene_rows(video, st):
    rows = [["Scene", "Purpose", "Viewer takeaway"]]
    for scene in video.get("scenes", []):
        rows.append([
            cell(str(scene.get("scene_number", "")), st["TableCell"]),
            cell(scene.get("title", ""), st["TableCell"]),
            cell(scene.get("voiceover", ""), st["TableCell"]),
        ])
    return rows


def workflow_terms(video):
    text = " ".join([
        video.get("video", {}).get("title", ""),
        video.get("video", {}).get("angle", ""),
        " ".join(scene.get("voiceover", "") for scene in video.get("scenes", [])),
    ]).lower()
    terms = []
    candidates = [
        "make.com", "n8n", "zapier", "vapi", "cal.com", "telegram", "linkedin",
        "slack", "google sheets", "airtable", "quickbooks", "claude", "openai",
        "cursor", "bolt.new", "perplexity", "chatgpt", "ocr", "crm"
    ]
    for term in candidates:
        if term in text:
            terms.append(term)
    return terms or ["spreadsheet", "automation platform", "LLM", "notification channel"]


def blueprint_pdf(video, out_dir, st):
    meta = video["video"]
    tools = workflow_terms(video)
    improved_prompt = read_improved_prompt(meta["id"])
    story = [
        para(f"{meta['id']} Blueprint", st["DocTitle"]),
        para(meta["title"], st["Heading3"]),
        para(f"Generated for SaaS Autopilot on {date.today().isoformat()}.", st["Small"]),
        para("Purpose", st["Section"]),
        para(meta.get("hook", ""), st["Body"]),
        para("Workflow Stack", st["Section"]),
    ]
    for tool in tools:
        story.append(bullet(tool, st["Body"]))
    story.extend([
        para("Build Outline", st["Section"]),
        Table(
            scene_rows(video, st),
            colWidths=[0.55 * inch, 1.8 * inch, 4.55 * inch],
            repeatRows=1,
            splitByRow=1,
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d0d7de")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8.2),
                ("LEADING", (0, 0), (-1, 0), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]),
        ),
        para("Implementation Notes", st["Section"]),
        bullet("Start with a test account and fake sample data.", st["Body"]),
        bullet("Replace all placeholders before connecting live accounts.", st["Body"]),
        bullet("Keep human review before sending outbound messages or changing production systems.", st["Body"]),
        bullet("Record a successful dry run before publishing the workflow to viewers.", st["Body"]),
        para("Prompt-Improved Build Prompt", st["Section"]),
    ])
    add_markdown_prompt(story, improved_prompt, st)
    write_pdf(out_dir / f"{meta['id']}_blueprint.pdf", f"{meta['id']} Blueprint", story)


def templates_pdf(video, out_dir, st):
    meta = video["video"]
    improved_prompt = read_improved_prompt(meta["id"])
    story = [
        para(f"{meta['id']} Templates", st["DocTitle"]),
        para(meta["title"], st["Heading3"]),
        para("Use these templates as viewer-safe starting material. Replace every placeholder.", st["Body"]),
        para("Prompt-Improved Template", st["Section"]),
    ]
    add_markdown_prompt(story, improved_prompt, st)
    story.extend([
        para("Cold Outreach Template", st["Section"]),
        para(
            "Subject: Quick automation idea for {{company_name}}\n\n"
            "Hi {{first_name}},\n\n"
            "I noticed {{specific_company_signal}} and had a practical automation idea for {{company_name}}. "
            "It connects {{tool_1}} and {{tool_2}} to reduce {{manual_task}} and produce {{business_outcome}}.\n\n"
            "Worth sending the short blueprint?\n\n"
            "Best,\n{{sender_name}}",
            st["Body"],
        ),
        para("Follow-Up Template", st["Section"]),
        para(
            "Hi {{first_name}}, quick follow-up. Should I send the automation blueprint, or is "
            "{{workflow_goal}} not a priority right now?",
            st["Body"],
        ),
        para("Viewer Variables", st["Section"]),
    ])
    for item in [
        "{{target_customer}}",
        "{{workflow_goal}}",
        "{{tool_stack}}",
        "{{lead_source}}",
        "{{final_output}}",
        "{{approval_owner}}",
    ]:
        story.append(bullet(item, st["Body"]))
    write_pdf(out_dir / f"{meta['id']}_templates.pdf", f"{meta['id']} Templates", story)


def checklist_pdf(video, out_dir, st):
    meta = video["video"]
    story = [
        para(f"{meta['id']} Setup and QA Checklist", st["DocTitle"]),
        para(meta["title"], st["Heading3"]),
        para("Pre-Build Checklist", st["Section"]),
    ]
    for item in [
        "Create a test workspace.",
        "Use fake sample data first.",
        "Create required tool accounts.",
        "Prepare a rollback plan.",
        "Document all placeholders and credentials needed.",
    ]:
        story.append(bullet(item, st["Body"]))
    story.append(para("QA Checklist", st["Section"]))
    for item in [
        "Trigger runs with a test payload.",
        "Every action produces the expected output.",
        "No API keys or private data are visible.",
        "Error handling is tested.",
        "Final output matches the video promise.",
        "Viewer can reproduce the setup from the PDF.",
        "Any live outbound action has human approval.",
    ]:
        story.append(bullet(item, st["Body"]))
    story.append(para("Go-Live Checklist", st["Section"]))
    for item in [
        "Run three successful test cases.",
        "Confirm permissions and sharing settings.",
        "Turn on scheduling only after QA passes.",
        "Monitor the first live run.",
        "Archive the final workflow version.",
    ]:
        story.append(bullet(item, st["Body"]))
    write_pdf(out_dir / f"{meta['id']}_setup_checklist.pdf", f"{meta['id']} Setup Checklist", story)


def manifest(video, out_dir):
    meta = video["video"]
    data = {
        "video_id": meta["id"],
        "title": meta["title"],
        "resource_type": "per_video_pdf_folder",
        "version": "1.0.0",
        "folder_name": f"{meta['id']} - {meta['title']}",
        "public_drive_folder_url": "",
        "files": [
            f"{meta['id']}_blueprint.pdf",
            f"{meta['id']}_templates.pdf",
            f"{meta['id']}_setup_checklist.pdf",
        ],
        "prompt_improver": {
            "used": improved_prompt_path(meta["id"]).exists(),
            "source": str(improved_prompt_path(meta["id"]).relative_to(ROOT)),
        },
        "qa_status": "created_local_pending_drive_upload",
        "last_checked_date": date.today().isoformat(),
    }
    (out_dir / "resource_manifest.json").write_text(json.dumps(data, indent=2), encoding="utf-8")


def main():
    st = styles()
    count = 0
    for script_path in sorted(SCRIPTS_DIR.glob("saas_*_data.json")):
        video = json.loads(script_path.read_text(encoding="utf-8-sig"))
        meta = video.get("video", {})
        video_id = meta.get("id")
        if not video_id:
            continue
        out_dir = OUTPUT_ROOT / video_id
        blueprint_pdf(video, out_dir, st)
        templates_pdf(video, out_dir, st)
        checklist_pdf(video, out_dir, st)
        manifest(video, out_dir)
        print(f"Generated PDFs for {video_id}: {out_dir}")
        count += 1
    print(f"Generated per-video PDF materials for {count} videos.")


if __name__ == "__main__":
    main()
