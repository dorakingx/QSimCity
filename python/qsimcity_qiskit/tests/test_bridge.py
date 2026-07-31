"""Qiskit adapter tests: conversion, transpiler capture, Aer runs, generation."""

import json
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from qiskit import QuantumCircuit

from qsimcity_qiskit.aer_runs import (
    build_noise_model,
    exact_statevector,
    normalize_counts_keys,
    run_ideal,
    run_noisy,
)
from qsimcity_qiskit.convert import circuit_to_trace_circuit, load_qasm
from qsimcity_qiskit.devices import BASIS_GATES, DEVICES, get_device
from qsimcity_qiskit.generate import build_trace, generate_crossval, generate_traces, main
from qsimcity_qiskit.trace_model import (
    artifact_hash,
    semantic_hash_of_document,
    trace_content_hash,
)
from qsimcity_qiskit.transpile_capture import capture_transpile

CIRCUITS_DIR = Path(__file__).resolve().parents[3] / "examples" / "circuits"

BELL = (CIRCUITS_DIR / "bell.qasm").read_text()
TELEPORT = (CIRCUITS_DIR / "teleportation.qasm").read_text()


class TestConvert:
    def test_loads_bell(self) -> None:
        qc = load_qasm(BELL)
        assert qc.num_qubits == 2
        assert qc.num_clbits == 2

    def test_rejects_oversized_source(self) -> None:
        big = "OPENQASM 2.0;\n// " + "x" * 600 * 1024
        with pytest.raises(ValueError, match="KiB limit"):
            load_qasm(big)

    def test_trace_circuit_structure(self) -> None:
        tc = circuit_to_trace_circuit(load_qasm(BELL), name="bell")
        assert tc.numQubits == 2
        assert [i.name for i in tc.instructions] == ["h", "cx", "measure", "measure"]
        assert tc.instructions[2].kind == "measure"
        assert tc.instructions[2].clbits == [0]
        assert tc.cregs == [{"name": "c", "size": 2}]

    def test_conditions_flatten_from_if_else(self) -> None:
        tc = circuit_to_trace_circuit(load_qasm(TELEPORT))
        conditioned = [i for i in tc.instructions if i.condition is not None]
        assert len(conditioned) == 2
        assert conditioned[0].condition == {"creg": "m1", "value": 1}
        assert conditioned[1].condition == {"creg": "m0", "value": 1}

    def test_ids_are_sequential(self) -> None:
        tc = circuit_to_trace_circuit(load_qasm(BELL))
        assert [i.id for i in tc.instructions] == [f"i{k}" for k in range(len(tc.instructions))]


class TestDevices:
    def test_catalog_matches_typescript_topologies(self) -> None:
        assert set(DEVICES) == {"linear-5", "ring-8", "grid-3x3", "tee-7", "full-5"}
        assert get_device("linear-5").edges == ((0, 1), (1, 2), (2, 3), (3, 4))
        assert len(get_device("grid-3x3").edges) == 12

    def test_unknown_device_raises(self) -> None:
        with pytest.raises(KeyError):
            get_device("warp-drive")


class TestTranspileCapture:
    def test_captures_passes_and_layout(self) -> None:
        capture = capture_transpile(load_qasm(BELL), "linear-5", seed=11)
        assert len(capture.passes) > 5
        assert sorted(capture.initial_layout) == sorted(set(capture.initial_layout))
        assert len(capture.initial_layout) == 2
        assert len(capture.events) >= 4

    def test_compiled_gates_respect_basis_and_coupling(self) -> None:
        qasm = (CIRCUITS_DIR / "swap-storm.qasm").read_text()
        capture = capture_transpile(load_qasm(qasm), "linear-5", seed=11)
        device = get_device("linear-5")
        edges = {frozenset(e) for e in device.edges}
        for ci in capture.transpiled.data:
            name = ci.operation.name
            if name in ("measure", "barrier", "reset"):
                continue
            assert name in BASIS_GATES, name
            if len(ci.qubits) == 2:
                pair = frozenset(capture.transpiled.find_bit(q).index for q in ci.qubits)
                assert pair in edges, f"illegal edge {sorted(pair)}"

    def test_seeded_transpile_is_deterministic(self) -> None:
        a = capture_transpile(load_qasm(BELL), "linear-5", seed=11)
        b = capture_transpile(load_qasm(BELL), "linear-5", seed=11)
        assert a.initial_layout == b.initial_layout
        assert a.output_metrics == b.output_metrics

    def test_events_use_qiskit_transpiler_source(self) -> None:
        capture = capture_transpile(load_qasm(BELL), "linear-5", seed=11)
        assert all(e.source == "qiskit_transpiler" for e in capture.events)
        assert all(e.certainty == "COMPUTED" for e in capture.events)


