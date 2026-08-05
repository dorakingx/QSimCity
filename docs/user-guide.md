# QSimCity User Guide

QSimCity turns a quantum program's compilation and execution into an
explorable 3D city. This guide covers everyday use; the educator guide
covers classroom use, and `docs/WISER_REAL_CITY_SPEC.md` defines the
product's quality bars.

## First steps

On your first visit, three big buttons offer the fastest starts:

- **Play a mission** — guided, near-zero-reading missions that teach the
  city one idea at a time. Start here if quantum computing is new to you.
- **Watch the city** — opens Explore and runs a Bell pair so the city comes
  alive immediately.
- **Build a circuit** — the block builder: drag gate tiles onto qubit lanes
  and run your own circuit.

You can return to any of these from the header: Missions, Explore, Quantum
Lab. The Guided Tour walks all twelve districts in pipeline order.

## Reading the city

The city is a real urban environment whose geography is the pipeline:
programs arrive as ships at the Program Port in the west, are recast in the
IR Foundry, assigned homes at the Layout Exchange, routed through Routing
Transit, translated in the Refinery, optimized at the Works, timed at the
Scheduling Tower, executed on the fenced QPU campus, measured at the
Measurement Harbor, and studied at the hilltop Observatory.

Press the **Legend** button in the city for the full list of what moves and
why. The short version:

- The **job convoy** (truck with a glowing crate) is your program traveling
  the boulevard. It is a job marker, never a quantum state.
- **Courier vans** carry measured classical bits from the Harbor to the
  Classical Control Center for feed-forward.
- **Banners over pylons** are logical qubits living on physical qubits;
  SWAPs make two banners trade places mid-run.
- **Container stacks** at the Harbor are the live measurement histogram.
- **Weather** over the QPU campus is the configured noise model.
- Ambient cars and pedestrians are city life with no scientific meaning —
  the Legend marks them ILLUSTRATIVE.

Every number in the interface carries a certainty label (EXACT, COMPUTED,
SAMPLED, ILLUSTRATIVE, ...). Hover any label for a level-appropriate
explanation.

## Cameras and controls

| Mode | Key | Controls |
| --- | --- | --- |
| Orbit | 1 | Drag to rotate, wheel or pinch to zoom, WASD/arrows to pan |
| Top-down | 2 | Drag to rotate, wheel to zoom |
| Fly | 3 | Drag to look, WASD to move, Q/E or wheel for altitude |
| Walk | 4 | Drag to look, WASD to walk at eye height; E uses a console |

On touch screens, one finger orbits and two fingers pinch-zoom; walk and
fly modes show an on-screen movement pad. Three landmark ground floors are
enterable in walk mode — step through the door of the Harbor Gate
Terminal, the Assignment Hall, or the Provenance Dome and use the console
inside.

Time of day (day, golden hour, night), visual quality, sound, reduced
motion, and the explanation level (child, beginner, expert) live under
**Settings**. Sound is synthesized in your browser and stays off until you
enable it.

## Running programs

The **Quantum Lab** accepts OpenQASM 2.0 in the Code tab or gate blocks in
the Blocks tab, plus shots, seed, device topology, initial layout, noise
model, and optimization. **Run** compiles and simulates everything locally
in your browser — nothing is uploaded — and the whole city replays the
resulting trace. Use the timeline to pause, step, scrub, and change speed;
the city, the inspector, and every panel stay in sync at every tick.

**Compare** shows ideal versus noisy results and the circuit before versus
after compilation. **Accessible 2D** is the complete product without WebGL,
including missions and the builder.

## Saving and sharing

Export any run as a `.qsimcity.json` trace and re-import it later — replay
is deterministic. Share links carry the sample and configuration, never
your program text. All data stays in your browser; Settings offers one
button to clear it.
