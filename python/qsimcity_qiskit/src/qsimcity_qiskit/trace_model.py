"""Python model of the QSimCity Trace schema (mirrors packages/trace).

The canonical JSON encoding and FNV-1a 64-bit hashing here must byte-match
the TypeScript implementation; schema-parity tests enforce this.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

TRACE_SCHEMA_VERSION = "1.0.0"

SourceClassification = Literal[
    "exact_simulation",
    "sampled_simulation",
    "qiskit_transpiler",
    "qiskit_aer",
    "backend_calibration",
    "measured_import",
    "reference_compiler",
    "estimated",
    "illustrative",
]

CertaintyLabel = Literal[
    "EXACT",
    "COMPUTED",
    "SAMPLED",
    "CALIBRATION",
    "MEASURED",
    "ESTIMATED",
    "ILLUSTRATIVE",
]

DEFAULT_CERTAINTY: dict[str, str] = {
    "exact_simulation": "EXACT",
    "sampled_simulation": "SAMPLED",
    "qiskit_transpiler": "COMPUTED",
    "qiskit_aer": "SAMPLED",
    "backend_calibration": "CALIBRATION",
    "measured_import": "MEASURED",
    "reference_compiler": "COMPUTED",
    "estimated": "ESTIMATED",
    "illustrative": "ILLUSTRATIVE",
}

EVENT_TYPES = frozenset(
    {
        "program.loaded",
        "program.parsed",
        "circuit.normalized",
        "gate.decomposed",
        "layout.assigned",
        "route.selected",
        "routing.swap_inserted",
        "gate.translated",
        "gate.cancelled",
        "circuit.optimized",
        "instruction.scheduled",
        "execution.started",
        "gate.executed",
        "noise.applied",
        "measurement.sampled",
        "classical.condition_evaluated",
        "optimizer.iteration_started",
        "optimizer.iteration_completed",
        "mitigation.applied",
        "execution.completed",
    }
)

STAGES = frozenset(
    {
        "input",
        "parse",
        "normalize",
        "layout",
        "routing",
        "translation",
        "optimization",
        "scheduling",
        "execution",
        "noise",
        "measurement",
        "classical",
        "result",
    }
)


@dataclass
class Provenance:
    generator: str
    generatorVersion: str
    details: dict[str, str | int | float | bool] | None = None


@dataclass
class TraceInstruction:
    id: str
    kind: Literal["gate", "measure", "reset", "barrier"]
    name: str
    qubits: list[int]
    params: list[float]
    clbits: list[int]
    condition: dict[str, Any] | None = None


@dataclass
class TraceCircuit:
    name: str
    numQubits: int
    numClbits: int
    cregs: list[dict[str, Any]]
    instructions: list[TraceInstruction]


@dataclass
class TraceEvent:
    eventId: str
    logicalTick: int
    eventType: str
    stage: str
    logicalQubits: list[int]
    physicalQubits: list[int]
    instructionId: str | None
    source: str
    certainty: str
    payload: dict[str, Any]
    provenance: Provenance
    sourceDurationNs: float | None = None

    def __post_init__(self) -> None:
        if self.eventType not in EVENT_TYPES:
            raise ValueError(f"Unknown event type: {self.eventType}")
        if self.stage not in STAGES:
            raise ValueError(f"Unknown stage: {self.stage}")
        if self.source not in DEFAULT_CERTAINTY:
            raise ValueError(f"Unknown source classification: {self.source}")


@dataclass
class TraceCounts:
    counts: dict[str, int]
    shots: int
    source: str
    certainty: str


@dataclass
class TraceResults:
    idealProbabilities: dict[str, float] | None = None
    idealCounts: TraceCounts | None = None
    noisyCounts: TraceCounts | None = None


@dataclass
class TraceMetrics:
    stage: Literal["input", "compiled"]
    gateCount: int
    twoQubitGateCount: int
    swapCount: int
    depth: int


@dataclass
class TraceTelemetry:
    """Observational provenance that may vary between identical runs.

    Kept because it has real audit value (which Qiskit passes actually ran),
    excluded from the semantic hash because Qiskit does not guarantee it.
    """

    executedPasses: list[str] | None = None
    executedPassCount: int | None = None
    notes: dict[str, Any] | None = None


@dataclass
class Trace:
    schemaVersion: str
    traceId: str
    createdAt: str
    generator: Provenance
    seed: str
    packageVersions: dict[str, str]
    inputHash: str
    deviceId: str | None
    shots: int
    noise: dict[str, float] | None
    inputCircuit: TraceCircuit
    compiledCircuit: TraceCircuit | None
    initialLayout: list[int] | None
    finalLayout: list[int] | None
    metrics: list[TraceMetrics] = field(default_factory=list)
    results: TraceResults = field(default_factory=TraceResults)
    events: list[TraceEvent] = field(default_factory=list)
    telemetry: TraceTelemetry | None = None

    def to_dict(self) -> dict[str, Any]:
        return _strip_none_optionals(asdict(self))

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


def _strip_none_optionals(value: Any) -> Any:
    """Drops keys whose value is None where the TS schema marks them optional.

    The TS serializer simply omits absent optional fields; mirroring that
    keeps canonical JSON identical across languages. `condition`,
    `compiledCircuit`, `initialLayout`, `finalLayout`, `deviceId`, and
    `noise` are nullable (kept); `details`, `sourceDurationNs`, and the
    results entries are optional (dropped when None).
    """
    optional_keys = {
        "details",
        "sourceDurationNs",
        "idealProbabilities",
        "idealCounts",
        "noisyCounts",
        "telemetry",
        "executedPasses",
        "executedPassCount",
        "notes",
    }
    if isinstance(value, dict):
        return {
            k: _strip_none_optionals(v)
            for k, v in value.items()
            if not (k in optional_keys and v is None)
        }
    if isinstance(value, list):
        return [_strip_none_optionals(v) for v in value]
    return value


FNV_OFFSET = 0xCBF29CE484222325
FNV_PRIME = 0x100000001B3
MASK64 = 0xFFFFFFFFFFFFFFFF


def fnv1a64(text: str) -> str:
    """FNV-1a 64-bit over UTF-8 bytes; matches the TypeScript implementation."""
    h = FNV_OFFSET
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * FNV_PRIME) & MASK64
    return f"{h:016x}"


def canonical_json(value: Any) -> str:
    """Canonical JSON with recursively sorted keys; matches the TS encoder."""
    if value is None or isinstance(value, bool):
        return json.dumps(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Cannot canonicalize non-finite number")
        return _js_number(value)
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(v) for v in value) + "]"
    if isinstance(value, dict):
        items = sorted(value.items())
        return (
            "{"
            + ",".join(f"{json.dumps(k, ensure_ascii=False)}:{canonical_json(v)}" for k, v in items)
            + "}"
        )
    raise ValueError(f"Cannot canonicalize value of type {type(value)!r}")


def _js_number(value: float) -> str:
    """Formats a float exactly as ECMAScript Number::toString(10) does.

    Python's repr also produces shortest-roundtrip digits, but the two
    languages place the decimal point and exponent differently (for example
    1e-05 in Python is 0.00001 in JavaScript). Hash parity requires the
    JavaScript rules.
    """
    if value == 0:
        return "0"
    sign = "-" if value < 0 else ""
    s = repr(abs(value))
    if "e" in s:
        mant_str, exp_str = s.split("e")
        exp = int(exp_str)
    else:
        mant_str, exp = s, 0
    int_part, _, frac_part = mant_str.partition(".")
    all_digits = int_part + frac_part
    stripped_leading = all_digits.lstrip("0")
    leading_zeros = len(all_digits) - len(stripped_leading)
    # n: value == 0.digits * 10^n with digits having no leading zeros.
    n = len(int_part) - leading_zeros + exp
    digits = stripped_leading.rstrip("0") or "0"
    k = len(digits)
    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return sign + digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return sign + "0." + "0" * (-n) + digits
    e = n - 1
    mantissa = digits[0] + ("." + digits[1:] if k > 1 else "")
    return f"{sign}{mantissa}e{'+' if e >= 0 else '-'}{abs(e)}"


def trace_content_hash(trace: Trace) -> str:
    """Deterministic content hash excluding traceId and createdAt (TS parity)."""
    data = trace.to_dict()
    data.pop("traceId", None)
    data.pop("createdAt", None)
    return fnv1a64(canonical_json(data))


# Event payload keys treated as observational telemetry, not semantics.
# Mirrors TELEMETRY_PAYLOAD_KEYS in packages/trace/src/hashing-contract.ts.
TELEMETRY_PAYLOAD_KEYS = frozenset(
    {
        "passes",
        "passCount",
        "distinctPassCount",
        "passDurationsSeconds",
        "wallClockSeconds",
    }
)


def semantic_view_of_document(data: dict[str, Any]) -> dict[str, Any]:
    """Projection of a parsed trace document onto reproducible content.

    Operates on the document rather than the dataclass so a committed
    `*.qsimcity.json` file can be verified exactly as it sits on disk.
    Must match `semanticView` in packages/trace/src/hashing-contract.ts.
    """
    events = []
    for event in data["events"]:
        payload = {k: v for k, v in event["payload"].items() if k not in TELEMETRY_PAYLOAD_KEYS}
        projected = {
            "eventId": event["eventId"],
            "logicalTick": event["logicalTick"],
            "eventType": event["eventType"],
            "stage": event["stage"],
            "logicalQubits": event["logicalQubits"],
            "physicalQubits": event["physicalQubits"],
            "instructionId": event["instructionId"],
            "source": event["source"],
            "certainty": event["certainty"],
            "payload": payload,
        }
        if "sourceDurationNs" in event:
            projected["sourceDurationNs"] = event["sourceDurationNs"]
        events.append(projected)
    return {
        "schemaVersion": data["schemaVersion"],
        "seed": data["seed"],
        "inputHash": data["inputHash"],
        "deviceId": data["deviceId"],
        "shots": data["shots"],
        "noise": data["noise"],
        "inputCircuit": data["inputCircuit"],
        "compiledCircuit": data["compiledCircuit"],
        "initialLayout": data["initialLayout"],
        "finalLayout": data["finalLayout"],
        "metrics": data["metrics"],
        "results": data["results"],
        "packageVersions": data["packageVersions"],
        "events": events,
    }


def semantic_view(trace: Trace) -> dict[str, Any]:
    """Projection of a trace onto reproducible, scientifically meaningful data."""
    return semantic_view_of_document(trace.to_dict())


def semantic_hash_of_document(data: dict[str, Any]) -> str:
    """Semantic hash of a parsed trace document."""
    return fnv1a64(canonical_json(semantic_view_of_document(data)))


def semantic_hash(trace: Trace) -> str:
    """Hash of reproducible scientific content; stable across processes."""
    return semantic_hash_of_document(trace.to_dict())


def artifact_hash(serialized: str) -> str:
    """Hash of the exact serialized bytes; detects any tampering."""
    return fnv1a64(serialized)
