# Regular Gen 9 Pokémon ex and Mega ex card art — generation spec

A spec for an AI (an image model, or an agent driving one) to reproduce the art on the **regular** prints of
Gen 9 rule-box Pokémon. Every number here was measured from real cards (method and sources at the end).
Anything inferred rather than measured is marked *(inferred)*.

**In scope:** the "Double Rare" prints from the Scarlet & Violet sets (`sv*`) and the Mega Evolution sets (`me*`).
That is 317 cards, or 272 unique artworks once same-art reprints are dropped. They split into three sub-lines,
each with its own look:

| Sub-line | Cards (unique art) | Look in one line |
|---|---|---|
| **Standard ex** | 209 (185) | a 3D Pokémon mid-attack inside a radial burst of energy in its type's color |
| **Tera ex** | 64 (46) | the Pokémon rendered as faceted crystal, with crystal shards and heavy star glints |
| **Mega ex** | 44 (41) | a 3D Mega Pokémon inside a fixed rainbow burst of flat, angular shards |

**Out of scope:** full arts (Ultra Rare), Special Illustration Rares, hyper and Mega Hyper Rares, shiny prints
and promos. All Gen 6 (XY) Pokémon-EX and M EX cards, and all V cards, are excluded too.

How the sub-lines were identified:
- **Mega ex:** every card named "Mega …".
- **Tera ex:** detected from the frame. The Tera rule bar under the name matches a template at ≥0.82 correlation,
  while every other card scores ≤0.14.
- **Standard ex:** everything else.

---

## 1. How the real art is made

It is **3D CG**: posed 3D models, rendered, then composited and finished in 2D.

| Evidence | Source |
|---|---|
| Creatures Inc. turns Game Freak's official designs into the 3D Pokémon models used across the games, and its Pokémon CG Studio works in-house. | CGWORLD interview with Creatures (2017) |
| 5ban Graphics is Creatures' in-house 3D-CG illustration studio. | *Pokémon TCG Illustration Collection*, cited by PokéWiki |
| A Creatures job post (Aug 2026), "3DCG illustration direction/production" for the TCG and TCG Pocket, covers card-face 3DCG art and directing in-house and outside studios. It requires **Maya** and prefers 2D/3D hybrid concept art plus **rendering, compositing and finishing**. | careerconnection.jp listing 142946 |
| PLANETA is a Tokyo 3DCG studio, founded in 2011 by Hideaki Hakozaki (trained in oil painting, then a 3D designer at Hudson Soft). | Bulbapedia |

**Credits** (from TCGdex; "3DCG" means a CG studio, or an artist whose sampled cards are visibly 3D-rendered):

| Sub-line | 3DCG share | Main credits |
|---|---|---|
| Standard ex | ≥83% | 5ban Graphics 33%, PLANETA (Mochizuki/Igarashi/Tsuji/Yamashita) 23%, aky CG Works 9%, takuyoa 9%, N-DESIGN Inc. 6% |
| Tera ex | 100% | 5ban Graphics 81%, aky CG Works 13%, takuyoa 3%, PLANETA Mochizuki 3% |
| Mega ex | 100% | 5ban Graphics 66%, aky CG Works 16%, takuyoa 14%, Keisuke Azuma 5% |

5ban Graphics is the house style, so when in doubt, match 5ban.

**Pipeline** — step 1 and the tools are documented; the order of the other steps is *(inferred)* from the art and
the job post:
1. Start from the official 3D model, which matches the game model (Scarlet/Violet, or Legends Z-A for Megas).
2. Pose it in Maya in the signature attack's key pose.
3. Lay out the camera for the card's art zone (§2).
4. Light and render, in passes.
5. Composite the backdrop, the FX layers (type energy, Mega shards, Tera crystals), debris and particles.
6. Finish: paint over, bloom, color grade.
7. Deliver the art **full-bleed**. The frame and text sit on top, and the art runs under them.

---

## 2. Canvas and layout

All three sub-lines use the same Gen 9 frame; only the header height differs. Generate the **whole card face**:
aspect 63:88 (0.716), for example 1200×1676, or 1024×1432 and 832×1160 for latent-diffusion models (both are
multiples of 8).

