# NUVYRA

**Longitudinal health-monitoring prototype built around multimodal everyday signals.**

NUVYRA explores how repeated, structured observations collected between clinical visits can help make changes in a person's health trajectory easier to see over time.

The current prototype combines **daily self-report with voice, camera-based facial/eye observations, movement and breathing proxies, and longitudinal trend views**. It is designed as an observational and decision-support layer — **not as a diagnostic system, medical device, or replacement for a clinician.**

> **Project status:** Working prototype / pre-incubation stage. The system is intended for development, testing, and exploration of longitudinal monitoring workflows; it has not been clinically validated.

## Why NUVYRA?

Healthcare observations are often episodic. A person may experience gradual changes between appointments, while the clinical record mainly captures what is observed or reported during a relatively small number of encounters.

NUVYRA explores a different workflow:

**Repeated everyday observations → longitudinal baseline → multimodal features → trend/context → structured review**

The focus is not collecting more data for its own sake. The goal is to preserve **context and change over time**.

## What the prototype does

### Daily multimodal check-in

A user can complete a structured check-in that combines:

- Self-reported symptoms and day-to-day observations
- Voice recording and speech features
- Camera-based facial/eye observations
- Whole-frame movement proxies
- Breathing-related visual proxies
- Repeated observations that can be compared against a person's own history

The interface also communicates important limitations of camera-derived measurements, such as sensitivity to lighting and the fact that movement observations are not a clinical gait examination.

### Longitudinal dashboard

NUVYRA organizes repeated observations into a longitudinal view rather than treating each check-in as an isolated event. The dashboard surfaces recent measurements, changes, and a derived stability/status view for the prototype.

### Digital-biomarker exploration

The project contains feature extraction and interpretation logic for signals such as:

- Voice/speech characteristics
- Facial and eye/blink observations
- Movement-related proxies
- Breathing-related observations
- Sleep, stress, energy, concentration, mood, fatigue, and other self-reported context

These features are intended as **observational proxies**, not established clinical biomarkers or diagnostic measurements.

### Clinical View

The prototype includes a structured **Clinical View** that brings together participant-reported information, clinical telemetry, and NUVYRA observations for observational review.

It explicitly does **not** diagnose, triage, or replace clinical judgment.

### AI companion

NUVYRA includes an AI companion layer that can answer questions about the platform and explain concepts such as baselines, trends, and the signals being collected. It is intended to help users understand their data and the prototype workflow, rather than provide medical diagnosis or treatment decisions.

## Core idea

A single measurement can be noisy. A repeated observation can provide context.

NUVYRA therefore emphasizes **personal longitudinal baselines** rather than assuming that one universal threshold can describe every person.

The project is exploring how multimodal signals can be organized around that baseline while keeping uncertainty, data quality, and the limits of each signal visible to the user.

## Architecture

NUVYRA is currently organized as a React frontend and a Python/FastAPI backend.

```text
NUVYRA
├── frontend/                 # React + TypeScript web application
│   └── src/
│       ├── pages/            # Dashboard, check-ins, biomarkers, Clinical View, etc.
│       └── ...
│
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── api/              # API routes and authentication
│   │   ├── services/         # AI, companion and application services
│   │   ├── db/               # Database/session layer
│   │   └── ...
│   ├── alembic/              # Database migrations
│   ├── model.py              # Domain/database models
│   └── requirements.txt
│
└── render.yaml              # Deployment configuration
```

### Main technologies

**Frontend**
- React
- TypeScript
- React Router
- React Hook Form
- Tailwind CSS
- Axios

**Backend**
- Python
- FastAPI
- Uvicorn
- SQLAlchemy
- Alembic
- Pydantic / pydantic-settings
- PostgreSQL-compatible database connectivity via psycopg
- JWT-based authentication
- OpenCV for computer-vision processing
- scikit-learn for machine-learning utilities
- Pillow for image processing

The repository also includes automated backend compilation/regression checks through GitHub Actions.

## Local development

### 1. Clone the repository

```bash
git clone https://github.com/Prapti-429/NUVYRA.git
cd NUVYRA
```

### 2. Backend

Create and activate a Python virtual environment, then install the backend dependencies:

```bash
cd backend
python -m venv .venv
```

**Windows:**

```bash
.venv\Scripts\activate
```

**macOS/Linux:**

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

The backend uses environment-based configuration for items such as the database connection and authentication settings. Configure the required environment variables for your local deployment before starting the application.

Run database migrations:

```bash
python -m alembic upgrade head
```

Start the API:

```bash
python -m uvicorn main:app --reload
```

### 3. Frontend

From the repository root, install the frontend dependencies using the project's package manager and start the React development server according to the frontend configuration.

The frontend communicates with the FastAPI backend through the configured API base URL.

## Deployment

The repository includes Render configuration for the backend. The deployment configuration installs `backend/requirements.txt`, applies Alembic migrations, and starts the FastAPI application with Uvicorn.

Production deployments should use environment variables for secrets and infrastructure configuration rather than committing credentials to the repository.

## Data and safety considerations

NUVYRA works with information that can be sensitive in a real-world health setting. The current project should therefore be treated as a **prototype**, not a production clinical system.

Important limitations:

- The prototype has **not been clinically validated**.
- Digital features are proxies and can be affected by recording quality, lighting, device differences, environment, and user behavior.
- A change in a feature does not establish a medical cause.
- The system is not intended to diagnose disease or replace professional medical judgment.
- Prototype data should not be treated as a substitute for medical records or professional care.

If the system is developed for real-world clinical use, additional work would be required around clinical validation, privacy, security, consent, data governance, model evaluation, bias assessment, reliability, and applicable regulatory requirements.

## Current scope

The current build focuses on demonstrating the core longitudinal workflow:

1. Create/authenticate a user account.
2. Complete repeated check-ins.
3. Capture multimodal observations where supported by the device/browser.
4. Extract and store structured features.
5. Compare observations over time.
6. Present longitudinal trends and context.
7. Provide a structured observational/clinical review layer.

This is an actively developing prototype. Some capabilities represented in the product interface are exploratory and should not be interpreted as clinically established functionality.

## Roadmap

The project is being developed toward a more rigorous longitudinal-monitoring platform. Areas for future work include:

- Better personal-baseline modeling
- Improved signal-quality checks and uncertainty reporting
- More robust multimodal feature extraction
- Longitudinal reports and structured exports
- Stronger privacy and consent controls
- More systematic validation of individual features
- Clinician-informed workflow design
- Integration with clinical systems or devices where appropriate
- Evaluation across diverse devices, environments, and populations

## Author

**Prapti Sharma**

NUVYRA is an independently developed student prototype exploring the intersection of software engineering, AI, and longitudinal health monitoring.

## Disclaimer

NUVYRA is a software prototype for research, development, and exploration. It is **not a medical device and does not provide medical diagnosis, treatment, triage, or emergency advice**. Information or observations produced by the prototype should not be used as a substitute for advice from a qualified healthcare professional.

## License

A project license has not currently been specified in this repository. Until a license is added, the repository should not be assumed to grant permission to reuse, modify, or redistribute the code.
