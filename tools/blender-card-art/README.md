# Blender card-art toolkit

Python toolkit for producing Gen 9 Pokémon ex / Mega ex card art in Blender, following
`docs/card-art-gen9-ex-mega-generation-spec.md`. It runs two ways:

- **Live, through [blender-mcp](https://github.com/ahujasid/blender-mcp):** Claude calls
  `execute_blender_code`, imports `cardart`, and checks progress with `get_viewport_screenshot` or
  `passes.preview()`.
- **Headless, from the CLI:** `blender -b -P card_build.py ...` or `card_cli.py`.

Built and tested on **Blender 5.2.3** (Python 3.13). It needs Blender 5.0+ for the bloom compositor;
everything else uses APIs that also exist in 4.x.

## Setup

```python
import sys; sys.path.insert(0, '/path/to/repo/tools/blender-card-art')
from cardart import modelprep, sculpt, pose, scene, shards, fx, passes
```

After editing the toolkit inside a running Blender session, call `import cardart; cardart.reload_all()`
to pick up the changes.

## Pipeline (spec section 7A)

| Step | Call | Notes |
|---|---|---|
| Import | `card_cli.import_model(path)` | .fbx, .obj, .glb/.gltf, .dae |
| Prep the game model | `modelprep.weld_seams`, `crease_sharp_edges`, `bake_subdivision` | Closes UV-seam splits; keeps spikes and claws sharp through subdivision |
| Sculpt | `sculpt.grab / inflate / smooth / flatten / pinch / crease`, `sculpt.stroke` | World-space centre and radius, optional `mirror_x`. Brush math lives in `brushmath.py` |
| Blockout (no model) | `sculpt.blockout(name, parts)` | Metaball parts are voxel-remeshed into even topology for sculpting |
| Render smoothing | `modelprep.live_subdivision(obj)` | Runs after the armature, so posed silhouettes stay smooth |
| Materials | `modelprep.card_material(mat, albedo, normal, spec_mask, rim_mask, texture_dir=...)` | Game masks drive gloss, clear coat and the fresnel rim |
| Pose | `pose.pose(rig, {'bone': (x, y, z)})` | Degrees in each bone's local axes |
| Render setup | `scene.setup_render(quality, color)` | Cycles at 1200×1676, denoised. `color='standard'` shows the shard hex colours exactly; `'punchy'` is AgX with the Punchy look |
| Camera | `scene.frame_subject(subject, subline, stage, focus=..., fill=...)` | Puts the focus point on the hero-zone centre for the sub-line and fills `fill` × the hero width (above 1 crops) |
| Lights | `scene.setup_lights(subject, type, subline)` | Key, rim and fill. The rim takes the type colour, or the two shard colours on Mega |
| Mega shards | `shards.build_mega_shards(subject, seed, count)` | Flat emissive blades and splinters in the spec palette, behind and in front of the subject, reaching the bottom corners |
| Far and near layers | `fx.build_backdrop(..., stars=)`, `fx.build_debris(..., motion=)`, `fx.build_speed_lines(...)` | Debris is keyframed and rendered with motion blur |
| Bloom | `scene.setup_bloom()` | Uses the CPU compositor headless; the GPU default aborts without EGL |
| Zone overlay | `scene.add_zone_guide(subline, stage)` | Camera background in the live viewport only; never rendered |
| Renders | `passes.preview`, `passes.render_beauty`, `passes.render_passes` | Control passes: 16-bit depth, camera-space normals (camera-facing = blue), subject mask, shard mask |
| QA | `python3 qa_check.py beauty.png --subline mega` | The spec's tone metrics, checked against the measured 10th–90th percentile ranges |

## Recipes (repeatable builds)

`card_build.py` turns a JSON recipe into a finished render.
`examples/mega_tyranitar.json` is a complete worked example: prep, five sculpt strokes, materials,
roar pose, camera, shards, backdrop, debris, speed lines.

```
blender -b --factory-startup -P tools/blender-card-art/card_build.py -- \
    tools/blender-card-art/examples/mega_tyranitar.json --model-dir ~/models/mega_tyranitar \
    --out out/mega_tyranitar [--preview] [--save-blend]
```

- Sculpt strokes may be anchored to a bone (`"bone": "spine_02", "offset": [x, y, z]`). This matters
  because bones sit inside the body: a brush whose radius never reaches the surface does nothing.
- Every material setting can be overridden per material (e.g. glossier eyes).

## Tests

```
python3 -m unittest discover -s tools/blender-card-art/tests -p 'test_*.py'      # no Blender needed
blender -b --factory-startup --python-exit-code 1 -P tools/blender-card-art/tests/blender_smoke.py -- OUT_DIR
```

## Limits
- Model files and textures are not in the repo. Pokémon designs and game models are copyrighted:
  keep renders for personal use.
- Shards are geometry rather than a 2D composite, so they rotate with the camera. Rebuild them after
  moving the camera.
- `qa_check.py` needs system Python with Pillow; Blender's bundled Python has no Pillow.
