/** Built-in sample circuits (OpenQASM 2.0), bundled for offline use. */

export interface SampleCircuit {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly qasm: string;
}

export const SAMPLE_CIRCUITS: readonly SampleCircuit[] = [
  {
    id: 'bell',
    title: 'Bell State',
    description: 'Two-qubit maximal entanglement: H then CNOT.',
    qasm: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
cx q[0],q[1];
measure q -> c;
`,
  },
  {
    id: 'ghz-4',
    title: 'GHZ State (4 qubits)',
    description: 'Four-qubit Greenberger–Horne–Zeilinger state.',
    qasm: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[4];
creg c[4];
h q[0];
cx q[0],q[1];
cx q[1],q[2];
cx q[2],q[3];
measure q -> c;
`,
  },
  {
    id: 'teleportation',
    title: 'Quantum Teleportation',
    description:
      'Teleports an arbitrary state from q[0] to q[2] using classical feed-forward corrections.',
    qasm: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
creg m0[1];
creg m1[1];
creg out[1];
// Prepare the payload state on q[0]
ry(0.9272952180016122) q[0];
// Entangle q[1] and q[2]
h q[1];
cx q[1],q[2];
// Bell measurement on q[0], q[1]
cx q[0],q[1];
h q[0];
measure q[0] -> m0[0];
measure q[1] -> m1[0];
// Classically controlled corrections
if (m1 == 1) x q[2];
if (m0 == 1) z q[2];
measure q[2] -> out[0];
`,
  },
  {
    id: 'grover-2',
    title: 'Grover Search (2 qubits)',
    description: 'One Grover iteration marking |11> — finds it with certainty.',
    qasm: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
h q[1];
// Oracle: flip phase of |11>
cz q[0],q[1];
// Diffusion
h q[0];
h q[1];
x q[0];
x q[1];
cz q[0],q[1];
x q[0];
x q[1];
h q[0];
h q[1];
measure q -> c;
`,
  },
  {
    id: 'qft-3',
    title: 'Quantum Fourier Transform (3 qubits)',
    description: 'Textbook QFT on three qubits with controlled phases and a final swap.',
    qasm: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
creg c[3];
x q[0];
h q[2];
cp(pi/2) q[1],q[2];
h q[1];
cp(pi/4) q[0],q[2];
cp(pi/2) q[0],q[1];
h q[0];
swap q[0],q[2];
measure q -> c;
`,
  },
  {
    id: 'swap-storm',
    title: 'SWAP Storm',
    description:
      'Long-range CNOTs on a linear topology that force heavy SWAP insertion during routing.',
    qasm: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[5];
creg c[5];
h q[0];
cx q[0],q[4];
cx q[1],q[3];
cx q[0],q[3];
cx q[4],q[1];
measure q -> c;
`,
  },
  {
    id: 'dynamic-feedforward',
    title: 'Dynamic Feed-forward',
    description: 'Mid-circuit measurement steering later gates through classical control.',
    qasm: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg m[1];
creg c[1];
h q[0];
measure q[0] -> m[0];
if (m == 1) x q[1];
measure q[1] -> c[0];
`,
  },
  {
    id: 'toffoli',
    title: 'Toffoli Gate',
    description: 'CCX flipping the target only when both controls are |1>.',
    qasm: `OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
creg c[3];
x q[0];
x q[1];
ccx q[0],q[1],q[2];
measure q -> c;
`,
  },
];

export function getSampleCircuit(id: string): SampleCircuit {
  const s = SAMPLE_CIRCUITS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown sample circuit: ${id}`);
  return s;
}
