"""Past history, privacy-aware document intelligence and reminders.

Document analysis is organizational research assistance only. It does not
interpret results diagnostically, prescribe treatment, or decide that a test
is medically necessary.
"""
from datetime import date, timedelta, datetime, timezone
from io import BytesIO
from typing import Optional
import base64
import json
import os
import re
import uuid
import httpx
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.dependencies import get_current_user
from app.db.models import User, PastHistoryRecord, MedicalDocument, HealthReminder
from app.db.session import get_db

router = APIRouter(prefix="/past-history", tags=["Past History & Documents"])
MAX_FILE_BYTES = 12 * 1024 * 1024
TEST_PATTERNS = {
    "CBC / blood count": r"\b(cbc|complete blood count|full blood count|hemogram)\b",
    "BCR-ABL / molecular test": r"\b(bcr[- ]?abl|pcr|molecular)\b",
    "liver function test": r"\b(lft|liver function|ast|alt|bilirubin)\b",
    "kidney function test": r"\b(kft|kidney function|creatinine|urea)\b",
    "thyroid test": r"\b(tsh|thyroid|t3|t4)\b",
    "blood sugar test": r"\b(glucose|blood sugar|hba1c|a1c)\b",
    "lipid profile": r"\b(lipid profile|cholesterol|triglyceride|hdl|ldl)\b",
    "urine test": r"\b(urinalysis|urine routine|urine examination)\b",
}

def _extract_text(data: bytes, mime: str, filename: str) -> str:
    if mime == "application/pdf" or filename.lower().endswith(".pdf"):
        try:
            from pypdf import PdfReader
            return "\n".join((p.extract_text() or "") for p in PdfReader(BytesIO(data)).pages).strip()[:200_000]
        except Exception:
            return ""
    if mime.startswith("text/") or filename.lower().endswith((".txt", ".csv")):
        return data.decode("utf-8", errors="ignore")[:200_000]
    if mime.startswith("image/"):
        try:
            from PIL import Image, ImageEnhance, ImageFilter, ImageOps
            import pytesseract
            image = Image.open(BytesIO(data)).convert("RGB")
            # Prescriptions are frequently photographed/scanned. Run several OCR
            # passes so light backgrounds, skewed text and mixed handwriting do
            # not all depend on one Tesseract configuration.
            gray = ImageOps.grayscale(image)
            gray = ImageOps.autocontrast(gray)
            scale = 2 if max(gray.size) < 2200 else 1
            if scale > 1:
                gray = gray.resize((gray.width * scale, gray.height * scale))
            variants = [gray, gray.filter(ImageFilter.SHARPEN), ImageEnhance.Contrast(gray).enhance(1.8)]
            outputs = []
            for variant in variants:
                for psm in (6, 11):
                    try:
                        value = pytesseract.image_to_string(variant, config=f"--psm {psm}").strip()
                        if value:
                            outputs.append(value)
                    except Exception:
                        pass
            # Preserve useful lines while removing repeated OCR output.
            lines=[]; seen=set()
            for output in outputs:
                for line in output.splitlines():
                    line=line.strip()
                    key=re.sub(r"\W+"," ",line.lower()).strip()
                    if len(key)>=2 and key not in seen:
                        seen.add(key); lines.append(line)
            return "\n".join(lines)[:200_000]
        except Exception:
            return ""
    return ""

def _rule_analysis(text: str, document_type: str) -> dict:
    lower = text.lower()
    tests = [name for name, pattern in TEST_PATTERNS.items() if re.search(pattern, lower)]
    medication_lines = [line.strip()[:300] for line in text.splitlines() if re.search(r"\b(tablet|capsule|mg|mcg|ml|once daily|twice daily|morning|evening|dose)\b", line, re.I)][:30]
    dates = re.findall(r"\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+20\d{2})\b", text, re.I)
    return {"document_type": document_type, "text_extracted": bool(text.strip()), "detected_tests": tests, "possible_medication_lines": medication_lines, "dates_found": dates[:20]}

