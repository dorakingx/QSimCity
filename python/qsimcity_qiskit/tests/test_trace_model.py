"""Trace model, canonical JSON, and hash-parity tests (mirror the TS suite)."""

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from qsimcity_qiskit.trace_model import (
    Provenance,
    TraceEvent,
    _js_number,
    canonical_json,
    fnv1a64,
)


class TestFnv1a64:
    def test_known_vectors_match_typescript(self) -> None:
        # Identical vectors are asserted in packages/trace/test/hash.test.ts.
        assert fnv1a64("") == "cbf29ce484222325"
        assert fnv1a64("a") == "af63dc4c8601ec8c"
        assert fnv1a64("foobar") == "85944171f73967e8"

    def test_multibyte_utf8(self) -> None:
        assert fnv1a64("café") != fnv1a64("cafe")
        assert len(fnv1a64("\U0001f680")) == 16

    def test_deterministic(self) -> None:
        assert fnv1a64("qsimcity") == fnv1a64("qsimcity")


class TestCanonicalJson:
    def test_sorts_keys_recursively(self) -> None:
        assert canonical_json({"b": 1, "a": {"d": 2, "c": 3}}) == '{"a":{"c":3,"d":2},"b":1}'

    def test_preserves_array_order(self) -> None:
        assert canonical_json([3, 1, 2]) == "[3,1,2]"

    def test_rejects_non_finite(self) -> None:
        with pytest.raises(ValueError):
            canonical_json({"a": math.nan})
        with pytest.raises(ValueError):
            canonical_json(math.inf)

    def test_strings_and_bools(self) -> None:
        assert canonical_json({"t": True, "s": "x"}) == '{"s":"x","t":true}'
        assert canonical_json(None) == "null"


class TestJsNumberFormatting:
    """_js_number must match JavaScript JSON.stringify exactly."""

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            (0.0, "0"),
            (1.0, "1"),
            (-1.0, "-1"),
            (0.5, "0.5"),
            (1024.0, "1024"),
            (0.1, "0.1"),
            (1e-5, "0.00001"),
            (1e-6, "0.000001"),
            (1e-7, "1e-7"),
            (1.5e-7, "1.5e-7"),
            (1e21, "1e+21"),
            (1e20, "100000000000000000000"),
            (3.141592653589793, "3.141592653589793"),
            (-0.001953125, "-0.001953125"),
            (0.30000000000000004, "0.30000000000000004"),
        ],
    )
    def test_matches_javascript(self, value: float, expected: str) -> None:
        assert _js_number(value) == expected

    @given(st.floats(allow_nan=False, allow_infinity=False, width=64))
    def test_round_trips(self, value: float) -> None:
        formatted = _js_number(value)
        assert float(formatted) == value


class TestTraceEvent:
    def _provenance(self) -> Provenance:
        return Provenance(generator="test", generatorVersion="1.0.0")

    def test_rejects_unknown_event_type(self) -> None:
        with pytest.raises(ValueError, match="Unknown event type"):
            TraceEvent(
                eventId="e0",
                logicalTick=1,
                eventType="bogus.event",
                stage="input",
                logicalQubits=[],
                physicalQubits=[],
                instructionId=None,
                source="exact_simulation",
                certainty="EXACT",
                payload={},
                provenance=self._provenance(),
            )

    def test_rejects_unknown_stage(self) -> None:
        with pytest.raises(ValueError, match="Unknown stage"):
            TraceEvent(
                eventId="e0",
                logicalTick=1,
                eventType="program.loaded",
                stage="warp",
                logicalQubits=[],
                physicalQubits=[],
                instructionId=None,
                source="exact_simulation",
                certainty="EXACT",
                payload={},
                provenance=self._provenance(),
            )

    def test_rejects_unknown_source(self) -> None:
        with pytest.raises(ValueError, match="Unknown source"):
            TraceEvent(
                eventId="e0",
                logicalTick=1,
                eventType="program.loaded",
                stage="input",
                logicalQubits=[],
                physicalQubits=[],
                instructionId=None,
                source="vibes",
                certainty="EXACT",
                payload={},
                provenance=self._provenance(),
            )

    def test_accepts_valid_event(self) -> None:
        ev = TraceEvent(
            eventId="e0",
            logicalTick=1,
            eventType="gate.executed",
            stage="execution",
            logicalQubits=[0],
            physicalQubits=[],
            instructionId="i0",
            source="exact_simulation",
            certainty="EXACT",
            payload={"gate": "h"},
            provenance=self._provenance(),
        )
        assert ev.eventId == "e0"
