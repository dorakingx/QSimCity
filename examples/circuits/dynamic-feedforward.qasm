OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg m[1];
creg c[1];
h q[0];
measure q[0] -> m[0];
if (m == 1) x q[1];
measure q[1] -> c[0];
