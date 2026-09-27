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
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
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
    prompt = f"""You are NUVYRA's document-organization assistant. Analyze this {document_type} only for organization. Return JSON with keys: summary (short plain-language description of what the document contains), medications (array of objects with name, dose, frequency only when explicitly readable), mentioned_tests (array), dates (array), follow_up_mentions (array of text that explicitly mention follow-up/repeat testing), uncertainty_notes (array). Never diagnose, infer a disease, interpret a lab result as normal/abnormal, recommend treatment, or invent missing values. If unclear, say unclear. Document text:\n{text[:120000]}"""
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
    prompt = f"""You are NUVYRA's document-organization assistant. Read this uploaded {document_type} image carefully. Return ONLY JSON with keys: summary, extracted_text, medications (objects with name, dose, frequency only when explicitly visible), mentioned_tests, dates, follow_up_mentions, uncertainty_notes. Transcribe printed text and clearly legible handwriting. Do not diagnose, interpret results as normal/abnormal, recommend treatment, or invent missing values. If handwriting or a value is unclear, put it in uncertainty_notes and do not guess."""
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
        analysis["detected_tests"]=list(dict.fromkeys(analysis["detected_tests"] + [str(x) for x in ai_result.get("mentioned_tests",[]) if x]))
        analysis["dates_found"]=list(dict.fromkeys(analysis["dates_found"] + [str(x) for x in ai_result.get("dates",[]) if x]))[:20]
        ai_meds=[]
        for m in ai_result.get("medications",[]):
            if isinstance(m,dict): ai_meds.append(" ".join(str(m.get(k,"")) for k in ("name","dose","frequency") if m.get(k)).strip())
        if ai_meds: analysis["possible_medication_lines"]=ai_meds
    else:
        analysis["ai_analysis"]={"engine":"local OCR/document intelligence","non_diagnostic":True,"note":"No configured vision service returned additional image text. The original file was saved; no medical information was guessed."}
    analysis["extracted_text_preview"] = text[:12000] if text else ""
    analysis["extracted_character_count"] = len(text)
    analysis["review_note"] = "Extracted information is for organization and reminders. Review the original document and confirm medical decisions with a clinician." if text else "No readable text was extracted. Review the original document manually."
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