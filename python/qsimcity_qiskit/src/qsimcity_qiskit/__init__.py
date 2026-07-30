"""QSimCity Qiskit bridge.

Captures real Qiskit transpiler stages and Aer simulation results and
converts them into QSimCity Trace files. This package is an optional local
extension: the QSimCity web application never requires it.
"""

from qsimcity_qiskit.trace_model import (
    TRACE_SCHEMA_VERSION,
    Trace,
    TraceCircuit,
    TraceEvent,
    trace_content_hash,
)

__version__ = "1.0.0"

__all__ = [
    "TRACE_SCHEMA_VERSION",
    "Trace",
    "TraceCircuit",
    "TraceEvent",
    "__version__",
    "trace_content_hash",
]