The zones below are percentages of card width (W) and height (H), measured by stacking each sub-line's cards
on 600×825 scans. Paint art across the entire canvas. The zones only say where detail may go.

| Zone | Where |
|---|---|
| Border inset | 3.7% W left and right, 2.5% H top |
| Header (covers art) | Basic: 2.5–8% H. Stage 1/2 "Evolves from" line: to 11.5% H. **Mega**: the "Mega-Evolved form of …" pill reaches 14% H on the right half (x 57–97% W). **Tera**: the rule bar reaches 16.4% H |
| **Hero zone** (art visible, no text) | from the header bottom to **47.5% H**, inside the borders. Width:height ≈ 1.67 (Basic), 1.98 (Mega), 2.13 (Tera) |
| Divider bar | 47.5–49.8% H |
| Text zone (art shows under a translucent wash in the type color) | 57–85% H |
| Weakness bar and rule box | 85–97% H |
| Fixed overlays to keep clear | Stage 1/2: evolution portrait circle, x 3–18% W, y 8–18% H. Ancient/Future tag, top right, just under the name bar. Trainer's Pokémon (e.g. Lillie's Clefairy ex): trainer portrait circle at the bottom right of the hero zone, about x 77–97% W, y 40–50% H. Tera (2023–24 frames): crystal ornaments in the top-right and bottom-left corners |

**Placement rules**
- The face, eyes and the attack's contact point (fist, claw, jaws, beam origin) sit **inside the hero zone**,
  below the header for that sub-line.
- Limbs, tails and the body may run down into the text zone.
- **Standard and Tera ex:** the text zone gets a soft, low-detail continuation of the background in the type
  color.
- **Mega ex:** the rainbow shards *keep going* down to the bottom corners of the card, as large flat shapes under
  the wash. Measured side-margin saturation in the lower half: 0.50 for Mega vs 0.42 for standard ex.

---

## 3. Universal style rules (all three sub-lines)

### Subject
1. **High-end 3D CG render of the official design**, matching the Gen 9 game model: exact proportions, colors and
   markings, smooth subdivided surfaces, **PBR materials**. Hard, shiny parts get glossy specular highlights;
   skin gets soft diffuse with subsurface scattering; fur is groomed strands; metal is reflective.
2. **No** black outlines, cel shading, flat anime fills, visible brush texture on the Pokémon, or photoreal animal
   fur. PLANETA's standard ex cards sometimes carry a light painterly finish; treat that as the exception.
3. Eyes match the game model and have a bright catchlight. The expression is determined, aggressive or (for cute
   species) energetic, never idle.
4. **Mid-attack pose** with a strong line of action. The attacking limb, jaws or beam is pushed toward the camera
   and visibly foreshortened.
5. **Scale: big.** The subject spans 70–100% of the hero-zone width and is usually cropped by at least one edge
   (top, side, or the divider). Never small and centered in empty space.

### Camera *(read from an 84-card visual sample)*
6. Wide lens at close range (≈24–35 mm full-frame equivalent), which exaggerates perspective.
7. Low angle, or a dynamic 3/4 front view with the head lunging at the camera. A Dutch tilt of 5–20° is common, and
   the body sits on a diagonal.

### Lighting
8. A neutral or warm key light from above and to one side.
9. A **strong rim light** that traces the silhouette, in white, the type color, or (on Mega ex) the shard colors.
10. Fill light in the FX colors: the energy lights the subject. Add bloom on the brightest areas and push the
    specular highlights.

### Composition layers (the FX differ by sub-line, §4)
11. **Far:** a backdrop, either an environment with shallow depth of field or motion blur, or an abstract field.
12. **Mid:** the sub-line's signature FX layer radiating out from behind the subject, plus concentration lines
    (radial speed lines converging on the subject).
13. **Near:** debris and particles flying toward the camera with motion blur. Some of it overlaps the subject.

---

## 4. The three sub-lines

