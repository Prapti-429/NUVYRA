"""Regression tests for the non-clinical multimodal research engine.

These tests deliberately exercise the safety-critical invariants of the
research inference layer without requiring a database:
- invalid numeric values are rejected;
- missing modalities are excluded rather than imputed as normal;
- short histories are reported as insufficient for persistence claims;
- repeated deviations can be classified as persistent change;
- data-quality scoring remains bounded.
"""

from types import SimpleNamespace

from app.services.ai_service import AIService, FEATURES, MODALITY_NAMES


def service() -> AIService:
    return AIService(None)  # type: ignore[arg-type]


def test_invalid_numeric_values_are_rejected() -> None:
    engine = service()
    assert engine._safe(None) is None
    assert engine._safe(float("nan")) is None
    assert engine._safe(float("inf")) is None
    assert engine._safe(1e12) is None
    assert engine._safe(0.25) == 0.25


def test_missing_modalities_are_not_imputed() -> None:
    engine = service()
    current = {"voice_pitch_hz": 180.0, "face_motion": 0.2}
    modalities = engine._modalities(current)
    missing = engine._missing(modalities)

    # Voice and camera proxies are intentionally not active score modalities.
    assert modalities == []
    assert set(missing) == set(MODALITY_NAMES)


def test_required_self_report_ranges_are_enforced() -> None:
    engine = service()
    payload = SimpleNamespace(fatigue=3.0, mood_deviation=0.0, energy_level=3.0, sleep_quality=3.0, stress_level=3.0, concentration_level=3.0, physical_comfort=1.0)
    assert engine._invalid_required_ranges(payload) == {}
    payload.fatigue = 6.0
    payload.physical_comfort = 8.0
    invalid = engine._invalid_required_ranges(payload)
    assert set(invalid) == {"fatigue", "physical_comfort"}


def test_required_self_report_completeness_is_bounded() -> None:
    engine = service()
    current = {name: 3.0 for name, _ in FEATURES}
    required = {
        "fatigue": 3.0, "mood_deviation": 0.0, "energy_level": 3.0,
        "sleep_quality": 3.0, "stress_level": 3.0,
        "concentration_level": 3.0, "physical_comfort": 1.0,
    }
    complete_payload = SimpleNamespace(**required)
    incomplete_payload = SimpleNamespace(**{k: v for k, v in required.items() if k != "energy_level"})
    complete = engine._quality(current, complete_payload)
    incomplete = engine._quality(current, incomplete_payload)

    assert complete == 1.0
    assert 0.0 <= incomplete < 1.0


def test_persistence_requires_history() -> None:
    engine = service()
    deviations = {"energy_level": 2.0}
    assert engine._persistence(deviations, []) == "INSUFFICIENT_HISTORY"
    assert engine._persistence(deviations, [None, None]) == "INSUFFICIENT_HISTORY"


def test_persistent_change_requires_repeated_deviation() -> None:
    engine = service()
    deviations = {"energy_level": 2.0}
    # Most-recent first. The same feature is meaningfully away from its
    # personal center in at least two of the last three usable sessions.
    history = [
        (None, None, {"energy_level": 120.0}),
        (None, None, {"energy_level": 118.0}),
        (None, None, {"energy_level": 100.0}),
        (None, None, {"energy_level": 99.0}),
        (None, None, {"energy_level": 101.0}),
    ]
    assert engine._persistence(deviations, history) == "PERSISTENT_CHANGE"


def test_no_deviation_is_not_reported_as_persistent() -> None:
    engine = service()
    history = [(None, None, {"energy_level": 100.0}) for _ in range(5)]
    assert engine._persistence({}, history) == "NO_PERSISTENT_DEVIATION"