async def _ai_analysis(text: str, document_type: str) -> Optional[dict]:
    key = os.getenv("NUVYRA_DOCUMENT_AI_API_KEY")
    base = os.getenv("NUVYRA_DOCUMENT_AI_BASE_URL", "https://api.openai.com/v1")
    model = os.getenv("NUVYRA_DOCUMENT_AI_MODEL", "gpt-4.1-mini")
    if not key or not text.strip(): return None
    prompt = f"""You are NUVYRA's document-organization assistant. Analyze this {document_type} only for organization. Return JSON with keys: summary (short plain-language description of what the document contains), medications (array of objects with name, dose, frequency only when explicitly readable), mentioned_tests (array), dates (array), lab_results (array of candidate objects with test_name, value, unit, reference_range_text, reference_low, reference_high, collection_date, source_text; only include explicitly visible values and ranges; use null for missing fields), follow_up_mentions (array), uncertainty_notes (array). Never diagnose, infer disease, interpret results as normal/abnormal, recommend treatment, or invent values. If unclear, say unclear. Every lab candidate is UNVERIFIED until user checks the original. Include an exact short source_text excerpt. Document text:\n{text[:120000]}"""
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            r = await client.post(f"{base.rstrip('/')}/chat/completions", headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json={"model": model, "temperature": 0, "response_format": {"type": "json_object"}, "messages":[{"role":"system","content":"Return only valid JSON. Do not make medical decisions."},{"role":"user","content":prompt}]})
            r.raise_for_status(); result = json.loads(r.json()["choices"][0]["message"]["content"])
            return result if isinstance(result, dict) else None
    except Exception: return None

async def _ai_image_analysis(data: bytes, mime: str, document_type: str) -> Optional[dict]:
    key = os.getenv("NUVYRA_DOCUMENT_AI_API_KEY")
    base = os.getenv("NUVYRA_DOCUMENT_AI_BASE_URL", "https://api.openai.com/v1")
    model = os.getenv("NUVYRA_DOCUMENT_VISION_MODEL", os.getenv("NUVYRA_DOCUMENT_AI_MODEL", "gpt-4.1-mini"))
    if not key or not mime.startswith("image/"): return None
    encoded = base64.b64encode(data).decode("ascii")
    prompt = f"""You are NUVYRA's document-organization assistant. Read this uploaded {document_type} image carefully. Return ONLY JSON with keys: summary, extracted_text, medications (objects with name, dose, frequency only when explicitly visible), mentioned_tests, dates, lab_results (array of candidate objects with test_name, value, unit, reference_range_text, reference_low, reference_high, collection_date, source_text; only transcribe explicitly visible values/ranges; null when absent), follow_up_mentions, uncertainty_notes. Transcribe printed text and clearly legible handwriting. Do not diagnose, interpret results as normal/abnormal, recommend treatment, or invent missing values. If handwriting or a value is unclear, put it in uncertainty_notes and do not guess. Every lab candidate is UNVERIFIED until user checks the original. Include an exact short source_text excerpt."""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(f"{base.rstrip('/')}/chat/completions", headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json={"model": model, "temperature": 0, "response_format": {"type": "json_object"}, "messages":[{"role":"system","content":"Return only valid JSON. Never make medical decisions."},{"role":"user","content":[{"type":"text","text":prompt},{"type":"image_url","image_url":{"url":f"data:{mime};base64,{encoded}","detail":"high"}}]}]})
            r.raise_for_status(); result=json.loads(r.json()["choices"][0]["message"]["content"])
            return result if isinstance(result,dict) else None
    except Exception: return None

@router.get("")
def get_past_history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    history = db.scalars(select(PastHistoryRecord).where(PastHistoryRecord.user_id == current_user.id).order_by(PastHistoryRecord.created_at.desc())).all()
    documents = db.scalars(select(MedicalDocument).where(MedicalDocument.user_id == current_user.id).order_by(MedicalDocument.uploaded_at.desc())).all()
    reminders = db.scalars(select(HealthReminder).where(HealthReminder.user_id == current_user.id,HealthReminder.completed.is_(False)).order_by(HealthReminder.due_date.asc().nullslast())).all()
    return {"history":[{"id":str(x.id),"illness_name":x.illness_name,"details":x.details,"diagnosed_on":x.diagnosed_on.isoformat() if x.diagnosed_on else None,"current_status":x.current_status} for x in history],"documents":[{"id":str(x.id),"type":x.document_type,"filename":x.filename,"analysis":x.analysis,"uploaded_at":x.uploaded_at.isoformat()} for x in documents],"reminders":[{"id":str(x.id),"title":x.title,"message":x.message,"due_date":x.due_date.isoformat() if x.due_date else None} for x in reminders]}

