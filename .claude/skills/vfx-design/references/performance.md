# Performance — budgets that keep the effect a frame, not a stall

The costs that actually hurt real-time VFX, in order: fill-rate (big transparent quads stacked),
full-screen passes (bloom, scene copies), draw calls (one per uninstanced sprite), and per-frame
CPU work (allocation, path building). Particle *count* is rarely the problem until it drives one of
these.

## Budgets (per effect, mid-range GPU, 60 fps target)

| Resource | Budget | Why |
|---|---|---|
| Frame time for the whole FX pass | ≤ 4 ms of the 16 | the board, cards, UI need the rest |
| Overdraw from transparent quads | ≤ 4× the screen area per frame at full res | each layer re-shades every pixel it covers |
| Large additive quads (> ¼ screen) | ≤ 2 at once | fill-rate and bloom input |
| Full-screen passes | bloom once; scene copy once and only while a refracting element is live | each is a full blit |
| Live instanced elements | within the kind's capacity (set per kind; a few hundred is plenty) | one draw per kind |
| Particles per tier | tier 1: ≤ 40 · tier 2: ≤ 120 · tier 3: ≤ 300 | count scales with the read, not beyond |
| Texture fetches per fragment | ≤ 4 in a hot shader | memory bandwidth |
| fbm octaves | 3–4 | each octave is another noise fetch |
| Allocation per frame | 0 | GC pauses are hitches |

## Techniques that buy headroom

- **Instance** every repeated shape (sprites, drops, bolt segments, debris): one geometry, one
  draw, per-instance attributes. Cap the capacity and *drop the oldest* when full, never grow.
- **Render FX at reduced resolution** when fill-bound (half-res target, upsample); bloom always at
  a mip chain.
- **Discard early**: `if (coverage <= 0.002) discard;` before the expensive lighting.
- **Cull by coverage**: a particle whose alpha × size falls under a pixel is not emitted.
- **Lean, not soft particles**, where there is no depth texture: saves a full-screen depth read.
- **Pack per-instance data** into a few `vec4`s; `flat` varyings for anything constant per instance.
- **Closed-form motion** (`p0 + v0 t + ½ g t²`) over per-frame integration: no state, no
  allocation, deterministic for previews and tests.
- **Prebuild geometry and gradients** at load, not per frame; a canvas gradient per draw call is a
  CPU hitch in a 2D fallback.

## Measuring

- Wrap the FX pass in `performance.now()` deltas and print a running mean and max; the max is the
  number that matters.
- Count instances per kind per frame; a kind at capacity every frame is a design problem (too many
  emitters) before it is a budget problem.
- Watch for GL errors on every step of a new shader; a silent `INVALID_VALUE` draws nothing and
  costs a frame of confusion.
- A software renderer (SwiftShader, llvmpipe) is a **correctness** check: it compiles the shader
  and draws the pixel. It says nothing about frame time, it drops frames, and it has been seen to
  draw no FX at large viewports with no error. Time on real hardware.

## Degradation ladder (what to drop, in order, when over budget)

1. Bloom radius, then bloom entirely (the effect must already read without it).
2. Scene copy for refraction → tint fallback.
3. Tertiary particles (ambience).
4. Secondary particle count (halve).
5. Shader detail (one fewer fbm octave, no bump).
6. Resolution of the FX target.
Never drop: the primary shape, the contact frame, the card motion, the sound.
