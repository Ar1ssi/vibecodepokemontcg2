# Regular Pokémon V / EX / ex card art — generation spec

A spec for an AI (image model, or an agent driving one) to reproduce the art on the **regular** prints
of rule-box Pokémon. Every number here was measured from real cards (method and sources at the end);
anything inferred rather than measured is marked *(inferred)*.

**In scope (669 cards):**
- **V** — Sword & Shield "Holo Rare V" (230 cards).
- **EX** — XY-era Pokémon-EX, regular print only (123 cards).
- **ex** — Scarlet & Violet / Mega Evolution "Double Rare" ex (316 cards).

**Out of scope:** full arts, alternate arts, secret, hyper, gold and rainbow rares, Special Illustration
Rares, VMAX and VSTAR. In XY sets the full arts are numbered *inside* the set count, so for EX the
regular print is the lowest-numbered card of that name in the set.

---

## 1. How the real art is made

The art is **3D CG**: posed 3D models, rendered, then composited and finished in 2D.

| Evidence | Source |
|---|---|
| Creatures Inc. builds the 3D Pokémon models from Game Freak's official designs, and those models are the reference other Pokémon games use. Its Pokémon CG Studio works in-house. | CGWORLD interview with Creatures (2017) |
| 5ban Graphics is Creatures' in-house 3D-CG illustration studio. | *Pokémon TCG Illustration Collection*, cited by PokéWiki |
| Creatures' Aug 2026 job post "3DCG illustration direction/production" for the TCG covers card-face 3DCG art, directing in-house and outside studios, and work in **Maya**. Preferred skills: 2D/3D hybrid concept art, and **rendering, compositing and finishing**. | careerconnection.jp listing 142946 |
| PLANETA is a Tokyo 3DCG studio, founded in 2011 by Hideaki Hakozaki (trained in oil painting, then a 3D designer at Hudson Soft). | Bulbapedia |

**Who draws the regular prints** (TCGdex credits; "3DCG" means a CG studio, or an artist whose sampled cards
are visibly 3D-rendered):

| Line | 3DCG share | Main credits |
|---|---|---|
| V | ≥82% | 5ban Graphics 23%, PLANETA (Mochizuki/Tsuji/Igarashi) 21%, aky CG Works 10%, Ayaka Yoshida 7%, Saki Hayashiro 5%, Eske Yoshinob 5%, N-DESIGN Inc. 5% |
| EX | ≥91% | Eske Yoshinob 42%, 5ban Graphics 34%, Ayaka Yoshida 8%, PLANETA 7% |
| ex | ≥88% | 5ban Graphics 47%, PLANETA (all) 16%, aky CG Works 11%, takuyoa 9%, N-DESIGN Inc. 4% |

Ryo Ueda drew 56 XY EX cards, and **all of them are full arts** (yellow-outlined style). Don't use them as
references for regular EX art.

**Pipeline** — step 1 and the tools are documented; the order of the other steps is *(inferred)* from the art
and the job post:
1. Start from the official 3D model, which matches the game model's proportions and markings.
2. Pose it in Maya in the signature attack's key pose.
3. Lay out the camera for the card's art zone (§2).
4. Light and render, in passes.
5. Composite the background (a matte painting or an abstract energy field), the type FX, debris and particles.
6. Finish: paint over, bloom, color grade.
7. Deliver the art **full-bleed**. The frame and text are laid on top, and the art runs under them.

---

## 2. Canvas and layout

Generate the **whole card face**, not a window. The aspect ratio is 63:88 (0.716). Workable sizes:
1200×1676, or 1024×1432 and 832×1160 for latent-diffusion models (both are multiples of 8).

The zones below are percentages of card width (W) and height (H), measured by stacking 30 cards per frame.
Paint art across the entire canvas. The zones only say where detail may go.