@router.post("/illness", status_code=201)
def add_history(illness_name: str = Form(...), details: Optional[str] = Form(None), diagnosed_on: Optional[date] = Form(None), current_status: Optional[str] = Form(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not illness_name.strip(): raise HTTPException(400,"Please provide a history item.")
    item=PastHistoryRecord(user_id=current_user.id,illness_name=illness_name.strip(),details=details,diagnosed_on=diagnosed_on,current_status=current_status); db.add(item); db.commit(); db.refresh(item); return {"id":str(item.id),"message":"Past history saved."}



def _clean_lab_candidates(items) -> list:
    """Keep only explicitly extracted lab fields; never infer missing values."""
    if not isinstance(items, list):
        return []
    cleaned = []
    for item in items[:100]:
        if not isinstance(item, dict):
            continue
        def field(name, limit=160):
            value = item.get(name)
            if value is None:
                return None
            value = str(value).strip()
            return value[:limit] if value else None
        test_name = field("test_name")
        if not test_name:
            continue
        cleaned.append({
            "test_name": test_name, "value": field("value", 80),
            "unit": field("unit", 50), "reference_range_text": field("reference_range_text", 120),
            "reference_low": field("reference_low", 40), "reference_high": field("reference_high", 40),
            "collection_date": field("collection_date", 40), "source_text": field("source_text", 500),
            "status": "needs_user_review", "verified": False,
        })
    return cleaned


def _parse_number(value):
    if value is None:
        return None
    match = re.search(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)", str(value).replace(",", ""))
    try:
        return float(match.group(0)) if match else None
    except (TypeError, ValueError):
        return None


def _plain_test_explanation(name: str) -> str:
    lower = name.lower()
    explanations = [
        (r"haemoglobin|hemoglobin|\bhb\b", "Hemoglobin is a protein in red blood cells that carries oxygen around the body."),
        (r"\brbc\b|red blood cell", "This counts red blood cells, which carry oxygen through the body."),
        (r"\bwbc\b|white blood cell", "This counts white blood cells, which are part of the immune system."),
        (r"platelet", "Platelets help blood form clots."),
        (r"haematocrit|hematocrit|\bpcv\b", "This estimates the proportion of blood made up of red blood cells."),
        (r"\bmcv\b", "MCV describes the average size of red blood cells."),
        (r"\bmchc?\b", "MCH and MCHC describe the amount or concentration of hemoglobin in red blood cells."),
        (r"neutrophil|lymphocyte|monocyte|eosinophil|basophil", "This is one type of white blood cell, usually considered alongside the other blood-cell results."),
        (r"\bcrp\b|c-reactive protein", "CRP is a general marker that can rise with inflammation; it does not identify a cause by itself."),
        (r"\besr\b|erythrocyte sedimentation", "ESR is a general marker that can change with inflammation and other factors."),
        (r"hba1c|glycated", "HbA1c reflects average blood-sugar exposure over roughly the previous two to three months."),
        (r"glucose|blood sugar", "This measures glucose, a type of sugar, in the blood at the time of sampling."),
        (r"creatinine", "Creatinine is a waste product used with other information to assess kidney filtering."),
        (r"\begfr\b|estimated glomerular", "eGFR is an estimate of how well the kidneys filter blood."),
        (r"urea|\bbun\b", "Urea is a waste product considered as part of kidney-function and hydration assessment."),
        (r"\balt\b|alanine aminotransferase", "ALT is an enzyme often checked as part of assessing the liver."),
        (r"\bast\b|aspartate aminotransferase", "AST is an enzyme found in several tissues and reviewed with other results."),
        (r"bilirubin", "Bilirubin is produced when red blood cells are broken down and is processed by the liver."),
        (r"\btsh\b|thyroid stimulating", "TSH is a hormone that signals the thyroid gland to make thyroid hormones."),
        (r"free t4|thyroxine", "T4 is a thyroid hormone involved in regulating how the body uses energy."),
        (r"ferritin", "Ferritin is a protein that stores iron; it is considered with other blood results."),
        (r"vitamin ?b12|cobalamin", "Vitamin B12 helps the body make healthy blood cells and supports nerve function."),
        (r"vitamin ?d|25-oh", "This checks a form of vitamin D, which helps the body use calcium and support bone health."),
    ]
    for pattern, explanation in explanations:
        if re.search(pattern, lower):
            return explanation
    return "This test name has been recorded, but NUVYRA does not yet have a reviewed plain-language explanation for it."


@router.post("/documents/{document_id}/lab-review")
def review_lab_results(document_id: uuid.UUID, payload: dict = Body(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Persist only rows the user has checked against their original report."""
    doc = db.scalar(select(MedicalDocument).where(MedicalDocument.id == document_id, MedicalDocument.user_id == current_user.id))
    if not doc:
        raise HTTPException(404, "Document not found.")
    rows = payload.get("results")
    if not isinstance(rows, list) or not rows or len(rows) > 100:
        raise HTTPException(400, "Please review at least one result.")
    confirmed = []
    for row in rows:
        if not isinstance(row, dict) or row.get("verified") is not True:
            continue
        name = str(row.get("test_name") or "").strip()[:160]
        value_text = str(row.get("value") or "").strip()[:80]
        unit = str(row.get("unit") or "").strip()[:50]
        range_text = str(row.get("reference_range_text") or "").strip()[:120]
        date_text = str(row.get("collection_date") or "").strip()[:40]
        if not name or not value_text or not unit or not range_text:
            raise HTTPException(422, "For every confirmed result, enter the test name, value, unit and range printed on the report.")
        low_text = str(row.get("reference_low") or "").strip()
        high_text = str(row.get("reference_high") or "").strip()
        numeric_value = _parse_number(value_text)
        low = _parse_number(low_text) if low_text else None
        high = _parse_number(high_text) if high_text else None
        if (low_text and low is None) or (high_text and high is None) or (low is not None and high is not None and low > high):
            raise HTTPException(422, "Please check the numeric reference-range limits.")
        status = "range_not_comparable"
        if numeric_value is not None and low is not None and high is not None:
            status = "below_lab_range" if numeric_value < low else "above_lab_range" if numeric_value > high else "within_lab_range"
        confirmed.append({
            "test_name": name, "value": value_text, "unit": unit,
            "reference_range_text": range_text, "reference_low": low_text or None,
            "reference_high": high_text or None, "collection_date": date_text or None,
            "status": status, "verified": True, "explanation": _plain_test_explanation(name),
        })
    analysis = dict(doc.analysis or {})
    analysis["confirmed_lab_results"] = confirmed
    analysis["lab_review_note"] = "You confirmed these entries against the original report. Comparison uses only the reference interval printed by that laboratory. This is not a diagnosis; ranges vary by laboratory and personal context."
    doc.analysis = analysis
    db.commit()
    return {"document_id": str(doc.id), "confirmed_lab_results": confirmed, "message": "Your reviewed entries have been saved."}

@router.post("/documents", status_code=201)
async def upload_medical_document(document_type: str = Form(...), file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    data=await file.read()
    if not data: raise HTTPException(400,"The uploaded file is empty.")
    if len(data)>MAX_FILE_BYTES: raise HTTPException(413,"File is too large. Maximum size is 12 MB.")
    mime=file.content_type or "application/octet-stream"; filename=file.filename or "document"
    text=_extract_text(data,mime,filename)
    # For images, always run the vision pass when configured. OCR can return a
    # few misleading characters and must not prevent the stronger document
    # reader from seeing the original image.
    ai_result=await _ai_image_analysis(data,mime,document_type) if mime.startswith("image/") else await _ai_analysis(text,document_type)
    if ai_result:
        vision_text=ai_result.get("extracted_text") if isinstance(ai_result.get("extracted_text"),str) else ""
        if vision_text.strip(): text=vision_text
    analysis=_rule_analysis(text,document_type)
    if ai_result:
        analysis["ai_analysis"]={**ai_result,"engine":"configured document AI","non_diagnostic":True}
        analysis["lab_result_candidates"] = _clean_lab_candidates(ai_result.get("lab_results", []))
        analysis["detected_tests"]=list(dict.fromkeys(analysis["detected_tests"] + [str(x) for x in ai_result.get("mentioned_tests",[]) if x]))
        analysis["dates_found"]=list(dict.fromkeys(analysis["dates_found"] + [str(x) for x in ai_result.get("dates",[]) if x]))[:20]
        ai_meds=[]
        for m in ai_result.get("medications",[]):
            if isinstance(m,dict): ai_meds.append(" ".join(str(m.get(k,"")) for k in ("name","dose","frequency") if m.get(k)).strip())
        if ai_meds: analysis["possible_medication_lines"]=ai_meds
    else:
        analysis["ai_analysis"]={"engine":"local OCR/document intelligence","non_diagnostic":True,"note":"No configured vision service returned additional image text. The original file was saved; no medical information was guessed."}
        analysis["lab_result_candidates"] = []
    analysis["extracted_text_preview"] = text[:12000] if text else ""
    analysis["extracted_character_count"] = len(text)
    analysis["review_note"] = "Extracted values are unverified candidates. Compare every test name, value, unit, date and reference interval with the original report before asking NUVYRA to explain it. The original report is the source of truth." if text else "No readable text was extracted. Review the original document manually."
    doc=MedicalDocument(user_id=current_user.id,document_type=document_type,filename=filename,mime_type=mime,extracted_text=text[:200_000] or None,analysis=analysis); db.add(doc); db.flush()
    mentioned=set(analysis.get("detected_tests",[])) | set((analysis.get("ai_analysis") or {}).get("mentioned_tests",[]))
    if document_type.lower()=="prescription":
        for test in sorted(mentioned): db.add(HealthReminder(user_id=current_user.id,title=f"Check report: {test}",message=f"Your uploaded document mentions {test}. If your clinician asked you to complete this, upload the latest result so NUVYRA can keep your record organized.",due_date=date.today()+timedelta(days=30),source_document_id=doc.id))
    elif document_type.lower() in {"report","lab_report","test_report"}:
        for reminder in db.scalars(select(HealthReminder).where(HealthReminder.user_id==current_user.id,HealthReminder.completed.is_(False))).all():
            if reminder.title.replace("Check report: ","") in mentioned: reminder.completed=True
    db.commit(); db.refresh(doc)
    return {"id":str(doc.id),"filename":doc.filename,"analysis":analysis,"reminders_created":sorted(mentioned) if document_type.lower()=="prescription" else []}

@router.post("/reminders/{reminder_id}/complete")
def complete_reminder(reminder_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reminder=db.scalar(select(HealthReminder).where(HealthReminder.id==reminder_id,HealthReminder.user_id==current_user.id))
    if not reminder: raise HTTPException(404,"Reminder not found.")
    reminder.completed=True; db.commit(); return {"message":"Reminder completed."}


def _reward_completed_check_in(db: Session, current_user: User, check_in_date: date) -> dict:
    if current_user.reward_last_check_in_date and current_user.reward_last_check_in_date.date()==check_in_date: return {"coins_awarded":0,"coins":current_user.reward_coins,"streak":current_user.reward_streak,"already_rewarded_today":True}
    previous_date=check_in_date-timedelta(days=1); current_user.reward_streak=current_user.reward_streak+1 if current_user.reward_last_check_in_date and current_user.reward_last_check_in_date.date()==previous_date else 1
    coins=10; milestone_bonus=25 if current_user.reward_streak%7==0 else 0; current_user.reward_coins+=coins+milestone_bonus; current_user.reward_last_check_in_date=datetime.combine(check_in_date,datetime.min.time(),tzinfo=timezone.utc)
    return {"coins_awarded":coins+milestone_bonus,"coins":current_user.reward_coins,"streak":current_user.reward_streak,"milestone_bonus":milestone_bonus,"already_rewarded_today":False}

@router.get("/rewards")
def get_rewards(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"coins":current_user.reward_coins,"streak":current_user.reward_streak,"last_check_in_date":current_user.reward_last_check_in_date.date().isoformat() if current_user.reward_last_check_in_date else None,"rules":{"daily_check_in":10,"seven_day_milestone_bonus":25,"purpose":"Rewards recognize consistent NUVYRA check-in participation; they are not medical incentives or treatment rewards."}}