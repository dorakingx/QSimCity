"""Device topologies mirroring packages/domain/src/topology.ts.

The Qiskit bridge builds GenericBackendV2 instances with the same coupling
maps as the QSimCity in-browser devices so transpiler traces line up with
the 3D QPU Grid district.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BridgeDevice:
    id: str
    num_qubits: int
    edges: tuple[tuple[int, int], ...]


def _line(n: int) -> tuple[tuple[int, int], ...]:
    return tuple((i, i + 1) for i in range(n - 1))


def _ring(n: int) -> tuple[tuple[int, int], ...]:
    return (*_line(n), (0, n - 1))


def _grid(rows: int, cols: int) -> tuple[tuple[int, int], ...]:
    edges: list[tuple[int, int]] = []
    for r in range(rows):
        for c in range(cols):
            i = r * cols + c
            if c + 1 < cols:
                edges.append((i, i + 1))
            if r + 1 < rows:
                edges.append((i, i + cols))
    return tuple(edges)


def _full(n: int) -> tuple[tuple[int, int], ...]:
    return tuple((a, b) for a in range(n) for b in range(a + 1, n))


DEVICES: dict[str, BridgeDevice] = {
    "linear-5": BridgeDevice("linear-5", 5, _line(5)),
    "ring-8": BridgeDevice("ring-8", 8, _ring(8)),
    "grid-3x3": BridgeDevice("grid-3x3", 9, _grid(3, 3)),
    "tee-7": BridgeDevice("tee-7", 7, ((0, 1), (1, 2), (1, 3), (3, 5), (4, 5), (5, 6))),
    "full-5": BridgeDevice("full-5", 5, _full(5)),
}

BASIS_GATES = ["rz", "sx", "x", "cx"]


def get_device(device_id: str) -> BridgeDevice:
    if device_id not in DEVICES:
        raise KeyError(f"Unknown device: {device_id}")
    return DEVICES[device_id]