### 4a. Standard ex — "radial type-energy burst"
- **Backdrop:** mostly abstract, radial and in the type color. Scenic backdrops (forest, sky, ruins, beach) appear
  too, more often on PLANETA cards, and get strong depth of field.
- **FX layer:** streaking light trails and slash arcs in the type color converge behind the subject, together with
  white or silver speed streaks and elemental effects: flames, splashes, bolts, leaves, rock (§6).
- **Near layer:** chunky rock debris (5ban's signature), sparks, droplets.
- **Tone:** saturated and bright; only about 3 distinct vivid hue families per card.
- References: Koraidon ex (aky), Roaring Moon ex (takuyoa), Lucario ex (PLANETA Igarashi), Iron Treads ex
  (5ban), Volcanion ex (5ban), Armarouge ex (takuyoa), Golisopod ex (N-DESIGN), Electivire ex (PLANETA
  Mochizuki), Mamoswine ex (Nisota Niso).

### 4b. Tera ex — "crystal Pokémon"
- **The subject itself is crystal.** Render the whole Pokémon as a faceted, triangulated gemstone mosaic. Keep the
  species' own colors on the facets and vary brightness facet by facet, so each catches light separately.
- Add the **Tera jewel crown** for the card's Tera type on the head. The card's type *is* its Tera type: Tera
  Charizard ex is a Darkness card with orange crystal facets and a dark crown.
- **FX layer:** crystal shards in the Tera type's color burst radially, with white speed streaks.
- **Particles:** very heavy **four-point star glints** and sparkles.
  - Tera ex has the most near-white pixels of the three sub-lines (12% vs 4–5%) and the highest edge density
    (0.41).
  - Prismatic Evolutions Tera cards (Glaceon, Eevee, Flareon, Espeon) use rainbow multicolor crystals instead.
- **Tone:** the brightest and most high-key sub-line (brightness 0.79), with slightly lower saturation and almost
  no blacks.
- References: Charizard ex (Obsidian Flames, 5ban), Dragapult ex (5ban), Teal Mask Ogerpon ex (5ban), Hoopa ex
  (5ban), Pikachu ex (Surging Sparks, aky), Glaceon ex (Prismatic Evolutions, aky).

### 4c. Mega ex — "fixed rainbow shard burst"
The most consistent and most recognizable sub-line. Its signature does **not** depend on type:

- **Shard burst:** long, tapered, angular **flat-color shards and ribbons** explode outward from behind the
  subject in a pinwheel or starburst.
  - Each shape is a sweeping curved blade or a jagged zigzag splinter with a sharp point.
  - Fills are solid or have a faint gradient along their length, with no outline and no texture. A few
    fast-moving pieces get light motion blur.
  - Treat this as a graphic 2D layer composited onto the 3D render.
- **Shard palette:** the same set appears on every Mega, whatever its type. Measured vivid-pixel clusters:
  **yellow #E9DF1E, red #DC2C2F, cyan #0FA3D9, orange #E5752D, hot pink #EA0989, pink #E1327A**. Lime green and
  cobalt or violet blades also appear often. Use 4–6 of these colors per card: Mega cards average 4 vivid hue
  families vs 3 on standard ex, with hue entropy of 2.37 vs 1.75 bits, and yellow appears on 63% of Megas vs
  34% of standard ex.
- **Layering:** shards sit both **behind and in front of** the subject; at least one or two ribbons cross over the
  body. They continue down the side margins to the bottom of the card (§2).
- **Backdrop:** usually **dark** (deep navy, purple, maroon or near-black, sometimes with a faint starfield or
  glow) so the shards pop. Megas have 5x the near-black pixels of standard ex (5% vs 1%).
- **Rim light:** the subject's rim lights pick up the shard colors: yellow-green, red or cyan edges on a glossy
  body.
- **Type FX** stay secondary, woven between the shards: blue flames on Mega Charizard X, lightning on Mega
  Zeraora, water on Mega Starmie, fire on Mega Emboar.
- Four-point sparkles are optional (Mega Gardevoir, Mega Diancie, Mega Clefable).
- **Tone:** the most saturated (0.48), most colorful (104) and most contrasty (64) sub-line.
- References: Mega Venusaur ex, Mega Lucario ex, Mega Gengar ex, Mega Emboar ex, Mega Feraligatr ex, Mega
  Starmie ex, Mega Darkrai ex (all 5ban); Mega Absol ex and Mega Charizard Y ex (aky); Mega Gardevoir ex, Mega
  Charizard X ex and Mega Zygarde ex (takuyoa).

### Tone targets (hero zone; median, with the 10th–90th percentile in brackets; unique art only)

| Metric | Standard ex | Tera ex | Mega ex |
|---|---|---|---|
| Mean saturation (HSV S, 0–1) | 0.41 [0.24–0.58] | 0.38 [0.26–0.46] | 0.48 [0.33–0.63] |
| Mean brightness (HSV V, 0–1) | 0.69 [0.52–0.81] | 0.79 [0.67–0.84] | 0.67 [0.55–0.84] |
| Luminance std (0–255) | 55 [45–64] | 55 [46–64] | 64 [55–73] |
| Colorfulness (Hasler–Süsstrunk) | 82 [46–114] | 93 [66–110] | 104 [81–125] |
| Edge density (§8) | 0.26 [0.18–0.35] | 0.41 [0.35–0.50] | 0.29 [0.24–0.36] |
| Near-white pixels (L>235) | 4% [1–13] | 12% [6–16] | 5% [2–13] |
| Near-black pixels (L<25) | 1% [0–6] | 0% [0–3] | 5% [0–12] |
| Hue entropy (bits, 12 bins) | 1.75 [0.95–2.37] | 2.26 [1.55–2.81] | 2.37 [1.75–2.74] |

---

## 5. Prompt template

```
Official Pokémon Trading Card Game Scarlet & Violet era card illustration, high-end 3D CG render.
{POKEMON}, exact official game-model design ({COLORS_AND_MARKINGS}), mid-attack performing {MOVE}: {POSE}.
Close wide-angle shot (28mm), {low angle | dynamic 3/4 front view, head lunging at camera}, strong
perspective foreshortening, slight dutch tilt. The subject fills the upper half of a vertical 5:7 frame,
cropped by the {top|left|right} edge. Glossy PBR materials, smooth subdivided surfaces, subsurface
scattering on soft parts, bright eye catchlights. Warm key light from the upper {left|right}, strong
{RIM_COLOR} rim light tracing the silhouette, bloom. {SUBLINE_BLOCK}
Lower 40% of the image: continuation of the background {LOWER_TREATMENT}.
```

`SUBLINE_BLOCK` and `LOWER_TREATMENT` by sub-line:
- **Standard ex**
  - Block: "Background: {abstract radial burst | scenic {PLACE} with shallow depth of field} in {TYPE_PALETTE};
    {TYPE_FX} streaking outward from behind the subject; white speed streaks; chunky rock debris and sparks
    flying toward the camera with motion blur. Saturated, bright, high-key."
  - Lower: "softly blurred, low detail, tinted {TYPE_COLOR}".
- **Tera ex**
  - Block: "The Pokémon is made entirely of faceted triangulated crystal in its natural colors, each facet
    catching light, with a {TERA_TYPE} Terastal jewel crown. Background: {TERA_TYPE_COLOR} crystal shards
    bursting radially, white speed streaks, dense four-point star glints and sparkles. Very bright, high-key, no
    deep shadows."
  - Prismatic variant: replace the shard color with "rainbow prismatic crystals".
  - Lower: "low detail, crystalline, tinted {TYPE_COLOR}".
- **Mega ex**
  - Block: "Behind and in front of the subject, an explosive pinwheel burst of flat solid-color angular shards
    and sweeping tapered ribbons in yellow, red, cyan, orange, hot pink and lime green, sharp pointed tips, no
    outlines, graphic 2D style. Dark {navy|purple|maroon} backdrop. Rim lights in the shard colors. {TYPE_FX}
    woven between the shards. Very saturated, high contrast."
  - Lower: "rainbow shards continuing to the bottom corners, tinted by a translucent {TYPE_COLOR} wash".

**Negative prompt:** `cel shading, black outlines, flat 2D anime character, sketch, watercolor, oil paint texture,
pixel art, chibi, photoreal animal, small subject, centered portrait, empty background, plain gradient
background, card frame, border, text, letters, logo, watermark, signature, extra limbs, wrong colors,
off-model, human, muddy, desaturated`. For **standard and Tera ex**, add `crushed blacks`; for **Tera ex**, also
add `matte, non-crystal skin`.

---

## 6. Type → FX and palette (standard and Tera ex; also secondary FX on Mega)

"Lift" means how much more often a hue appears among the saturated hero-zone pixels of that type than across all
Gen 9 types. The "Saturated px" column is the share of hero-zone pixels with S>0.35 and V>0.35.

| Type | Measured hue lift | Saturated px | FX and palette to use |
|---|---|---|---|
| Fire | red ×1.7, orange ×1.5 | 64% (highest) | flames, embers, heat glow; red-orange with yellow cores |
| Water | azure ×2.6 (46% of saturated px), cyan ×1.8 | 54% | splashes, droplets, spray arcs, ice shards |
| Lightning | yellow ×2.3, orange ×1.3 | 56% | branching bolts, sparks, electric arcs |
| Grass | teal ×4.4, green ×4.2, yellow-green ×3.6 | 55% | leaves, vines, petals, sun shafts, forest backdrop |
| Psychic | pink-red ×2.2, magenta ×1.9, violet ×1.4 | 35% (pastel) | pink and violet glows, bubbles, sparkles |
| Darkness | violet ×3.9, magenta ×3.2, pink-red ×2.2 | 48% | night, violet-black smoke, red accents |
| Fighting | orange ×1.5, blue ×1.4, red ×1.2 | 54% | rock debris, dust, impact shockwaves, earth |
| Metal | azure ×1.2, cyan ×1.2 (mostly neutral) | 42% (most neutral) | chrome, silver streaks, white glints, steel-blue sparks |
| Dragon | cyan ×1.8, blue ×1.6 | 50% | mixed elemental energy, cyan and gold |
| Colorless | orange ×1.4, mostly neutral | 46% | sky, wind, white speed streaks |

---

## 7. Recipes

### A. 3D-guided (mirrors the real pipeline; the most consistent results)
1. **Model:** a 3D model faithful to the Gen 9 game design. Pokémon designs and models are copyrighted, so keep
   this for personal or fan use, and use your own creature designs for anything you distribute.
2. **Pose** (Blender or Maya): the key frame of the signature move, with the leading limb or jaws toward the
   camera.
3. **Camera:** 36 mm sensor, 24–35 mm focal length, close enough that the subject spans 70–100% of the hero-zone
   width. Camera below the subject's eye line, roll 5–20°. Load the §2 zones (with the right header height) as a
   camera background image.
4. **Lights:**
   - Key light: warm white, 45° to the side and above, 1×.
   - Rim light: behind the subject, 2–3×. White or the type color; on Mega, two rims in shard colors (e.g.
     yellow and cyan).
   - Fill light: the type color, 0.3–0.5×. Bloom on.
5. **Tera only:** apply a faceted crystal material. A triangulated or decimated normal map gives the facet look;
   use high specular, low roughness and slight transmission, in the species' colors. Add the crown mesh.
6. **Render** at 1200×1676: beauty, depth, normal and line passes, plus a subject mask.
7. **AI pass:** img2img on the beauty pass at denoise 0.35–0.55, with ControlNet depth (0.6–0.8) and canny/line
   art (0.4–0.6), using §5. Then inpaint the background only, through the inverted mask, at denoise 0.8–1.0.
   Keep the face and markings protected.
8. **FX compositing:**
   - Standard and Tera: radial streaks or crystal shards centered behind the chest, then a front debris or glint
     layer.
   - **Mega:** draw the shard burst as **vector shapes** (tapered blades and zigzag splinters, 25–40 pieces, 4–6
     palette colors) in two layers, behind and in front of the subject, and extend them to the bottom corners.
     Shards drawn by hand or procedurally are more faithful than diffusion shards.
9. Grade toward the §4 tone targets, then run QA (§8).

### B. Image model only
1. Feed 3–6 **style references** from the same sub-line (§9), ideally of the same type, cropped to the hero zone
   so the model doesn't copy the frame.
2. Use the §5 prompt at the full-card aspect ratio.
3. For a consistent look over many cards, train one style LoRA per sub-line on hero-zone crops (§8 crop). Caption
   each crop with sub-line, type, move and pose. This is for personal use only: the official art is copyrighted.
4. Run QA and regenerate anything outside the ranges.

---

## 8. QA checklist (accept only if every line passes)
- [ ] The canvas is 63:88, and art covers it edge to edge.
- [ ] Face, eyes and the attack point sit inside the hero zone, below this sub-line's header (§2).
- [ ] The subject spans ≥70% of the hero-zone width and is cropped by at least one edge or the divider.
- [ ] It is on-model: colors, markings and proportions match the official design.
- [ ] Rim light is present, PBR specular highlights are present, and there are no outlines or cel shading.
- [ ] Sub-line signature present:
  - Standard: a radial burst in the type color.
  - Tera: a crystal body, the crown and dense glints.
  - Mega: flat rainbow shards in front of and behind the subject, reaching the bottom corners.
- [ ] Every tone metric falls inside its 10th–90th percentile range (§4), computed as below.

```python
import numpy as np
from PIL import Image
HERO = (.10, .17, .90, .47)  # tighter than §2: clears every header variant; the §4 numbers use this crop

def tone_metrics(path):
    im = Image.open(path).convert('RGB').resize((245, 337))  # same scale as the measured cards
    w, h = im.size
    a = np.asarray(im.crop((int(HERO[0]*w), int(HERO[1]*h), int(HERO[2]*w), int(HERO[3]*h))), dtype=np.float32)
    hsv = np.asarray(Image.fromarray(a.astype(np.uint8)).convert('HSV'), dtype=np.float32) / 255
    lum = a @ np.array([.2126, .7152, .0722])
    rg = a[..., 0] - a[..., 1]; yb = .5 * (a[..., 0] + a[..., 1]) - a[..., 2]
    gy, gx = np.gradient(lum)
    sat = (hsv[..., 1] > .35) & (hsv[..., 2] > .35)
    p = np.histogram((hsv[..., 0][sat] * 360 + 15) % 360, bins=12, range=(0, 360))[0].astype(float)
    p = p[p > 0] / max(p.sum(), 1)
    return dict(sat=hsv[..., 1].mean(), val=hsv[..., 2].mean(), contrast=lum.std(),
                colorful=np.hypot(rg.std(), yb.std()) + .3 * np.hypot(rg.mean(), yb.mean()),
                edge=(np.hypot(gx, gy) > 20).mean(), hi=(lum > 235).mean(), lo=(lum < 25).mean(),
                hue_entropy=-(p * np.log2(p)).sum())
```

---

## 9. Reference cards (regular prints; images from TCGdex)

| Sub-line | Card | Credit | Image |
|---|---|---|---|
| Standard | Koraidon ex (SVI) | aky CG Works | https://assets.tcgdex.net/en/sv/sv01/125/high.png |
| Standard | Roaring Moon ex | takuyoa | https://assets.tcgdex.net/en/sv/sv04/124/high.png |
| Standard | Lucario ex (SCR) | PLANETA Igarashi | https://assets.tcgdex.net/en/sv/sv07/082/high.png |
| Standard | Iron Treads ex | 5ban Graphics | https://assets.tcgdex.net/en/sv/sv01/143/high.png |
| Standard | Volcanion ex | 5ban Graphics | https://assets.tcgdex.net/en/sv/sv09/031/high.png |
| Standard | Armarouge ex | takuyoa | https://assets.tcgdex.net/en/sv/sv04/027/high.png |
| Standard | Golisopod ex | N-DESIGN Inc. | https://assets.tcgdex.net/en/sv/sv04/050/high.png |
| Standard | Electivire ex | PLANETA Mochizuki | https://assets.tcgdex.net/en/sv/sv10/069/high.png |
| Standard | Mamoswine ex | Nisota Niso | https://assets.tcgdex.net/en/sv/sv09/079/high.png |
| Tera | Charizard ex (OBF) | 5ban Graphics | https://assets.tcgdex.net/en/sv/sv03/125/high.png |
| Tera | Dragapult ex (TWM) | 5ban Graphics | https://assets.tcgdex.net/en/sv/sv06/130/high.png |
| Tera | Teal Mask Ogerpon ex | 5ban Graphics | https://assets.tcgdex.net/en/sv/sv06/025/high.png |
| Tera | Hoopa ex | 5ban Graphics | https://assets.tcgdex.net/en/sv/sv04/098/high.png |
| Tera | Pikachu ex (SSP) | aky CG Works | https://assets.tcgdex.net/en/sv/sv08/057/high.png |
| Tera (prismatic) | Glaceon ex (PRE) | aky CG Works | https://assets.tcgdex.net/en/sv/sv08.5/026/high.png |
| Mega | Mega Venusaur ex | 5ban Graphics | https://assets.tcgdex.net/en/me/me01/003/high.png |
| Mega | Mega Lucario ex | 5ban Graphics | https://assets.tcgdex.net/en/me/me01/077/high.png |
| Mega | Mega Absol ex | aky CG Works | https://assets.tcgdex.net/en/me/me01/086/high.png |
| Mega | Mega Gardevoir ex | takuyoa | https://assets.tcgdex.net/en/me/me01/060/high.png |
| Mega | Mega Gengar ex | 5ban Graphics | https://assets.tcgdex.net/en/me/me02/056/high.png |
| Mega | Mega Charizard X ex | takuyoa | https://assets.tcgdex.net/en/me/me02/013/high.png |
| Mega | Mega Charizard Y ex | aky CG Works | https://assets.tcgdex.net/en/me/me02.5/022/high.png |
| Mega | Mega Emboar ex | 5ban Graphics | https://assets.tcgdex.net/en/me/me02.5/031/high.png |
| Mega | Mega Feraligatr ex | 5ban Graphics | https://assets.tcgdex.net/en/me/me02.5/043/high.png |
| Mega | Mega Starmie ex | 5ban Graphics | https://assets.tcgdex.net/en/me/me03/021/high.png |
| Mega | Mega Zygarde ex | takuyoa | https://assets.tcgdex.net/en/me/me03/047/high.png |
| Mega | Mega Darkrai ex | 5ban Graphics | https://assets.tcgdex.net/en/me/me05/048/high.png |

---

## Method and sources
- **Card list and credits:** TCGdex GraphQL (`api.tcgdex.net/v2/graphql`), pulled 2026-10-23. Rarity is "Double
  rare", in `sv*` and `me*` sets. Same-art reprints (same name and illustrator) are counted once in all stats.
- **Frame zones:** the per-pixel mean over 44 Mega, 16 Tera and 24 standard cards, on 600×825 scans, plus
  edge-peak detection along the centre columns and rows.
- **Tone, hue and palette metrics:** the §8 crop of every card's 245×337 image.
  - Hue lift and entropy use 12 bins of 30° among pixels with S>0.35 and V>0.35.
  - The Mega shard palette comes from k-means (k=6) over vivid pixels (S>0.7, V>0.75).
- **Shape, composition and camera traits:** a visual read of all 44 regular Megas, 16 Tera and 24 standard ex
  cards, with full-resolution crops.
- **Production facts:** [CGWORLD — Creatures interview (2017)](https://cgworld.jp/interview/creatures-201707.html) ·
  [Creatures job post: TCG 3DCG illustration](https://careerconnection.jp/job/142946-detail) ·
  [PokéWiki — 5ban Graphics](https://pokewiki.de/5ban_Graphics) ·
  [Bulbapedia — PLANETA](https://bulbapedia.bulbagarden.net/wiki/PLANETA) ·
  [Bulbapedia — Hideaki Hakozaki](https://bulbapedia.bulbagarden.net/wiki/Hideaki_Hakozaki) ·
  [Wikipedia — Creatures Inc.](https://en.wikipedia.org/wiki/Creatures_Inc.)