| Zone | V (SWSH) | EX (XY) | ex (SV/ME) |
|---|---|---|---|
| Border inset | 3.7% W each side, 2.7% H top | 3.8% W, 2.8% H | 3.7% W, 2.5% H |
| Name bar (covers art) | 2.7–9.5% H | 2.8–11% H | 2.5–8% H; Stage 1/2 and Tera add bars down to 16.4% H |
| **Hero zone** (art visible, no text) | **9.5–60% H** | **11–49.6% H** | **8–47.6% H** (16.4–47.6% for Stage 1/2 and Tera) |
| Hero zone aspect (w:h) | ≈1.31 (4:3) | ≈1.72 | ≈1.67 (5:3) |
| Divider bar | none | 49.6–52% H | 47.6–51% H |
| Text zone (art shows faintly under a type-colored wash) | 60–84% H | 55–80% H | 55–80% H |
| Weakness bar and rule box | 85–96% H | 84–97% H | 85–98% H |
| Fixed overlays to keep clear | black "V" wedge, top-left triangle x<11% W, y<21% H; Rapid/Single Strike logo on some cards, x 68–96% W, y 10–15% H | Mega cards: evolution portrait, top-left | Stage 1/2: evolution portrait circle, x 3–18% W, y 8–18% H; Ancient/Future/Tera tag, top right under the name bar |

**Placement rules**
- The face, eyes and the attack's contact point (fist, claw, beam origin) sit **inside the hero zone**.
- Limbs, tails and the body may run down into the text zone, but nothing critical goes there.
- The text zone gets a low-detail continuation of the background in the type color. The real cards wash it
  with a translucent type-colored gradient, so busy detail there turns to noise behind the text.

---

## 3. Universal style rules (all three lines)

### Subject
1. **High-end 3D CG render of the official design**: exact proportions, colors and markings, smooth subdivided
   surfaces, **PBR materials**. Hard, shiny parts get glossy specular highlights; skin gets soft diffuse with
   subsurface scattering; fur, feathers and cotton are groomed strands; metal is reflective.
2. **No** black outlines, cel shading, flat anime fills, visible pencil or brush texture on the Pokémon, or
   photoreal animal fur. Some PLANETA cards (e.g. Honchkrow V) get a light painterly finish; treat that as the
   exception.
3. Eyes match the game model and have a bright catchlight. The expression is determined or aggressive, never
   neutral or idle.
4. **Mid-attack pose** with a strong line of action. The attacking limb, head or beam is pushed toward the
   camera and visibly foreshortened.
5. **Scale: big.** The subject spans 70–100% of the hero-zone width. On most cards it is cropped by at least
   one frame edge (top, side, or the divider). Never small, centered and surrounded by empty space.

