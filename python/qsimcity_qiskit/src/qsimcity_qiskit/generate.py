"""Trace and cross-validation artifact generation CLI.

Usage:
    qsimcity-generate traces --circuits-dir ../../examples/circuits \
        --out ../../examples/traces
    qsimcity-generate crossval --circuits-dir ../../examples/circuits \
        --out ../../examples/cross-validation/qiskit-results.json

Everything is seeded; running twice produces identical files (except the
createdAt timestamp, which is excluded from content hashes).
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
from datetime import UTC, datetime
from pathlib import Path

import qiskit
import qiskit_aer

from qsimcity_qiskit.aer_runs import (
    build_noise_model,
    exact_statevector,
    run_ideal,
    run_noisy,
)
from qsimcity_qiskit.convert import circuit_to_trace_circuit, load_qasm
from qsimcity_qiskit.trace_model import (
    TRACE_SCHEMA_VERSION,
    Provenance,
    Trace,
    TraceCounts,
    TraceMetrics,
    TraceResults,
    fnv1a64,
    trace_content_hash,
)
from qsimcity_qiskit.transpile_capture import _metrics, capture_transpile

GENERATOR = "qsimcity-qiskit-bridge"
GENERATOR_VERSION = "1.0.0"

DEFAULT_NOISE = {
    "readoutError": 0.02,
    "depolarizing1q": 0.001,
    "depolarizing2q": 0.01,
    "amplitudeDamping": 0.005,
    "phaseDamping": 0.005,
}


def package_versions() -> dict[str, str]:
    return {
        "qiskit": qiskit.__version__,
        "qiskit-aer": qiskit_aer.__version__,
        "python": platform.python_version(),
        "qsimcity-qiskit": GENERATOR_VERSION,
    }


def build_trace(
    qasm_text: str,
    name: str,
    device_id: str,
    shots: int,
    seed: int,
    with_noise: bool,
) -> Trace:
    """Builds a full QSimCity Trace from real Qiskit transpiler + Aer runs."""
    qc = load_qasm(qasm_text)
    capture = capture_transpile(qc, device_id, seed=seed)
    input_metrics = _metrics(qc)
    output_metrics = capture.output_metrics

    ideal_counts = run_ideal(qc, shots, seed)
    results = TraceResults(
        idealCounts=TraceCounts(
            counts=ideal_counts,
            shots=shots,
            source="qiskit_aer",
            certainty="SAMPLED",
        )
    )
    noise_dict = None
    if with_noise:
        noise_dict = dict(DEFAULT_NOISE)
        noise_model = build_noise_model(
            readout_error=noise_dict["readoutError"],
            depolarizing_1q=noise_dict["depolarizing1q"],
            depolarizing_2q=noise_dict["depolarizing2q"],
            amplitude_damping=noise_dict["amplitudeDamping"],
            phase_damping=noise_dict["phaseDamping"],
        )
        noisy_counts = run_noisy(qc, shots, seed, noise_model)
        results.noisyCounts = TraceCounts(
            counts=noisy_counts,
            shots=shots,
            source="qiskit_aer",
            certainty="SAMPLED",
        )

    provenance = Provenance(
        generator=GENERATOR,
        generatorVersion=GENERATOR_VERSION,
        details={"qiskit": qiskit.__version__, "backend": f"GenericBackendV2/{device_id}"},
    )
    trace = Trace(
        schemaVersion=TRACE_SCHEMA_VERSION,
        traceId=f"t-{fnv1a64(f'{seed} {qasm_text}')}",
        createdAt=datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        generator=provenance,
        seed=str(seed),
        packageVersions=package_versions(),
        inputHash=fnv1a64(qasm_text),
        deviceId=device_id,
        shots=shots,
        noise=noise_dict,
        inputCircuit=circuit_to_trace_circuit(qc, name=name),
        compiledCircuit=circuit_to_trace_circuit(
            capture.transpiled, name=f"{name}@{device_id}"
        ),
        initialLayout=capture.initial_layout,
        finalLayout=capture.final_layout,
        metrics=[
            TraceMetrics(stage="input", **input_metrics),
            TraceMetrics(stage="compiled", **output_metrics),
        ],
        results=results,
        events=capture.events,
    )
    return trace


SAMPLE_PLAN = [
    {"id": "bell", "device": "linear-5", "shots": 1024, "seed": 42, "noise": True},
    {"id": "ghz-4", "device": "linear-5", "shots": 1024, "seed": 42, "noise": True},
    {"id": "qft-3", "device": "linear-5", "shots": 1024, "seed": 42, "noise": False},
    {"id": "swap-storm", "device": "linear-5", "shots": 1024, "seed": 42, "noise": False},
    {"id": "grover-2", "device": "full-5", "shots": 1024, "seed": 42, "noise": True},
]

CROSSVAL_CIRCUITS = ["bell", "ghz-4", "grover-2", "qft-3", "swap-storm", "toffoli"]


def generate_traces(circuits_dir: Path, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    manifest: dict[str, str] = {}
    for plan in SAMPLE_PLAN:
        qasm_path = circuits_dir / f"{plan['id']}.qasm"
        qasm_text = qasm_path.read_text()
        trace = build_trace(
            qasm_text,
            name=str(plan["id"]),
            device_id=str(plan["device"]),
            shots=int(plan["shots"]),  # type: ignore[arg-type]
            seed=int(plan["seed"]),  # type: ignore[arg-type]
            with_noise=bool(plan["noise"]),
        )
        path = out_dir / f"{plan['id']}.qsimcity.json"
        path.write_text(trace.to_json() + "\n")
        manifest[str(plan["id"])] = trace_content_hash(trace)
        written.append(path)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return written


def generate_crossval(circuits_dir: Path, out_path: Path) -> Path:
    """Qiskit reference results the browser simulator is tested against."""
    entries = []
    for circuit_id in CROSSVAL_CIRCUITS:
        qasm_text = (circuits_dir / f"{circuit_id}.qasm").read_text()
        qc = load_qasm(qasm_text)
        no_meas = qc.remove_final_measurements(inplace=False)
        assert no_meas is not None
        entries.append(
            {
                "id": circuit_id,
                "qasmHash": fnv1a64(qasm_text),
                "numQubits": qc.num_qubits,
                "statevector": exact_statevector(no_meas),
                "idealCounts": run_ideal(qc, shots=4096, seed=7),
                "shots": 4096,
                "seed": 7,
            }
        )
    payload = {
        "generator": GENERATOR,
        "packageVersions": package_versions(),
        "note": (
            "Reference results from Qiskit Statevector and AerSimulator. "
            "The browser simulator is cross-validated against these in "
            "packages/simulator/test/cross-validation.test.ts."
        ),
        "circuits": entries,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    return out_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="qsimcity-generate", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for cmd in ("traces", "crossval"):
        p = sub.add_parser(cmd)
        p.add_argument("--circuits-dir", type=Path, required=True)
        p.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.command == "traces":
        written = generate_traces(args.circuits_dir, args.out)
        print(f"Wrote {len(written)} trace(s) to {args.out}")
    else:
        path = generate_crossval(args.circuits_dir, args.out)
        print(f"Wrote cross-validation reference to {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
