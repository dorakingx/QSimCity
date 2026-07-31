"""Real Qiskit transpiler capture.

Runs the preset pass manager against a GenericBackendV2 built from a
QSimCity device topology and records every pass execution, the chosen
layout, routing permutation, and stage metrics as trace events with
source `qiskit_transpiler`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import qiskit
from qiskit import QuantumCircuit
from qiskit.providers.fake_provider import GenericBackendV2
from qiskit.transpiler import generate_preset_pass_manager

from qsimcity_qiskit.devices import BASIS_GATES, get_device
from qsimcity_qiskit.trace_model import (
    Provenance,
    TraceEvent,
)


@dataclass
class PassRecord:
    name: str
    time_seconds: float
    index: int


@dataclass
class TranspileCapture:
    transpiled: QuantumCircuit
    initial_layout: list[int]
    final_layout: list[int]
    passes: list[PassRecord]
    input_metrics: dict[str, int]
    output_metrics: dict[str, int]
    device_id: str
    seed: int
    events: list[TraceEvent] = field(default_factory=list)


def _metrics(qc: QuantumCircuit) -> dict[str, int]:
    ops = qc.count_ops()
    two_qubit = sum(1 for ci in qc.data if ci.operation.name != "barrier" and len(ci.qubits) == 2)
    return {
        "gateCount": sum(
            int(v) for k, v in ops.items() if k not in ("measure", "barrier", "reset")
        ),
        "twoQubitGateCount": two_qubit,
        "swapCount": int(ops.get("swap", 0)),
        "depth": qc.depth(),
    }


def make_backend(device_id: str, seed: int) -> GenericBackendV2:
    device = get_device(device_id)
    return GenericBackendV2(
        num_qubits=device.num_qubits,
        coupling_map=[list(e) for e in device.edges],
        basis_gates=BASIS_GATES,
        seed=seed,
    )


def capture_transpile(
    qc: QuantumCircuit,
    device_id: str,
    seed: int = 11,
    optimization_level: int = 1,
) -> TranspileCapture:
    """Transpiles with the real Qiskit preset pass manager, recording passes."""
    backend = make_backend(device_id, seed)
    pm = generate_preset_pass_manager(
        optimization_level=optimization_level,
        backend=backend,
        seed_transpiler=seed,
    )
    passes: list[PassRecord] = []

    def callback(**kwargs: Any) -> None:
        passes.append(
            PassRecord(
                name=type(kwargs["pass_"]).__name__,
                time_seconds=float(kwargs["time"]),
                index=len(passes),
            )
        )

    transpiled = pm.run(qc, callback=callback)
    layout = transpiled.layout
    if layout is not None:
        initial = [int(x) for x in layout.initial_index_layout(filter_ancillas=True)]
        final = [int(x) for x in layout.final_index_layout()]
    else:
        initial = list(range(qc.num_qubits))
        final = list(range(qc.num_qubits))

    provenance = Provenance(
        generator="qsimcity-qiskit-bridge",
        generatorVersion="1.0.0",
        details={"qiskit": qiskit.__version__, "optimizationLevel": optimization_level},
    )
    events: list[TraceEvent] = []
    tick = 0

    def emit(
        event_type: str,
        stage: str,
        payload: dict[str, Any],
        logical: list[int] | None = None,
        physical: list[int] | None = None,
    ) -> None:
        nonlocal tick
        tick += 1
        events.append(
            TraceEvent(
                eventId=f"e{len(events)}",
                logicalTick=tick,
                eventType=event_type,
                stage=stage,
                logicalQubits=logical or [],
                physicalQubits=physical or [],
                instructionId=None,
                source="qiskit_transpiler",
                certainty="COMPUTED",
                payload=payload,
                provenance=provenance,
            )
        )

    emit(
        "program.parsed",
        "parse",
        {"numQubits": qc.num_qubits, "instructions": len(qc.data)},
    )
    emit(
        "layout.assigned",
        "layout",
        {"layout": initial, "deviceId": device_id, "method": "qiskit-preset"},
        logical=list(range(len(initial))),
        physical=initial,
    )
    swap_count = _metrics(transpiled)["swapCount"]
    # The executed pass list IS captured — as observational telemetry, not as
    # semantic content. Qiskit's preset pass manager takes different internal
    # paths across identical invocations (observed: 42 vs 43 passes, and
    # ApplyLayout present or absent) while producing an identical compiled
    # circuit, layout, and metrics. It therefore rides in `telemetry` (covered
    # by artifactHash) and under a telemetry payload key excluded from
    # semanticHash, so committed samples stay reproducible without discarding
    # real provenance.
    emit(
        "circuit.optimized",
        "optimization",
        {
            "optimizationLevel": optimization_level,
            "swapCount": swap_count,
            "passes": [p.name for p in passes],
            "note": (
                "Compiled by the real Qiskit preset pass manager. The exact "
                "pass sequence is observational telemetry: it varies between "
                "invocations while the resulting circuit, layout, and metrics "
                "are deterministic."
            ),
        },
    )
    if final != initial:
        emit(
            "routing.swap_inserted",
            "routing",
            {"finalLayout": final, "note": "Layout permutation after routing"},
            logical=list(range(len(final))),
            physical=final,
        )
    emit("gate.translated", "translation", {"basisGates": BASIS_GATES})

    return TranspileCapture(
        transpiled=transpiled,
        initial_layout=initial,
        final_layout=final,
        passes=passes,
        input_metrics=_metrics(qc),
        output_metrics=_metrics(transpiled),
        device_id=device_id,
        seed=seed,
        events=events,
    )