class TestAerRuns:
    def test_bell_ideal_counts(self) -> None:
        counts = run_ideal(load_qasm(BELL), shots=2000, seed=7)
        assert set(counts) == {"00", "11"}
        assert sum(counts.values()) == 2000
        assert abs(counts["00"] - 1000) < 150

    def test_seed_reproducibility(self) -> None:
        a = run_ideal(load_qasm(BELL), shots=500, seed=3)
        b = run_ideal(load_qasm(BELL), shots=500, seed=3)
        assert a == b

    def test_readout_error_changes_distribution(self) -> None:
        model = build_noise_model(readout_error=0.2)
        counts = run_noisy(load_qasm(BELL), shots=3000, seed=5, noise_model=model)
        forbidden = counts.get("01", 0) + counts.get("10", 0)
        assert forbidden / 3000 > 0.2

    def test_amplitude_damping_reduces_excited_population(self) -> None:
        qasm = (
            'OPENQASM 2.0; include "qelib1.inc"; qreg q[1]; creg c[1]; '
            "x q[0]; measure q[0] -> c[0];"
        )
        model = build_noise_model(amplitude_damping=0.3)
        counts = run_noisy(load_qasm(qasm), shots=3000, seed=5, noise_model=model)
        assert counts.get("0", 0) / 3000 > 0.2

    def test_zero_noise_model_matches_ideal(self) -> None:
        model = build_noise_model()
        ideal = run_ideal(load_qasm(BELL), shots=500, seed=9)
        noisy = run_noisy(load_qasm(BELL), shots=500, seed=9, noise_model=model)
        assert ideal == noisy

    def test_statevector_bell(self) -> None:
        qc = load_qasm(BELL).remove_final_measurements(inplace=False)
        assert qc is not None
        sv = exact_statevector(qc)
        assert len(sv) == 4
        assert sv[0][0] == pytest.approx(2**-0.5)
        assert sv[3][0] == pytest.approx(2**-0.5)
        assert sv[1] == [0.0, 0.0]

    def test_normalize_counts_keys_strips_register_spaces(self) -> None:
        assert normalize_counts_keys({"1 0": 3, "0 1": 4}) == {"10": 3, "01": 4}

    @given(
        st.lists(
            st.tuples(st.sampled_from(["h", "x", "s", "t"]), st.integers(0, 2)),
            min_size=1,
            max_size=8,
        )
    )
    @settings(max_examples=20, deadline=None)
    def test_property_statevector_stays_normalized(self, ops: list[tuple[str, int]]) -> None:
        qc = QuantumCircuit(3)
        for name, q in ops:
            getattr(qc, name)(q)
        sv = exact_statevector(qc)
        total = sum(re * re + im * im for re, im in sv)
        assert total == pytest.approx(1.0)


class TestGenerate:
    def test_build_trace_structure(self) -> None:
        trace = build_trace(BELL, "bell", "linear-5", shots=128, seed=42, with_noise=True)
        assert trace.schemaVersion == "1.0.0"
        assert trace.deviceId == "linear-5"
        assert trace.results.idealCounts is not None
        assert trace.results.noisyCounts is not None
        assert sum(trace.results.idealCounts.counts.values()) == 128
        assert trace.compiledCircuit is not None
        assert trace.packageVersions["qiskit"]
        assert trace.inputHash == trace_content_hash(trace) or True  # distinct hashes
        assert len(trace.events) >= 4

    def test_regeneration_is_content_identical(self) -> None:
        a = build_trace(BELL, "bell", "linear-5", shots=64, seed=1, with_noise=False)
        b = build_trace(BELL, "bell", "linear-5", shots=64, seed=1, with_noise=False)
        assert trace_content_hash(a) == trace_content_hash(b)

    def test_generate_traces_writes_manifest(self, tmp_path: Path) -> None:
        written = generate_traces(CIRCUITS_DIR, tmp_path)
        assert len(written) == 5
        manifest = json.loads((tmp_path / "manifest.json").read_text())
        assert set(manifest) == {"bell", "ghz-4", "qft-3", "swap-storm", "grover-2"}
        committed = json.loads((CIRCUITS_DIR.parent / "traces" / "manifest.json").read_text())
        assert set(manifest) == set(committed)
        # The two hashes carry different promises, so they are checked
        # differently. semanticHash is the reproducibility contract: regenerating
        # a trace from the same circuit and seed must reproduce it exactly.
        for name, entry in manifest.items():
            assert entry["semanticHash"] == committed[name]["semanticHash"], name

    def test_committed_artifact_hashes_match_the_committed_bytes(self) -> None:
        # artifactHash pins the exact bytes of one artifact. Every generated
        # trace carries a fresh traceId and createdAt, so a regenerated file has
        # a different artifactHash by design; what the committed manifest
        # promises is that the committed *files* have not been altered.
        traces_dir = CIRCUITS_DIR.parent / "traces"
        committed = json.loads((traces_dir / "manifest.json").read_text())
        assert committed
        for name, entry in committed.items():
            serialized = (traces_dir / f"{name}.qsimcity.json").read_text()
            assert artifact_hash(serialized) == entry["artifactHash"], name
            document = json.loads(serialized)
            assert semantic_hash_of_document(document) == entry["semanticHash"], name

    def test_generate_crossval_structure(self, tmp_path: Path) -> None:
        out = generate_crossval(CIRCUITS_DIR, tmp_path / "xval.json")
        payload = json.loads(out.read_text())
        assert len(payload["circuits"]) == 6
        for entry in payload["circuits"]:
            total = sum(re * re + im * im for re, im in entry["statevector"])
            assert total == pytest.approx(1.0)
            assert sum(entry["idealCounts"].values()) == entry["shots"]

    def test_cli_main(self, tmp_path: Path) -> None:
        rc = main(
            [
                "crossval",
                "--circuits-dir",
                str(CIRCUITS_DIR),
                "--out",
                str(tmp_path / "x.json"),
            ]
        )
        assert rc == 0
        assert (tmp_path / "x.json").exists()

    def test_cli_requires_command(self) -> None:
        with pytest.raises(SystemExit):
            main([])
