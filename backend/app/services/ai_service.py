"""Self-reported personal-pattern analysis service.

Observational monitoring only. This service never diagnoses disease or makes
clinical/treatment decisions. Only five required 1–5 self-report ratings enter
the experimental index; categorical answers remain context only.
"""
from __future__ import annotations
from datetime import date, datetime, timezone
from math import isfinite
from statistics import median
from typing import Dict, List, Optional, Tuple
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.db.models.biomarker_feature import BiomarkerFeature
from app.db.models.daily_check_in import DailyCheckIn
from app.db.models.health_stability_score import HealthStabilityScore
from app.db.models.past_history import HealthReminder, MedicalDocument, PastHistoryRecord
from app.db.models.user import User
from app.schemas.ai_schemas import AIAnalysisRequest, AIAnalysisResponse, AIHistoryPoint, AIHistoryResponse, AIContextSummary, BiomarkerFeatureRead

MODEL_NAME = "NUVYRA Personal Pattern Engine"
MODEL_VERSION = "2.5.0"
# Only self-reported fields currently contribute to the personal-pattern score.
# Voice is used only for technical capture checks in the client. Camera-derived
# face, eye, head, gait and breathing estimates are excluded until validated.
FEATURES = (("fatigue", "survey"), ("energy_level", "survey"), ("sleep_quality", "survey"), ("stress_level", "survey"), ("concentration_level", "survey"))
MODALITY_NAMES = ["survey"]
REQUIRED_CHECKIN_FIELDS = ("fatigue", "mood_deviation", "energy_level", "sleep_quality", "stress_level", "concentration_level", "physical_comfort")

