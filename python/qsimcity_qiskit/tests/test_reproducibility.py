"""Trace reproducibility contract tests.

The contract has two levels:

- `semanticHash` covers scientifically meaningful content and must be stable
  across independent processes and machines.
- `artifactHash` covers the exact serialized bytes and must change whenever
  anything at all changes, including telemetry.

Observational telemetry (Qiskit's executed pass list) is preserved rather than
discarded, and must not influence `semanticHash`.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from qsimcity_qiskit.generate import SAMPLE_PLAN, build_trace
from qsimcity_qiskit.trace_model import (
    TELEMETRY_PAYLOAD_KEYS,
    Trace,
    TraceTelemetry,
    artifact_hash,
    semantic_hash,
    semantic_view,
)

CIRCUITS = Path(__file__).resolve().parents[3] / "examples" / "circuits"
TRACES = Path(__file__).resolve().parents[3] / "examples" / "traces"

INDEPENDENT_PROCESS_RUNS = 10


def _bell() -> Trace:
    return build_trace(
        (CIRCUITS / "bell.qasm").read_text(),
        "bell",
        "linear-5",
        shots=256,
        seed=42,
        with_noise=False,
    )


class TestSemanticStability:
    def test_semantic_hash_stable_in_process(self) -> None:
        hashes = {semantic_hash(_bell()) for _ in range(5)}
        assert len(hashes) == 1

    def test_semantic_hash_stable_across_independent_processes(self) -> None:
        """Ten separate interpreters must agree on the semantic hash."""
        script = (
            "from pathlib import Path;"
            "from qsimcity_qiskit.generate import build_trace;"
            "from qsimcity_qiskit.trace_model import semantic_hash;"
            f"qasm=Path(r'{CIRCUITS / 'bell.qasm'}').read_text();"
            "print(semantic_hash(build_trace(qasm,'bell','linear-5',"
            "shots=256,seed=42,with_noise=False)))"
        )
        hashes = set()
        for _ in range(INDEPENDENT_PROCESS_RUNS):
            out = subprocess.run(
                [sys.executable, "-c", script],
                capture_output=True,
                text=True,
                check=True,
                timeout=300,
            )
            hashes.add(out.stdout.strip())
        assert len(hashes) == 1, f"semantic hash varied across processes: {hashes}"

    def test_every_sample_plan_entry_is_process_stable(self) -> None:
        for plan in SAMPLE_PLAN[:2]:  # two representative circuits keeps this fast
            qasm = (CIRCUITS / f"{plan['id']}.qasm").read_text()
            hashes = {
                semantic_hash(
                    build_trace(
                        qasm,
                        str(plan["id"]),
                        str(plan["device"]),
                        shots=int(plan["shots"]),  # type: ignore[arg-type]
                        seed=int(plan["seed"]),  # type: ignore[arg-type]
                        with_noise=bool(plan["noise"]),
                    )
                )
                for _ in range(3)
            }
            assert len(hashes) == 1, f"{plan['id']} semantic hash unstable"


class TestTelemetryIsPreservedButNotSemantic:
    def test_telemetry_records_the_real_executed_passes(self) -> None:
        trace = _bell()
        assert trace.telemetry is not None
        passes = trace.telemetry.executedPasses
        assert passes is not None and len(passes) > 5
        # These are real Qiskit pass class names, not a placeholder list.
        assert "BasisTranslator" in passes
        assert trace.telemetry.executedPassCount == len(passes)

    def test_changing_telemetry_does_not_change_semantic_hash(self) -> None:
        trace = _bell()
        before = semantic_hash(trace)
        trace.telemetry = TraceTelemetry(
            executedPasses=["CompletelyDifferentPass"] * 3,
            executedPassCount=3,
        )
        assert semantic_hash(trace) == before

    def test_changing_telemetry_does_change_artifact_hash(self) -> None:
        trace = _bell()
        before = artifact_hash(trace.to_json())
        trace.telemetry = TraceTelemetry(executedPasses=["Other"], executedPassCount=1)
        assert artifact_hash(trace.to_json()) != before

    def test_telemetry_payload_keys_are_excluded_from_the_semantic_view(self) -> None:
        trace = _bell()
        view = semantic_view(trace)
        for event in view["events"]:
            for key in TELEMETRY_PAYLOAD_KEYS:
                assert key not in event["payload"]
        # …while the raw trace still carries them for auditing.
        raw = trace.to_dict()
        optimized = [e for e in raw["events"] if e["eventType"] == "circuit.optimized"]
        assert optimized and "passes" in optimized[0]["payload"]


class TestSemanticChangesAreDetected:
    @pytest.mark.parametrize(
        "mutate",
        [
            pytest.param(lambda t: setattr(t, "seed", "999"), id="seed"),
            pytest.param(lambda t: setattr(t, "shots", 4096), id="shots"),
            pytest.param(lambda t: setattr(t, "deviceId", "ring-8"), id="device"),
            pytest.param(lambda t: setattr(t, "initialLayout", [4, 3]), id="initial-layout"),
            pytest.param(lambda t: setattr(t, "finalLayout", [3, 4]), id="final-layout"),
            pytest.param(
                lambda t: t.metrics.__setitem__(
                    0,
                    t.metrics[0].__class__(
                        stage="input", gateCount=999, twoQubitGateCount=1, swapCount=0, depth=3
                    ),
                ),
                id="metrics",
            ),
        ],
    )
    def test_semantic_change_alters_the_semantic_hash(self, mutate) -> None:  # type: ignore[no-untyped-def]
        trace = _bell()
        before = semantic_hash(trace)
        mutate(trace)
        assert semantic_hash(trace) != before

    def test_compiled_circuit_change_alters_the_semantic_hash(self) -> None:
        trace = _bell()
        before = semantic_hash(trace)
        assert trace.compiledCircuit is not None
        trace.compiledCircuit.instructions = trace.compiledCircuit.instructions[:-1]
        assert semantic_hash(trace) != before

    def test_results_change_alters_the_semantic_hash(self) -> None:
        trace = _bell()
        before = semantic_hash(trace)
        assert trace.results.idealCounts is not None
        trace.results.idealCounts.counts = {"00": 256}
        assert semantic_hash(trace) != before


class TestEnvironmentVersionsAreNotSemantic:
    """The contract that made CI red while the local gate said 33/33.

    `packageVersions` records `platform.python_version()`. It used to sit
    inside the semantic view, so a trace generated on Python 3.12.12 could
    not be reproduced on a runner with 3.12.3 even though every circuit,
    layout, metric, result and event was identical — the hash was reporting
    on the interpreter, not on the science.
    """

    def test_package_versions_do_not_affect_the_semantic_hash(self) -> None:
        trace = _bell()
        before = semantic_hash(trace)
        trace.packageVersions = {
            **trace.packageVersions,
            "python": "3.99.0",
            "qiskit": "99.0.0",
            "qiskit-aer": "99.0.0",
        }
        assert semantic_hash(trace) == before

    def test_python_patch_version_alone_does_not_affect_the_semantic_hash(self) -> None:
        """The exact CI-versus-local difference, pinned as a regression test."""
        trace = _bell()
        trace.packageVersions = {**trace.packageVersions, "python": "3.12.12"}
        local = semantic_hash(trace)
        trace.packageVersions = {**trace.packageVersions, "python": "3.12.3"}
        assert semantic_hash(trace) == local

    def test_package_versions_still_affect_the_artifact_hash(self) -> None:
        trace = _bell()
        before = artifact_hash(trace.to_json())
        trace.packageVersions = {**trace.packageVersions, "python": "3.99.0"}
        assert artifact_hash(trace.to_json()) != before

    def test_package_versions_are_still_recorded_as_provenance(self) -> None:
        trace = _bell()
        document = json.loads(trace.to_json())
        assert "python" in document["packageVersions"]
        assert "qiskit" in document["packageVersions"]
        assert "qiskit-aer" in document["packageVersions"]

    def test_identity_and_timestamp_do_not_affect_the_semantic_hash(self) -> None:
        trace = _bell()
        before = semantic_hash(trace)
        trace.traceId = "t-something-else"
        trace.createdAt = "2000-01-01T00:00:00.000Z"
        assert semantic_hash(trace) == before


class TestArtifactIntegrity:
    def test_any_byte_tampering_changes_the_artifact_hash(self) -> None:
        serialized = _bell().to_json()
        assert artifact_hash(serialized) != artifact_hash(serialized + " ")
        assert artifact_hash(serialized) != artifact_hash(serialized.replace("bell", "bel1", 1))

    def test_committed_samples_match_their_recorded_hashes(self) -> None:
        manifest = json.loads((TRACES / "manifest.json").read_text())
        assert manifest, "manifest is empty"
        for sample_id, hashes in manifest.items():
            assert set(hashes) == {"semanticHash", "artifactHash"}
            serialized = (TRACES / f"{sample_id}.qsimcity.json").read_text()
            assert artifact_hash(serialized) == hashes["artifactHash"], (
                f"{sample_id}: committed bytes do not match the recorded artifactHash"
            )

    def test_regenerated_samples_match_the_recorded_semantic_hashes(self) -> None:
        manifest = json.loads((TRACES / "manifest.json").read_text())
        for plan in SAMPLE_PLAN:
            sample_id = str(plan["id"])
            regenerated = build_trace(
                (CIRCUITS / f"{sample_id}.qasm").read_text(),
                sample_id,
                str(plan["device"]),
                shots=int(plan["shots"]),  # type: ignore[arg-type]
                seed=int(plan["seed"]),  # type: ignore[arg-type]
                with_noise=bool(plan["noise"]),
            )
            assert semantic_hash(regenerated) == manifest[sample_id]["semanticHash"], (
                f"{sample_id}: regeneration does not reproduce the recorded semanticHash"
            )
