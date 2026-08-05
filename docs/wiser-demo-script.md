# WISER Education Demo Script

A ten-minute live demonstration of QSimCity for the WISER Education
submission. Timings assume a presenter who has run it once before. Have
the production deployment open in a normal browser window; nothing else is
needed — the app is fully client-side.

## 0:00 — The city at first glance

Open the app fresh (or use a private window for the real first-run). The
onboarding offers Play / Watch / Build with pictures. Choose **Watch the
city**: Explore opens in daylight and a Bell pair runs.

Say: *"This is a real city — streets, blocks, districts, a harbor — and
its geography is a quantum computer's compilation pipeline. Programs
arrive as ships in the west and results leave as containers in the east."*

Orbit slowly. Point out the boulevard, the downtown Scheduling Tower, the
fenced QPU campus, and the harbor cranes. Switch time of day to golden
hour, then night, in Settings — same city, same science.

## 1:30 — The program is a job, never a state

Press **Legend**. Read the job convoy entry aloud, including *"never a
quantum state."*

Say: *"Everything that moves is accountable. Trucks carry jobs. Vans carry
measured bits. And everything decorative says ILLUSTRATIVE right here."*

Close the Legend, scrub the timeline to the start, and follow the convoy
with the camera as you step through ticks: it stands at each district
exactly when that stage's events fire — the inspector shows the same
events in words.

## 3:00 — Logical vs physical, and the price of distance

Open the **Quantum Lab**, load the **SWAP Storm** sample on Linear 5, Run.
Fly to the QPU campus (key 3, or click the QPU Grid label).

Say: *"Colored banners are logical qubits; the pylons are physical ones.
Watch tick N—"* (step to the routing ticks) *"—two banners just flew
between pylons. That is a SWAP: the router paying rent because our qubits
were far apart."* Show the same exchange in the inspector's mapping.

## 4:30 — Noise is weather, results are containers

Enable the noise model, Run again. Clouds thicken and rain falls over the
campus while noise events fire. Open **Compare**: ideal versus noisy
counts side by side.

Walk (key 4) to the Measurement Harbor along the boulevard — point out
lane markings, lamps, and worker figures on the way — and watch containers
stack up as measurements land.

## 6:00 — A ten-year-old's path

Switch the explanation level to **child** in Settings, open **Missions**,
and run mission 1 exactly as a learner would: press the one highlighted
"Bell pair" button, press Run, and let the celebration land.

Say: *"Every mission checks completion against the real trace — this
star appeared because the run actually produced an entangled pair with
measurements, not because the learner clicked in the right order. Seven
missions, pre/post picture assessment, and it all works by touch and in
the WebGL-free accessible mode."*

Show Accessible 2D for ten seconds: the same run, no 3D.

## 8:00 — Honesty and evidence

Open the Provenance panel and hover two certainty labels at different
explanation levels.

Say: *"Every number carries its provenance. The simulator is
cross-validated against Qiskit to eight decimal places; the compiled
circuit — with its SWAPs and translations — is what actually executes;
and the whole gate, from typecheck to a ten-minute soak to these very
screenshots, is enforced by a checker that refuses prose as evidence."*

## 9:00 — Close

Return to the day overview, let the ambient city live for a beat.

Say: *"An unofficial, open-source, offline-capable teaching city — every
light driven by a real computation trace, every claim carrying its own
certainty. Thank you."*

## Recovery notes

- If WebGL fails on the demo machine, the app auto-switches to Accessible
  2D and announces it — continue the same script minus camera moves.
- If the network dies mid-demo, reload: the PWA serves offline.
- Timeline lost? The share URL restores the configuration; Run reproduces
  the identical trace (deterministic seed).