class AIService:
    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _safe(value: Optional[float]) -> Optional[float]:
        try:
            if value is None or not isfinite(float(value)):
                return None
            value = float(value)
            if abs(value) > 1e9:
                return None
            return value
        except (TypeError, ValueError):
            return None

    def _vector(self, payload: AIAnalysisRequest) -> Dict[str, float]:
        values = payload.model_dump()
        return {name: value for name, _ in FEATURES if (value := self._safe(values.get(name))) is not None}

    def _history(self, user_id: UUID, limit: int = 30):
        rows = self.db.execute(select(DailyCheckIn, HealthStabilityScore).join(HealthStabilityScore, HealthStabilityScore.check_in_id == DailyCheckIn.id).where(DailyCheckIn.user_id == user_id).order_by(HealthStabilityScore.generated_at.desc()).limit(limit)).all()
        out = []
        for check_in, score in rows:
            fs = self.db.execute(select(BiomarkerFeature).where(BiomarkerFeature.check_in_id == check_in.id)).scalars().all()
            out.append((check_in, score, {f.feature_name: float(f.feature_value) for f in fs if self._safe(f.feature_value) is not None}))
        return out

    def _context(self, user_id: UUID) -> AIContextSummary:
        histories = self.db.execute(select(PastHistoryRecord).where(PastHistoryRecord.user_id == user_id).order_by(PastHistoryRecord.created_at.desc())).scalars().all()
        docs = self.db.execute(select(MedicalDocument).where(MedicalDocument.user_id == user_id).order_by(MedicalDocument.uploaded_at.desc())).scalars().all()
        pending = self.db.execute(select(HealthReminder).where(HealthReminder.user_id == user_id, HealthReminder.completed.is_(False))).scalars().all()
        used = []
        history_items = []
        analyzed_documents = []
        if histories:
            used.append("saved patient-reported past history")
            for h in histories:
                item = h.illness_name
                if h.current_status:
                    item += f" — status: {h.current_status}"
                if h.diagnosed_on:
                    item += f" — diagnosed: {h.diagnosed_on.isoformat()}"
                if h.details:
                    item += f" — details: {h.details[:300]}"
                history_items.append(item)
        if docs:
            used.append("saved uploaded document analyses")
            for d in docs:
                analysis = d.analysis or {}
                ai = analysis.get("ai_analysis") or {}
                analyzed_documents.append({
                    "filename": d.filename,
                    "document_type": d.document_type,
                    "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
                    "text_extracted": bool(analysis.get("text_extracted") or d.extracted_text),
                    "tests": list(analysis.get("detected_tests") or ai.get("mentioned_tests") or [])[:20],
                    "medications": list(analysis.get("possible_medication_lines") or [])[:20],
                    "dates": list(analysis.get("dates_found") or [])[:20],
                    "follow_up_mentions": list(ai.get("follow_up_mentions") or [])[:20],
                    "summary": str(ai.get("summary") or "")[:500],
                })
        if pending:
            used.append("pending document/test reminders")
        return AIContextSummary(
            past_history_count=len(histories),
            document_count=len(docs),
            pending_reminder_count=len(pending),
            document_types=sorted({d.document_type for d in docs if d.document_type}),
            context_used=used,
            history_items=history_items[:30],
            analyzed_documents=analyzed_documents[:30],
        )

    @staticmethod
    def _median_mad(values: List[float]) -> Tuple[float, float]:
        center = median(values)
        mad = median([abs(v-center) for v in values]) if values else 0.0
        return center, max(1.4826*mad, abs(center)*0.05, 0.01)

    def _robust_deviations(self, current: Dict[str, float], history_features: List[Dict[str, float]]) -> Dict[str, float]:
        out: Dict[str, float] = {}
        for name, value in current.items():
            baseline = [r[name] for r in history_features if name in r and self._safe(r[name]) is not None]
            if len(baseline) >= 2:
                center, scale = self._median_mad(baseline)
                out[name] = abs(value-center)/scale
        return out

    def _quality(self, current: Dict[str, float], payload: AIAnalysisRequest) -> float:
        # Completeness of required self-report fields, not clinical accuracy.
        present = sum(1 for name in REQUIRED_CHECKIN_FIELDS if getattr(payload, name, None) is not None)
        return round(present / len(REQUIRED_CHECKIN_FIELDS), 3)

    def _invalid_required_ranges(self, payload: AIAnalysisRequest) -> Dict[str, float]:
        ranges = {
            "fatigue": (1.0, 5.0),
            "mood_deviation": (0.0, 1.0),
            "energy_level": (1.0, 5.0),
            "sleep_quality": (1.0, 5.0),
            "stress_level": (1.0, 5.0),
            "concentration_level": (1.0, 5.0),
            "physical_comfort": (1.0, 7.0),
        }
        return {
            name: float(getattr(payload, name))
            for name, (minimum, maximum) in ranges.items()
            if getattr(payload, name, None) is not None
            and not minimum <= float(getattr(payload, name)) <= maximum
        }

    def _model_score(self, current: Dict[str, float], history_features: List[Dict[str, float]]):
        deviations = self._robust_deviations(current, history_features)
        n = len(history_features)
        if not deviations:
            return (82.0 if current else 0.0), "baseline_initialization", min(0.7, 0.30+n*0.04), deviations
        robust = min(1.0, sum(min(d, 4.0) for d in deviations.values()) / max(len(deviations), 1) / 4.0)
        if n >= 5:
            try:
                from sklearn.ensemble import IsolationForest
                import numpy as np
                names = [name for name, _ in FEATURES if name in current and sum(name in r for r in history_features) >= 5]
                if len(names) >= 4:
                    matrix = np.array([[r[name] for name in names] for r in history_features if all(name in r for name in names)], dtype=float)
                    if len(matrix) >= 5:
                        model = IsolationForest(n_estimators=150, contamination="auto", random_state=42).fit(matrix)
                        decision = float(model.decision_function(np.array([[current[n] for n in names]], dtype=float))[0])
                        anomaly = max(0, min(1, 0.5-decision))
                        score = 100*(1-(0.65*anomaly+0.35*robust))
                        return max(0, min(100, score)), "isolation_forest+robust_personal_baseline", min(0.95, 0.55+n*0.015), deviations
            except Exception:
                pass
        return max(0, min(100, 100-robust*40)), "robust_personal_baseline", min(0.9, 0.45+n*0.03), deviations

    @staticmethod
    def _trend(score: float, previous: Optional[float]) -> str:
        if previous is None:
            return "INITIAL"
        if score >= previous+3:
            return "IMPROVING"
        if score <= previous-3:
            return "DEGRADING"
        return "STABLE"

    @staticmethod
    def _modalities(current: Dict[str, float]) -> List[str]:
        return sorted({category for name, category in FEATURES if name in current})

    @staticmethod
    def _missing(modalities: List[str]) -> List[str]:
        return [m for m in MODALITY_NAMES if m not in modalities]

    def _persistence(self, current_deviations: Dict[str, float], history: List[Tuple]) -> str:
        if len(history) < 3:
            return "INSUFFICIENT_HISTORY"
        notable = {k for k, v in current_deviations.items() if v >= 1.0}
        if not notable:
            return "NO_PERSISTENT_DEVIATION"
        recent = history[:3]
        persistent = []
        for name in notable:
            values = [row[2].get(name) for row in recent if name in row[2]]
            if len(values) < 2:
                continue
            all_hist = [row[2][name] for row in history if name in row[2]]
            center, scale = self._median_mad(all_hist)
            if sum(abs(v-center)/scale >= 1 for v in values) >= 2:
                persistent.append(name)
        return "PERSISTENT_CHANGE" if persistent else "SINGLE_SESSION_CHANGE"

    @staticmethod
    def _drivers(deviations: Dict[str, float]):
        return [n.replace("_", " ") for n, v in sorted(deviations.items(), key=lambda x: x[1], reverse=True)[:4] if v >= 1]

    def _recommendations(self, score, trend, quality, missing, context, persistence):
        out = ["Complete check-ins regularly and answer based on your actual experience; one session should not be interpreted in isolation."]
        if quality < 0.6:
            out.append("Some required answers are incomplete. Complete every required question before submitting.")
        if missing:
            out.append("Missing signal groups were excluded from the analysis; they were not treated as normal.")
        if persistence == "PERSISTENT_CHANGE":
            out.append("A change has appeared repeatedly in recent usable observations. If it concerns you, discuss it with a qualified healthcare professional.")
        if context.pending_reminder_count:
            out.append("You have pending document reminders. Review Notifications and follow your clinician's instructions.")
        return out

    @staticmethod
    def _limitations(history_count, missing, quality):
        out = ["Observational system only; this output is not a diagnosis or treatment recommendation.", "Self-reported answers can be affected by recall, expectations, interpretation of rating scales and temporary circumstances.", "The personal-pattern index is experimental and has not been clinically validated."]
        if history_count < 5:
            out.append("Your personal reference pattern is still developing; comparisons are limited until more usable check-ins are collected.")
        if missing:
            out.append("Unavailable modalities were excluded rather than imputed as normal.")
        if quality < 0.6:
            out.append("Today's data quality was limited, so interpretation should be treated cautiously.")
        return out

    def analyze(self, user_id: UUID, payload: AIAnalysisRequest) -> AIAnalysisResponse:
        current = self._vector(payload)
        quality = self._quality(current, payload)
        invalid_ranges = self._invalid_required_ranges(payload)
        if invalid_ranges:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Some answers are outside the allowed range. Please review the highlighted values.",
                    "invalid_fields": invalid_ranges,
                },
            )
        if quality < 1.0:
            missing_fields = [name for name in REQUIRED_CHECKIN_FIELDS if getattr(payload, name, None) is None]
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "This check-in is incomplete and was not saved. Please complete the required questions and try again.",
                    "missing_fields": missing_fields,
                    "data_completeness": quality,
                    "minimum_required": 1.0,
                },
            )
        history = [row for row in self._history(user_id) if (row[1].model_metadata or {}).get('model_version') == MODEL_VERSION]
        context = self._context(user_id)
        score, algorithm, confidence, deviations = self._model_score(current, [r[2] for r in history])
        previous = history[0][1].overall_score if history else None
        trend = self._trend(score, previous)
        modalities = self._modalities(current)
        missing = self._missing(modalities)
        persistence = self._persistence(deviations, history)
        drivers = self._drivers(deviations)
        recommendations = self._recommendations(score, trend, quality, missing, context, persistence)
        limitations = self._limitations(len(history), missing, quality)
        limitations.append("The numerical personal-pattern index uses five self-reported 1–5 ratings only: fatigue, energy, sleep quality, stress and concentration.")
        limitations.append("Overall feeling and physical-comfort choices are kept as context and are not converted into numeric index inputs.")
        limitations.append("Voice and camera measurements are not collected in the standard check-in and are not used in the index.")
        limitations.append("Camera-derived face, eye, head, gait and breathing measurements are excluded because validated measurement methods are not enabled.")
        if context.document_count:
            limitations.append("Uploaded records and extracted document summaries are shown as background context; their laboratory values are not yet incorporated into the numerical pattern score.")
        now = datetime.now(timezone.utc)
        description = 'broadly consistent' if score >= 80 else 'moderately different' if score >= 60 else 'substantially different'
        explanation = f"The current session is {description} from the personal baseline. The system used {len(modalities)} available signal groups, excluded unavailable or invalid values, and checked whether notable differences persist across recent observations. Persistence: {persistence}. This is an observational research signal, not a diagnosis."
        check_in = DailyCheckIn(user_id=user_id, check_in_date=date.today(), status="completed", completed_at=now, extra_metadata={"source":"web_multimodal_check_in","model_version":MODEL_VERSION,"quality":quality,"missing_modalities":missing,"persistence":persistence})
        self.db.add(check_in)
        self.db.flush()
        feature_reads = []
        for name, category in FEATURES:
            if name in current:
                value = current[name]
                self.db.add(BiomarkerFeature(check_in_id=check_in.id, feature_name=name, feature_category=category, feature_value=value, source_modality=category, extracted_at=now, extra_properties={"model_version":MODEL_VERSION,"research_proxy":category in {"breathing","facial_dynamics","eye","gait_movement","head_movement"}}))
                feature_reads.append(BiomarkerFeatureRead(name=name, category=category, value=value, deviation=deviations.get(name)))
        metadata = {"model_name":MODEL_NAME,"model_version":MODEL_VERSION,"algorithm":algorithm,"baseline_observations":len(history) + 1,"data_quality_score":quality,"modalities_present":modalities,"missing_modalities":missing,"top_drivers":drivers,"recommendations":recommendations,"limitations":limitations,"persistence_signal":persistence,"source_duration_seconds":payload.source_duration_seconds,"self_report_context":{"mood_deviation":payload.mood_deviation,"mood_level":payload.mood_level,"physical_comfort":payload.physical_comfort,"physical_comfort_observation":payload.physical_comfort_observation,"physical_comfort_notes":payload.physical_comfort_notes,"sleep_hours":payload.sleep_hours,"sleep_awakenings":payload.sleep_awakenings,"optional_observation_fraction":payload.symptom_burden},"context":context.model_dump()}
        self.db.add(HealthStabilityScore(check_in_id=check_in.id, overall_score=round(score,2), trend_category=trend, confidence=round(confidence,3), generated_at=now, explanation_summary=explanation, model_metadata=metadata))
        from app.api.v1.past_history_router import _reward_completed_check_in
        reward = _reward_completed_check_in(self.db, self.db.get(User, user_id), date.today())
        self.db.commit()
        return AIAnalysisResponse(check_in_id=check_in.id, overall_score=round(score,2), trend=trend, confidence=round(confidence,3), model_name=MODEL_NAME, model_version=MODEL_VERSION, baseline_observations=len(history) + 1, explanation=explanation, features=feature_reads, generated_at=now, data_quality_score=quality, modalities_present=modalities, top_drivers=drivers, recommendations=recommendations, limitations=limitations, missing_modalities=missing, persistence_signal=persistence, context=context)

    def history(self, user_id: UUID, limit=30):
        rows = [row for row in self._history(user_id, limit) if (row[1].model_metadata or {}).get('model_version') == MODEL_VERSION]
        return AIHistoryResponse(items=[AIHistoryPoint(check_in_id=c.id, score=round(s.overall_score,2), trend=s.trend_category, confidence=round(s.confidence,3), generated_at=s.generated_at) for c,s,_ in reversed(rows)], baseline_observations=len(rows), model_name=MODEL_NAME, model_version=MODEL_VERSION)

    def latest(self, user_id: UUID):
        rows = [row for row in self._history(user_id, 100) if (row[1].model_metadata or {}).get('model_version') == MODEL_VERSION][:1]
        if not rows:
            return None
        c, s, _ = rows[0]
        features = self.db.execute(select(BiomarkerFeature).where(BiomarkerFeature.check_in_id == c.id)).scalars().all()
        m = s.model_metadata or {}
        return AIAnalysisResponse(check_in_id=c.id, overall_score=round(s.overall_score,2), trend=s.trend_category, confidence=round(s.confidence,3), model_name=str(m.get("model_name",MODEL_NAME)), model_version=str(m.get("model_version",MODEL_VERSION)), baseline_observations=int(m.get("baseline_observations",0)), explanation=s.explanation_summary or "No explanation available.", features=[BiomarkerFeatureRead(name=f.feature_name, category=f.feature_category, value=float(f.feature_value), deviation=None) for f in features if f.feature_name in {name for name, _ in FEATURES}], generated_at=s.generated_at, data_quality_score=float(m.get("data_quality_score",0)), modalities_present=list(m.get("modalities_present",[])), top_drivers=list(m.get("top_drivers",[])), recommendations=list(m.get("recommendations",[])), limitations=list(m.get("limitations",[])), missing_modalities=list(m.get("missing_modalities",[])), persistence_signal=str(m.get("persistence_signal","INSUFFICIENT_HISTORY")), context=AIContextSummary(**m.get("context",{})))
