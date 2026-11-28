# NUVYRA measurement and evidence policy

Status: product-development policy for a non-diagnostic prototype. This document is not a clinical validation report and does not establish clinical performance.

## Core rule

NUVYRA must distinguish four different things:

1. **Data completeness** — whether required questions or fields were supplied.
2. **Capture quality** — whether a recording or document is technically readable.
3. **Measurement validity** — whether the method reliably measures the named feature under the stated conditions.
4. **Clinical validity and utility** — whether the measurement has a demonstrated relationship to a defined clinical concept in the intended population and whether it improves a real care task.

These are not interchangeable. An 80% capture-quality score is not 80% measurement accuracy, diagnostic accuracy, or clinical confidence. Do not label a heuristic score as accuracy, confidence, or probability.

## Check-in acceptance rule

The five core self-reported reflections are fatigue, energy, sleep quality, stress and concentration. A check-in may be saved when at least four of these five fields are supplied with values inside their allowed ranges. This is an 80% **field-completeness** threshold only. It cannot establish that a person's answer is true, that a signal is accurate, or that any clinical interpretation is correct. Missing fields are excluded from the feature vector; they are never filled with an assumed normal value. Optional mood and physical-comfort context must not be guessed or made a barrier to completing the check-in.

## Current product boundary

- The current personal-pattern analysis uses self-reported check-in fields only.
- The current backend explicitly excludes voice and camera-derived features from its numerical pattern score.
- The current camera capture routine only examines average image brightness and frame-to-frame pixel change. It does not detect a face, verify face position, track eye landmarks, measure blinking, estimate breathing, or validate facial geometry.
- The current voice routine estimates waveform-level quantities and speech activity. It does not establish speech intelligibility, identify the spoken words, or demonstrate a disease-specific biomarker.
- Uploaded documents are currently summarized as background context. Their laboratory values are not incorporated into the numerical pattern score. OCR or AI extraction is not proof that a value was read correctly.

Until a modality passes the validation steps below, it must not contribute to a health interpretation, a personal-pattern score, a report conclusion, or a clinician-facing claim. Do not collect sensitive audio/video solely to create the impression of multimodal analysis.

## Candidate modalities and evidence boundaries

### Patient-reported context
Self-reported symptoms, energy, fatigue, sleep, stress, concentration, and functional changes can be useful longitudinal context. They are reports of experience, not objective measurements or diagnoses. Preserve the person's wording, timing, severity, duration, frequency, and relevant context. Do not convert an unvalidated symptom checklist into a disease score.

### Voice and speech
Speech features such as pitch, intensity, pauses, articulation, speech timing, and prosody are active research areas. A 2025 systematic review and meta-analysis of 96 studies reported promising associations across multiple conditions, but found substantial heterogeneity by language, device, task, feature and algorithm, with high risk of bias in many included studies. Current NUVYRA voice heuristics are not a validated clinical measurement. Keep them out of clinical/personal health interpretation until there is a fixed protocol, validated signal processing, language-specific evaluation, and independent prospective validation.

Reference: https://pubmed.ncbi.nlm.nih.gov/41062257/

Parkinson's research includes voice-based smartphone tasks and longitudinal speech features, but this does not mean a generic 20-second recording can detect Parkinson's disease or be generalized to other conditions.

References:
- https://pubmed.ncbi.nlm.nih.gov/39001636/
- https://pubmed.ncbi.nlm.nih.gov/40643097/

### Face, eye and facial movement
Facial movement and blink metrics are being investigated in neurological research. A recent study included small and imbalanced groups for some diagnoses and explicitly called for expanded longitudinal validation. Its controlled clinic recording setup cannot be assumed equivalent to a user's ordinary phone selfie. Do not infer disease, mood, pain, fatigue, or neurological status from facial appearance or expressions. Do not treat a blink estimate as valid without a verified landmark/tracking method, frame-rate checks, occlusion handling, and test-retest evaluation.

Reference: https://pubmed.ncbi.nlm.nih.gov/42453495/

### Breathing and respiratory signals
Do not infer respiratory rate or breathing quality from ordinary still photographs or generic selfie video. Respiratory audio research typically uses task-specific cough, breath, or lung-sound recordings and still faces substantial clinical-validation and bias challenges. NUVYRA's current selfie-video brightness/motion routine cannot measure breathing.

