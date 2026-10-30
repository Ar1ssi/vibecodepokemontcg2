# Techniques — the formulas behind a volumetric read

GLSL-flavoured, engine-neutral. Each entry: what it buys, the formula, the trap. Where a project has
its own implementation (this repository has shared GLSL in `element-glsl.mjs`), reuse it; the
formulas here are for understanding and for the cases it does not cover.

## Noise

**Value noise + fbm** — the lattice everything else is built on. 3–4 octaves, lacunarity ≈ 2,
gain 0.5, normalised by the octave sum:
```glsl
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s / 0.9375; }
```
Trap: sampling with `time` as a coordinate makes the whole field drift as one; *scroll* a coordinate
along the form's axis instead (`along - time * flow`) so the texture flows with the matter.

**Domain warping** — turbulence that looks like flame and smoke rather than static:
```glsl
vec2 q = vec2(fbm(p + vec3(0.0)), fbm(p + vec3(5.2, 1.3, 0.0)));
float n = fbm(p + k * vec3(q, 0.0));   // k 0.5–2
```

**Two scales multiplied** — interior grain ("detail"): `n = fbm(p * 1.0) * (0.6 + 0.8 * fbm(p * 4.0 + shift))`.

## Erosion, dissolve, burning edge

**Erosion** — a shape that eats away from its thin parts (flame tips, smoke edges):
```glsl
float mask = shapeMask(uv);                     // 1 inside, 0 outside, soft
float n = fbm(coords);
float cut = mix(0.1, 0.9, life);                // rises over the life
float a = smoothstep(cut - soft, cut + soft, n * mask);   // soft 0.05–0.15
```
Multiplying noise by the mask before the threshold is what makes edges erode first.

**Dissolve with a burning rim** (the generic exit for anything that should not just fade):
```glsl
float k = n - mix(-w, 1.0, amount);             // amount 0 whole … 1 gone, w ≈ 0.12
float edge = 1.0 - smoothstep(0.0, w, k);       // the rim band
float alpha = smoothstep(-e, e, k);             // e ≈ 0.015
colour = mix(colour, edgeColour * gain, edge);  // gain 1.5–2 so only the rim blooms
```
Trap: `edgeColour` white = a white rim everywhere; use the element's hot colour.

## Fake volume on a billboard

**Sphere normal from a quad** (drops, orbs, plasma balls):
```glsl
vec2 p = local;                                  // −1 … 1 across the quad
float r2 = dot(p, p); if (r2 > 1.0) discard;
vec3 N = vec3(p, sqrt(1.0 - r2));
```
**Tube normal from a ribbon** (beams, streams, bolts): `v` is −1 … 1 across the ribbon:
`vec3 N = vec3(v, 0.0, sqrt(1.0 - v * v))` in the ribbon's frame.

