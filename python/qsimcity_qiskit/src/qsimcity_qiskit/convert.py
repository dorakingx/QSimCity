"""Conversion between Qiskit circuits and QSimCity Trace circuits."""

from __future__ import annotations

from typing import Any

from qiskit import QuantumCircuit, qasm2

from qsimcity_qiskit.trace_model import TraceCircuit, TraceInstruction

MAX_QASM_BYTES = 512 * 1024


def load_qasm(source: str) -> QuantumCircuit:
    """Loads OpenQASM 2.0 with the same size limit as the web application.

    LEGACY_CUSTOM_INSTRUCTIONS extends qelib1 with the Terra-standard extras
    (p, sx, cp, ...) that the QSimCity parser also supports natively.
    """
    if len(source.encode("utf-8")) > MAX_QASM_BYTES:
        raise ValueError(f"QASM source exceeds the {MAX_QASM_BYTES // 1024} KiB limit")
    return qasm2.loads(source, custom_instructions=qasm2.LEGACY_CUSTOM_INSTRUCTIONS)


def circuit_to_trace_circuit(qc: QuantumCircuit, name: str | None = None) -> TraceCircuit:
    """Flattens a Qiskit circuit into the trace-circuit form.

    Classical control appears either as Qiskit 2.x IfElseOp nodes (from QASM2
    `if` statements) or is absent; single-block IfElseOp bodies are flattened
    into per-instruction conditions matching the OpenQASM 2 model.
    """
    cregs = [{"name": reg.name, "size": reg.size} for reg in qc.cregs]
    instructions: list[TraceInstruction] = []

    def clbit_index(bit: Any) -> int:
        return qc.find_bit(bit).index

    for ci in qc.data:
        op = ci.operation
        qubits = [qc.find_bit(q).index for q in ci.qubits]
        clbits = [clbit_index(c) for c in ci.clbits]
        if op.name == "if_else":
            condition = getattr(op, "condition", None)
            if condition is None:
                raise ValueError("if_else without a condition is not supported")
            reg, value = condition
            reg_name = getattr(reg, "name", None)
            if reg_name is None:
                raise ValueError("Conditions on single bits are not supported in trace form")
            blocks = list(op.blocks)
            if len(blocks) > 1 and blocks[1] is not None and len(blocks[1].data) > 0:
                raise ValueError("if_else with an else-branch is not supported")
            body = blocks[0]
            for inner in body.data:
                inner_qubits = [qubits[body.find_bit(q).index] for q in inner.qubits]
                inner_clbits = [clbits[body.find_bit(c).index] for c in inner.clbits]
                instructions.append(
                    _make_instruction(
                        len(instructions),
                        inner.operation.name,
                        inner_qubits,
                        inner_clbits,
                        [float(p) for p in inner.operation.params],
                        {"creg": reg_name, "value": int(value)},
                    )
                )
            continue
        instructions.append(
            _make_instruction(
                len(instructions),
                op.name,
                qubits,
                clbits,
                [float(p) for p in op.params],
                None,
            )
        )

    return TraceCircuit(
        name=name or qc.name or "qiskit-circuit",
        numQubits=qc.num_qubits,
        numClbits=qc.num_clbits,
        cregs=cregs,
        instructions=instructions,
    )


def _make_instruction(
    index: int,
    name: str,
    qubits: list[int],
    clbits: list[int],
    params: list[float],
    condition: dict[str, Any] | None,
) -> TraceInstruction:
    if name == "measure":
        kind = "measure"
    elif name == "reset":
        kind = "reset"
    elif name == "barrier":
        kind = "barrier"
    else:
        kind = "gate"
    return TraceInstruction(
        id=f"i{index}",
        kind=kind,  # type: ignore[arg-type]
        name="u" if name in ("u3", "u") else name,
        qubits=qubits,
        params=params,
        clbits=clbits,
        condition=condition,
    )