Reference: https://pubmed.ncbi.nlm.nih.gov/40368428/

### Camera-derived pulse or other vital signs
Remote photoplethysmography is a distinct technical method, not generic facial analysis. Lighting, motion, frame rate, compression, skin reflectance, device and population can affect its signal. No heart rate, blood pressure, oxygen saturation, or respiratory rate should be reported from NUVYRA's current camera routine.

References:
- https://pubmed.ncbi.nlm.nih.gov/34240262/
- https://www.sciencedirect.com/science/article/pii/S2590005626002924

### Uploaded laboratory reports and medical documents
The original document is the source of truth. Extracted text must remain traceable to the filename, page/section where possible, date, test name, value, unit, and the reference interval printed by that laboratory. If any of these are unclear, display **Needs review** and do not guess.

A plain-language explanation may describe what a test generally measures. It must not diagnose, recommend treatment, or declare a result normal/abnormal using a generic range. Reference intervals differ by laboratory, method, age, sex and other context. Only state whether a result is outside the *reference interval printed on that same report* when the value, unit and interval have been reliably extracted and verified. Keep extracted content separate from clinician-verified information.

Current document OCR/AI summaries do not yet meet this standard. They must not be represented as validated lab interpretation.

## Check-in gating

- Require every field that is explicitly marked required; validate allowed ranges, units, and internally consistent values.
- A missing required field means the check-in is incomplete. Explain exactly what is missing.
- A failed microphone or camera permission request must not be disguised as a successful measurement.
- Do not force camera or voice capture when those modalities are not used by the analysis.
- If a future validated modality is enabled, use modality-specific technical checks and reject unusable samples with one short, actionable instruction at a time.
- Show capture quality separately from data completeness. Never call either one clinical accuracy.
- Do not proceed with a purported measurement if its own quality controls fail. Exclude it from the report and clearly mark it unavailable; do not impute a normal value.

## Validation required before any clinical claim

For every candidate feature, document:
- Intended use, target population, and exact clinical construct.
- Acquisition protocol, devices, languages, environment, and preprocessing.
- Analytical validity: repeatability, reproducibility, measurement error, agreement with a suitable reference method, and failure rates.
- Clinical validity: comparison against an appropriate clinician-established or laboratory reference standard.
- Prospective, external, multicentre validation with participant-level separation between training and test data.
- Performance with confidence intervals, calibration, sensitivity, specificity, predictive values at realistic prevalence, subgroup performance, and missing-data behaviour.
- Usability testing to confirm that people understand and can follow the instructions.
- Independent clinical review, privacy/security review, and regulatory assessment for the intended market and claims.

Do not choose an arbitrary “80% accuracy” threshold. The acceptable performance must be justified for the exact intended use and harm profile, agreed with qualified clinical/statistical/regulatory experts, and supported by independent evidence.

FDA references:
- https://www.fda.gov/regulatory-information/search-fda-guidance-documents/digital-health-technologies-remote-data-acquisition-clinical-investigations
- https://www.fda.gov/medical-devices/digital-health-center-excellence/key-considerations-development-and-use-digitally-derived-measures-clinical-investigations-fda-paper

WHO reference:
- https://www.who.int/publications/i/item/9789240029200

## Patient-facing report design

Use a calm, readable, interactive experience rather than a wall of medical text. For each item, show:

1. **What was recorded** — the exact reported value or extracted result.
2. **What it means in everyday language** — a short neutral explanation.
3. **Compared with** — the person's prior usable observations, or the lab's own printed interval when reliably extracted.
4. **What may affect it** — relevant context and known confounders.
5. **How certain the extraction/measurement is** — a technical status with a plain explanation, never a disease probability.
6. **What is missing or needs review** — explicit, visible uncertainty.

Use progressive disclosure: one short instruction per screen, a simple illustration or progress indicator, optional “Why are we asking?” details, and one next action. Avoid frightening colour coding, disease predictions, and false precision.

## Release gate

Do not describe a feature as clinically accurate, validated, diagnostic, or ready for clinician decision-making until its evidence file, independent validation, safety review, and intended-use/regulatory review are complete. A successful software build or a passing capture heuristic does not satisfy this gate.