### Camera *(read from a 44-card visual sample)*
6. Wide lens at close range (≈24–35 mm full-frame equivalent), which exaggerates perspective.
7. Low angle (camera below the subject's eye line) or a dynamic 3/4 front view. A Dutch tilt of 5–20° is common.
   The body sits on a diagonal, not square to the frame.

### Lighting
8. A neutral or warm key light from above and to one side.
9. A **strong rim or back light** that traces the whole silhouette, in white or the type color.
10. Fill light in the FX color: the energy lights the subject. Add bloom on the brightest areas and push the
    specular highlights.

### Background: always three layers, never a flat backdrop
11. **Far:** either an environment (sky, ruins, terrain, night with a moon) with shallow depth of field or motion
    blur, or an abstract field of energy in the type color.
12. **Mid:** type FX (§5): energy streaks or slash trails radiating out from behind the subject, elemental
    effects, and "concentration lines" (radial speed lines) converging on it.
13. **Near:** debris flying toward the camera with motion blur (rock chunks, crystal shards, sparks, feathers,
    droplets). Some of it overlaps the subject.

### Tone targets (measured over the hero zone of all 669 cards; median, with the 10th–90th percentile in brackets)

| Metric | V | EX | ex |
|---|---|---|---|
| Mean saturation (HSV S, 0–1) | 0.36 [0.24–0.52] | 0.41 [0.25–0.52] | 0.42 [0.25–0.58] |
| Mean brightness (HSV V, 0–1) | 0.69 [0.56–0.81] | 0.63 [0.55–0.75] | 0.71 [0.55–0.84] |
| Luminance std (0–255) | 52 [41–60] | 61 [52–71] | 56 [46–66] |
| Colorfulness (Hasler–Süsstrunk) | 71 [48–107] | 76 [46–100] | 87 [50–118] |
| Edge density (§7) | 0.20 [0.13–0.28] | 0.31 [0.19–0.47] | 0.29 [0.19–0.42] |
| Near-white pixels (L>235) | 3% [1–11] | 5% [2–13] | 6% [1–13] |
| Near-black pixels (L<25) | 0% [0–3] | 2% [0–10] | 1% [0–8] |

**In plain terms:** bright and high-key, saturated but not neon, almost no crushed blacks, and a few percent of
blown highlights from glints, bloom and FX cores.

---

## 4. What changes by line

### V (Sword & Shield, 2020–23) — "clean, scenic"
- Usually a scenic backdrop: sky, terrain, ruins or a night sky, with real depth of field. Abstract energy
  backgrounds are rarer than on ex.
- The cleanest line: lowest edge density (0.20) and lowest saturation (0.36). Polished, rather than glittery.
- FX are integrated into the action: a lightning storm, a water splash, a punch shockwave, pink slash ribbons.
- Leave the top-left "V" wedge area empty.
- References: Kleavor V (5ban), Metagross V (PLANETA Mochizuki), Tapu Koko V (PLANETA Tsuji), Slaking V,
  Aerodactyl V, Golurk V, Tsareena V, Honchkrow V.

### EX (XY, 2013–16) — "glitter and rays"
- Signature particles: **glitter specks, four-point star glints, bokeh, thin bright light rays radiating from a
  point behind the subject, lens flares**. Starfields work for Psychic and Darkness types.
- Highest contrast (61) and edge density (0.31), and the most dark areas of the three lines.
- Very tight crops: Skarmory and Charizard EX fill the zone to the point of filling the frame.
- **Mega EX (5ban Graphics):** giant 3D **katakana lettering of the attack name** runs diagonally across the art.
  The letters are beveled, filled with a red-to-yellow gradient, and outlined in white and then black. Behind
  them is an aggressive radial burst in complementary saturated colors (yellow, pink, cyan) with comic
  concentration lines. Image models garble text, so render the lettering separately and composite it.
- References: Charizard EX (Generations), Skarmory EX, Malamar EX, Camerupt EX, Kyurem EX, Rayquaza EX.
  Mega: M Alakazam, M Sceptile, M Tyranitar, M Audino EX.

### ex (Scarlet & Violet / Mega Evolution, 2023–) — "explosive radial burst"
- The most colorful line (colorfulness 87) and the brightest (0.71).
- The background is usually an **abstract radial burst**: streaking light trails in the type color converge
  behind the subject, rock debris flies at the camera, and sparks fill the gaps. Scenic backgrounds are rarer
  than on V.
- 5ban Graphics drew 47% of the line, so its look is the default: clean model, hard rim light, orange and
  yellow energy streaks, chunky rock debris.
- **Tera ex:** the Pokémon gets a faceted, triangulated crystal shader plus its Tera jewel crown, and the scene
  is full of rainbow prismatic sparkles and colored crystal shards, often on a dark starry background.
- References: Koraidon ex (aky), Roaring Moon ex (takuyoa), Lucario ex (PLANETA Igarashi), Iron Treads ex,
  Volcanion ex, Armarouge ex, Golisopod ex. Tera: Glaceon ex.

---

## 5. Type → FX and palette

"Lift" means how much more often a hue appears among the saturated hero-zone pixels of that type than across
all types. The FX column describes the effects seen on the sample cards.

| Type | Measured hue lift | Saturated px | FX and palette to use |
|---|---|---|---|
| Fire | orange ×1.9, red ×1.8 | 67% (highest) | flames, embers, heat glow; red-orange to yellow cores |
| Water | azure ×2.7 (50% of saturated px), cyan ×1.5 | 47% | splashes, droplets, spray arcs; sky and ocean blues |
| Lightning | yellow ×2.4, cyan ×1.3 | 52% | branching bolts, sparks, storm sky; yellow with cyan accents |
| Grass | teal ×3.8, green ×2.8, yellow-green ×2.8 | 52% | leaves, petals, sun shafts, foliage |
| Psychic | pink-red ×2.1, magenta ×2.1, violet ×1.7 | 35% (pastel) | pink and violet energy, glows, sparkles |
| Darkness | magenta ×4.0, violet ×3.9, blue ×2.5 | 47% | night, moon, violet-blue shadows, dark wisps |
| Fighting | orange ×1.5, red ×1.3 | 49% | rock debris, dust, earth, impact shockwaves |
| Metal | none (neutral) | 38% (most neutral) | chrome, silver, white glints, steel-blue sparks |
| Dragon | teal ×1.9, cyan ×1.4 | 50% | mixed elemental energy, gold accents |
| Colorless | orange ×1.4 (mostly neutral) | 45% | open sky, wind streaks, white speed lines |
| Fairy (EX only) | sample too small (n=9) | 39% | pink sparkles; the frame is pink |

---

## 6. Recipes

### A. 3D-guided (mirrors the real pipeline; the most consistent results)
1. **Model:** a 3D model faithful to the official design. Pokémon designs and models are copyrighted, so keep
   this for personal or fan use, and use your own creature designs for anything you distribute.
2. **Pose** (Blender or Maya): the key frame of the signature move, with the leading limb toward the camera and
   a readable silhouette.
3. **Camera:** 36 mm sensor, 24–35 mm focal length, close enough that the subject spans 70–100% of the hero-zone
   width. Camera below the subject's eye line, roll 5–20°. Load the §2 zones as a camera background image so
   you compose against them.
4. **Lights:** key light, warm white, 45° to the side and above, intensity 1×. Rim light behind the subject,
   2–3× the key, white or the type color. Fill light in the type color, 0.3–0.5×. A low-intensity HDRI. Bloom on.
5. **Render** at 1200×1676: a beauty pass, plus depth, normal, line art (Freestyle, or canny edges of the beauty
   pass) and a subject mask.
6. **AI pass:** img2img on the beauty pass at denoise 0.35–0.55, with ControlNet depth (0.6–0.8) and
   canny/line art (0.4–0.6), using the prompt below. Then inpaint the background only, through the inverted
   mask, at denoise 0.8–1.0 for the three background layers. Keep the subject's face and markings protected.
7. **Composite:** radial streaks centered behind the subject's chest, a front debris layer with motion blur,
   bloom, then a grade toward the §3 tone targets. For Mega EX, add the katakana lettering layer.
8. **QA** (§7).

### B. Image model only
1. Feed 3–6 **style references** of the same line and, ideally, the same type (§8). Crop them to the hero zone
   so the model doesn't copy the frame.
2. Use the prompt template below, at the full-card aspect ratio.
3. For a consistent look over many cards, train a style LoRA on hero-zone crops of the 669 regular cards (crop
   with the §2 zones; caption each with line, type, move and pose). This is for personal use only: the
   official art is copyrighted.
4. Run QA (§7) and regenerate anything outside the ranges.

### Prompt template
```
Official Pokémon Trading Card Game {LINE_STYLE} card illustration, high-end 3D CG render.
{POKEMON}, exact official design ({COLORS_AND_MARKINGS}), mid-attack performing {MOVE}: {POSE}.
Close wide-angle shot (28mm), {low angle | dynamic 3/4 front view}, strong perspective foreshortening,
slight dutch tilt. The subject fills the upper half of a vertical 5:7 frame, cropped by the {top|left|right}
edge. Glossy PBR materials, smooth subdivided surfaces, subsurface scattering on soft parts, bright eye
catchlights. Lighting: warm key light from the upper {left|right}, strong {RIM_COLOR} rim light tracing the
silhouette, fill light from the {TYPE} energy, bloom. Background: {FAR_LAYER}; {TYPE_FX} radiating from
behind the subject; {DEBRIS} flying toward the camera with motion blur; shallow depth of field.
Palette: {TYPE_PALETTE}, saturated, bright, high-key. Lower 40% of the image: soft, low-detail
continuation of the background tinted {TYPE_COLOR}.
```

`LINE_STYLE` add-ons:
- **V:** "Sword & Shield era Pokémon V, scenic environment backdrop with depth of field, clean polish"
- **EX:** "XY era Pokémon-EX, glitter particles, four-point star glints, thin radiating light rays, lens flare, bokeh"
- **ex:** "Scarlet & Violet era Pokémon ex, explosive radial energy burst, streaking light trails, rock debris"
- **Tera ex:** add "faceted crystalline Terastal shader, gemstone crown, rainbow prismatic sparkles"

**Negative prompt:** `cel shading, black outlines, flat 2D anime, sketch, watercolor, oil paint texture,
pixel art, chibi, photoreal animal, small subject, centered portrait, empty background, plain gradient
background, card frame, border, text, letters, logo, watermark, signature, extra limbs, wrong colors,
off-model, human, dark, muddy, desaturated, crushed blacks`

---

## 7. QA checklist (accept only if every line passes)
- [ ] The canvas is 63:88, and art covers it edge to edge.
- [ ] Face, eyes and the attack point sit inside the hero zone for this line (§2); nothing important under the
      name bar, the V wedge or the overlays.
- [ ] The subject spans ≥70% of the hero-zone width and is cropped by at least one edge or the divider.
- [ ] It is on-model: colors, markings and proportions match the official design.
- [ ] Rim light is present, PBR specular highlights are present, and there are no outlines or cel shading.
- [ ] All three background layers are present, and the FX match the type (§5).
- [ ] Every tone metric falls inside its 10th–90th percentile range (§3), computed as below.

```python
import numpy as np
from PIL import Image
HERO = {'V': (.10, .12, .90, .58), 'EX': (.10, .12, .90, .49), 'ex': (.10, .17, .90, .47)}

def tone_metrics(path, line):
    im = Image.open(path).convert('RGB').resize((245, 337))  # same scale as the measured cards
    x0, y0, x1, y1 = HERO[line]; w, h = im.size
    a = np.asarray(im.crop((int(x0*w), int(y0*h), int(x1*w), int(y1*h))), dtype=np.float32)
    hsv = np.asarray(Image.fromarray(a.astype(np.uint8)).convert('HSV'), dtype=np.float32) / 255
    lum = a @ np.array([.2126, .7152, .0722])
    rg = a[..., 0] - a[..., 1]; yb = .5 * (a[..., 0] + a[..., 1]) - a[..., 2]
    gy, gx = np.gradient(lum)
    return dict(sat=hsv[..., 1].mean(), val=hsv[..., 2].mean(), contrast=lum.std(),
                colorful=np.hypot(rg.std(), yb.std()) + .3 * np.hypot(rg.mean(), yb.mean()),
                edge=(np.hypot(gx, gy) > 20).mean(), hi=(lum > 235).mean(), lo=(lum < 25).mean())
```
The `HERO` crop above is a slightly tighter version of the §2 hero zone. It avoids the frame bars and the V
wedge, and it is the crop the §3 numbers were measured on.

---

## 8. Reference cards (regular prints; images from TCGdex)

| Line | Card | Credit | Image |
|---|---|---|---|
| V | Kleavor V | 5ban Graphics | https://assets.tcgdex.net/en/swsh/swsh10/087/high.png |
| V | Metagross V | PLANETA Mochizuki | https://assets.tcgdex.net/en/swsh/swsh6/112/high.png |
| V | Tapu Koko V | PLANETA Tsuji | https://assets.tcgdex.net/en/swsh/swsh1/72/high.png |
| V | Slaking V | Saki Hayashiro | https://assets.tcgdex.net/en/swsh/swsh10.5/058/high.png |
| V | Aerodactyl V | N-DESIGN Inc. | https://assets.tcgdex.net/en/swsh/swsh11/092/high.png |
| V | Golurk V | Eske Yoshinob | https://assets.tcgdex.net/en/swsh/swsh7/70/high.png |
| V | Tsareena V | PLANETA Mochizuki | https://assets.tcgdex.net/en/swsh/swsh8/21/high.png |
| V | Honchkrow V (painterly outlier) | PLANETA Mochizuki | https://assets.tcgdex.net/en/swsh/swsh9/088/high.png |
| EX | Charizard EX (Generations) | Eske Yoshinob | https://assets.tcgdex.net/en/xy/g1/11/high.png |
| EX | Skarmory EX | Eske Yoshinob | https://assets.tcgdex.net/en/xy/xy1/80/high.png |
| EX | Malamar EX | Eske Yoshinob | https://assets.tcgdex.net/en/xy/xy4/58/high.png |
| EX | Camerupt EX | Eske Yoshinob | https://assets.tcgdex.net/en/xy/xy5/29/high.png |
| EX | Kyurem EX | PLANETA | https://assets.tcgdex.net/en/xy/xy7/25/high.png |
| EX | Rayquaza EX | PLANETA | https://assets.tcgdex.net/en/xy/xy6/60/high.png |
| Mega EX | M Alakazam EX | 5ban Graphics | https://assets.tcgdex.net/en/xy/xy10/26/high.png |
| Mega EX | M Sceptile EX | 5ban Graphics | https://assets.tcgdex.net/en/xy/xy7/8/high.png |
| Mega EX | M Tyranitar EX | 5ban Graphics | https://assets.tcgdex.net/en/xy/xy7/43/high.png |
| Mega EX | M Audino EX | 5ban Graphics | https://assets.tcgdex.net/en/xy/xy10/85/high.png |
| ex | Koraidon ex | aky CG Works | https://assets.tcgdex.net/en/sv/sv01/125/high.png |
| ex | Roaring Moon ex | takuyoa | https://assets.tcgdex.net/en/sv/sv04/124/high.png |
| ex | Lucario ex | PLANETA Igarashi | https://assets.tcgdex.net/en/sv/sv07/082/high.png |
| ex | Iron Treads ex | 5ban Graphics | https://assets.tcgdex.net/en/sv/sv01/143/high.png |
| ex | Volcanion ex | 5ban Graphics | https://assets.tcgdex.net/en/sv/sv09/031/high.png |
| ex | Armarouge ex | takuyoa | https://assets.tcgdex.net/en/sv/sv04/027/high.png |
| ex | Golisopod ex | N-DESIGN Inc. | https://assets.tcgdex.net/en/sv/sv04/050/high.png |
| Tera ex | Glaceon ex | aky CG Works | https://assets.tcgdex.net/en/sv/sv08.5/026/high.png |

---

## Method and sources
- **Credits and rarity:** TCGdex GraphQL (`api.tcgdex.net/v2/graphql`), pulled 2026-10-23. Regular means
  rarity "Holo Rare V" (V); "Double rare" in sv*/me* sets (ex); and, for xy* sets, the lowest-numbered print per
  set and name, with secret rares excluded (EX).
- **Frame zones:** per-pixel mean and standard deviation over 30 cards per frame, on 600×825 scans, plus
  edge-peak detection along the centre columns and rows.
- **Tone and hue metrics:** the hero-zone crop (§7) of all 669 regular cards' 245×337 images. Hue lift
  compares 12 bins of 30° among pixels with S>0.35 and V>0.35.
- **Composition, camera and FX traits:** a visual read of 44 cards across the main studios (8–14 per line).
- **Production facts:** [CGWORLD — Creatures interview (2017)](https://cgworld.jp/interview/creatures-201707.html) ·
  [Creatures job post: TCG 3DCG illustration](https://careerconnection.jp/job/142946-detail) ·
  [PokéWiki — 5ban Graphics](https://pokewiki.de/5ban_Graphics) ·
  [Bulbapedia — PLANETA](https://bulbapedia.bulbagarden.net/wiki/PLANETA) ·
  [Bulbapedia — Hideaki Hakozaki](https://bulbapedia.bulbagarden.net/wiki/Hideaki_Hakozaki) ·
  [Wikipedia — Creatures Inc.](https://en.wikipedia.org/wiki/Creatures_Inc.)
