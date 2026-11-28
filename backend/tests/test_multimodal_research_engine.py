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
    current = {"energy_level": 180.0, "voice_rms": 0.2}
    modalities = engine._modalities(current)
    missing = engine._missing(modalities)

    # Voice and camera proxies are intentionally not active score modalities.
    assert modalities == []
    assert set(missing) == set(MODALITY_NAMES)


def test_required_self_report_completeness_is_bounded() -> None:
    engine = service()
    payload = SimpleNamespace(source_duration_seconds=20)
    current = {name: 1.0 for name, _ in FEATURES}
    complete = engine._quality(current, payload)
    incomplete = engine._quality({k: v for k, v in current.items() if k != "energy_level"}, payload)

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