**Lighting** — one light direction for the whole scene (up-left is the convention that matches a
card's printed art):
```glsl
vec3 L = normalize(vec3(-0.45, 0.55, 0.7)); vec3 V = vec3(0.0, 0.0, 1.0);
float diff = ambient + (1.0 - ambient) * max(dot(N, L), 0.0);    // ambient 0.3–0.45
float spec = pow(max(dot(reflect(-L, N), V), 0.0), shininess);   // 20–60; a small glint
float fresnel = pow(1.0 - max(dot(N, V), 0.0), power);           // 2–3 rim, 4–5 thin edge
colour = body * diff + rimColour * fresnel * rimStrength + vec3(1.0) * spec * specStrength;
```
Trap: `specStrength` above ~1.2 on a large sphere makes a white blob; the glint is small because
`shininess` is high, not because it is bright.

**What makes a tube a tube** — an outline with one highlight line is a flat band, however good
the refraction. Light the fake normal with the one scene light placed well to the side
(`L ≈ (−0.75, 0, 0.66)`, ambient 0.35) so the terminator falls past the axis and the shadow half
drops to the deep stop; add a *rim light* on the shadow side's edge (`fresnel × smoothstep(0.2, 0.8, nv)`),
a broad sheen plus a glint string on the lit side, and let the refracted scene behind sit in the
tube's shadow too (`behind × (0.55 + 0.45 × shade)`). Shadow half, bright far edge: that pair is the
cylinder read, and it survives at ~40 px wide.

**Bumped sheet** — a flat quad that reads as a surface: perturb `N.xy` by the gradient of a noise
field (`N.xy += bump * (vec2(fbm(p + dx) - fbm(p - dx), fbm(p + dy) - fbm(p - dy)))`), renormalise.

## Billboards, lean and the tilted camera

A camera-facing quad in a tilted scene intersects the ground as a hard line. Two cures:
- **Lean**: pull the quad toward the camera by about half its size in view space
  (`view.xyz += normalize(-view.xyz) * lean`). Cheap; no depth texture needed.
- **Soft particles** (needs the scene depth): `alpha *= saturate((sceneDepth - fragDepth) / softDistance)`.

On a tilted board, a sheet lying on the ground is foreshortened to an ellipse. **Stand** bursts,
rings and splashes upright about the screen-horizontal line through the contact point; **arc**
travelling things off the ground (height peaks mid-lane). Lanes often run near → far, so a sheet
stood about the lane axis is edge-on — stand about the horizontal, arc along the lane.

## Flow, flipbooks, trails

**Panner / flow**: `uv + dir * time * speed`; two layers at different speeds and scales for
depth (`0.6× slow large`, `1.4× fast small`). For a beam, scroll along the axis toward the head.

**Flipbook** (sprite sheets, splash sequences):
```glsl
float f = floor(t * fps); int cols, rows;
vec2 cell = vec2(mod(f, cols), rows - 1.0 - floor(f / cols));   // row flip if the sheet is top-down
vec2 uv = (local + cell) / vec2(cols, rows);
colour = mix(tex(uv_f), tex(uv_f1), fract(t * fps));            // crossfade kills the strobe
```
Masks often live in **R, not alpha** (greyscale sheets): read the right channel and say which in code.

**Velocity-stretched quads** (sparks, drops, debris in flight): align the quad to velocity,
stretch by `1 + k * |v|`, and *dim by the same factor* (`alpha / stretch`) so energy is conserved
and the streak does not become a bright bar. This is 90 % of "motion blur" in real-time VFX.

**Trails**: a ribbon of the last N positions; width tapers to 0 at the tail; alpha fades along it;
texture scrolls toward the tail.

## Temperature ramps (light)

Fire, plasma and hot metal go dark red → orange → yellow → white, and white only at the very top:
```glsl
vec3 c = mix(soot, deep, smoothstep(0.00, 0.22, t));
c = mix(c, body, smoothstep(0.22, 0.48, t));
c = mix(c, hot,  smoothstep(0.48, 0.70, t));
c = mix(c, core, smoothstep(0.74, 0.94, t));
c *= 1.0 + boost * smoothstep(0.94, 1.0, t);     // only the last 6 % passes 1.0 → a filament blooms
```
The `soot` stop (deep × 0.18) is what makes the flame read over a bright card.

## HDR and bloom — the arithmetic that blew every overlap white

A threshold bloom adds, roughly, `strength × Σ_mips blur(max(c − threshold, 0))`. A multi-mip pass
(five mips) sums to about 3 × strength × the excess over a wide radius. So with threshold 1.0 and
strength 0.9, two additive sprites overlapping at 0.7 each (sum 1.4) bloom by 0.4 × 2.7 ≈ 1.1 over a
large soft disc: every overlap turns into a white glow. Rules:
- Fills stay ≤ 0.9 so no overlap of two reaches the threshold by accident; three overlapping
  fills is a design problem, not a bloom problem.
- Filaments and glints are the only things placed at 1.5–2.5.
- Prefer a high threshold (≈ 2) and low strength (≈ 0.2) over the defaults; a wide radius at low
  strength gives a soft corona, a narrow radius at high strength gives a hot halo.
- Bloom runs on the FX target, not on the card art, or the card's white border blooms.
- `motionReduced()` may drop bloom; the effect must still read without it.

## Blend modes — light vs matter, in code

| Object | Blend | Equation | Behaviour |
|---|---|---|---|
| Light (fire, bolts, glow, flash) | additive | `src × 1 + dst × 1` | Adds; stacks to white; cannot hide anything; dark background needed |
| Matter (water, rock, ice, smoke, foam) | premultiplied over | `src × 1 + dst × (1 − srcA)` with `rgb × a` in the shader | Covers; tints a bright card instead of whitening it; sorts back-to-front |
| Bolt knots, overlapping filaments | max | `max(src, dst)` | No double brightness at joints |
| Soft light that must not blow out | screen | `1 − (1 − src)(1 − dst)` | Saturates gently toward 1.0 |

Trap: additive alpha. With `blendSrcAlpha One, blendDstAlpha One` the alpha channel also adds and a
later composite darkens the board under the glow; leave alpha alone for additive light
(`ZeroFactor, OneFactor`) and composite the FX target over the scene once.

Colour space: blend in linear, texture data (masks, flow maps) stays linear, colour textures are
sRGB; resolve to the display once.

## Refraction (matter only)

Sample the scene behind the fragment, offset by the fake normal, more at the rim:
```glsl
vec2 uv = gl_FragCoord.xy / viewport + N.xy * strength * (1.0 - N.z * 0.6) / viewport;
vec3 behind = texture(scene, clamp(uv, 0.001, 0.999)).rgb;
colour = mix(behind * tint, bodyColour, opacity);
```
- Refract the *scene*, never the effect's own particles (copy the scene before the FX pass).
- Take the copy once per frame and only while a refracting kind is live; it is a full-screen blit.
- Hiding what is behind (a solid drop) needs the covered pass to also write coverage, or the card
  shows through the bent copy of itself.
- Without a copy, degrade to a tint, never to black.
- Clear matter over a dark background goes black and reads as glass or ice. Add an **in-scatter**
  term (`+ body × 0.3`) so the refracted middle keeps the element's colour, and make opacity a
  Fresnel: clearest down the middle (~0.55), covering at the grazing sides (~0.9).

## Depth and ordering

- Solids (debris, stones, the card meshes) write depth. Transparents do not.
- Order: opaque scene → depth prepass of occluders (the cards) → matter (over, back-to-front) →
  light (additive, order-free) → bloom → composite.
- An effect that must appear *behind* a card draws in the depth-tested back pass; one that must
  cover it draws in front at the card's lift. Decide per beat; "front for everything" is how a
  beam drills through the target.

## Motion maths

Deterministic by time and seed, so a frozen preview stands still and the maths is unit-testable:
```
p(t) = p0 + v0 · t + ½ g t²                      // closed form; no per-frame integration
spring(t) = cos(π · cycles · t) · e^(−decay · t) // cycles ≈ 1.5, decay ≈ 3: settle from 1 to 0
easeIn(t) = t²  or  t³ ; easeOut(t) = 1 − (1 − t)³ ; linear for travel
```
Drag: `v(t) = v0 · e^(−k t)`; a spark with k ≈ 3 looks like a spark, k ≈ 0 like a bullet.
Hit stop: hold every pose at the contact value for 40–80 ms before the recoil and knock begin.

## Textures

- Authoring: masks in R (or A, say which), flipbooks in a grid with the frame count in the name,
  no premultiply on data textures, mipmaps on, repeat wrapping for scrolling maps.
- A hard-edged disc texture is not a glow; a glow texture is a radial gradient that reaches 0 at
  the edge. Check the actual texture before trusting its name: render its channels side by side
  (`ffmpeg -i tex.webp -filter_complex "format=rgba,split[a][b];[a]alphaextract[al];[b][al]hstack"`).
  Two real cases: a "splash" texture that was sparse splatter dots (the crown was a different
  file), and a "drop" texture that was a vertical streak with a dim tail, which read as grey dots
  until it was aligned along its flight.
- A sprite is the right tool for *thin* things (streaks, flakes, flipbook crowns). A *body* (a drop,
  an orb, a stone) deserves a lit kind with a normal: six real spheres read as water; six dots
  read as noise.
- Procedural fallback until the texture arrives; never a frame with a missing-texture magenta.

## Canvas / vector fallback

Where an effect must also draw on a 2D canvas (no GPU path), keep the same *value structure*:
a deep → body → hot gradient along the form, a dark soft edge for light, a lit rim for matter,
white only in a glint. The silhouette and timing carry the read; the shader adds the volume.
