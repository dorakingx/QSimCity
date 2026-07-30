OPENQASM 2.0;
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
