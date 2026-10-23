"""Build a card render from a JSON recipe: import -> prep -> sculpt -> materials -> pose -> card FX -> render.

    blender -b --factory-startup -P tools/blender-card-art/card_build.py -- RECIPE.json \\
        --model-dir DIR --out DIR [--preview] [--no-passes] [--save-blend]

`--model-dir` holds the model file and textures named in the recipe (see examples/). `--preview`
renders at 30% with 24 samples for quick iteration. Prints a JSON summary on the last line.
"""

import argparse
import json
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cardart import fx, modelprep, passes, pose, scene, sculpt, shards, spec  # noqa: E402
from card_cli import import_model  # noqa: E402

_BRUSH_KEYS = ('mesh', 'brush', 'center', 'radius', 'points', 'bone', 'offset')


def parse(argv):
    parser = argparse.ArgumentParser(prog='card_build.py')
    parser.add_argument('recipe')
    parser.add_argument('--model-dir', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--no-passes', action='store_true')
    parser.add_argument('--save-blend', action='store_true')
    return parser.parse_args(argv)


def objects(names):
    found = {n: bpy.data.objects.get(n) for n in names}
    missing = [n for n, o in found.items() if o is None]
    if missing:
        raise SystemExit(f'objects not found after import: {missing}')
    return [found[n] for n in names]


def bone_point(rig, name, offset=(0, 0, 0)):
    if rig is None or name not in rig.data.bones:
        raise SystemExit(f'bone {name!r} not found (is "armature" set in the recipe?)')
    return tuple(np.asarray(rig.matrix_world @ rig.data.bones[name].head_local) + np.asarray(offset))


def run_sculpt(strokes, rig):
    for stroke in strokes:
        mesh = objects([stroke['mesh']])[0]
        if 'bone' in stroke:
            stroke = dict(stroke, center=bone_point(rig, stroke['bone'], stroke.get('offset', (0, 0, 0))))
        kwargs = {k: v for k, v in stroke.items() if k not in _BRUSH_KEYS}
        if 'points' in stroke:
            sculpt.stroke(mesh, stroke['brush'], stroke['points'], stroke['radius'], **kwargs)
        else:
            sculpt.BRUSHES[stroke['brush']](mesh, tuple(stroke['center']), stroke['radius'], **kwargs)


def build(recipe, model_dir, out, preview=False, render_passes=True, save_blend=False):
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    import_model(os.path.join(model_dir, recipe['model']))
    subject = objects(recipe['subject'])
    rig = bpy.data.objects.get(recipe['armature']) if recipe.get('armature') else None

    prep = recipe.get('prep', {})
    report = {}
    for mesh in objects(prep.get('meshes', [])):
        if prep.get('weld', True):
            report[f'{mesh.name}.weld'] = modelprep.weld_seams(mesh)
        report[f'{mesh.name}.creases'] = modelprep.crease_sharp_edges(mesh, prep.get('crease_hard', 65),
                                                                      prep.get('crease_soft', 45))
        report[f'{mesh.name}.verts'] = modelprep.bake_subdivision(mesh, prep.get('bake_levels', 1))
    run_sculpt(recipe.get('sculpt', []), rig)
    for mesh in objects(prep.get('meshes', [])):
        modelprep.live_subdivision(mesh, 0, prep.get('render_levels', 1))

    defaults = recipe.get('material_defaults', {})
    for name, textures in recipe.get('materials', {}).items():
        material = bpy.data.materials.get(name)
        if material is None:
            raise SystemExit(f'material {name!r} not found after import')
        settings = dict(defaults, **textures)
        modelprep.card_material(material, texture_dir=model_dir, **settings)

    if rig is not None:
        pose.reset(rig)
        pose.pose(rig, {k: tuple(v) for k, v in recipe.get('pose', {}).items()})

    subline, stage, type_name = recipe['subline'], recipe.get('stage', 'basic'), recipe['type']
    render = recipe.get('render', {})
    scene.setup_render(quality='preview' if preview else render.get('quality', 'final'),
                       color=recipe.get('color', 'standard'))
    bpy.context.scene.view_settings.exposure = recipe.get('exposure', 0.0)
    cam = dict(recipe.get('camera', {}))
    focus = None
    if 'focus_bone' in cam:
        bone, offset = cam.pop('focus_bone'), cam.pop('focus_offset', (0, 0, 0))
        if rig is None or bone not in rig.pose.bones:
            raise SystemExit(f'focus bone {bone!r} not found (is "armature" set in the recipe?)')
        posed = rig.matrix_world @ rig.pose.bones[bone].head  # posed position, not the rest one
        focus = tuple(np.asarray(posed) + np.asarray(offset))
    framing = scene.frame_subject(subject, subline, stage, focus=focus, **cam)
    scene.setup_lights(subject, type_name, subline, **recipe.get('lights', {}))

    if subline == 'mega' and recipe.get('shards') is not None:
        shards.build_mega_shards(subject, **recipe['shards'])
    if recipe.get('backdrop') is not None:
        fx.build_backdrop(subject, **recipe['backdrop'])
    if recipe.get('debris') is not None:
        fx.build_debris(subject, **_tuples(recipe['debris']))
    if recipe.get('speed_lines') is not None:
        fx.build_speed_lines(subject, **recipe['speed_lines'])
    scene.setup_bloom(strength=recipe.get('bloom', 0.4))

    os.makedirs(out, exist_ok=True)
    if save_blend or render.get('save_blend'):
        bpy.ops.file.pack_all()  # textures travel inside the .blend
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.path.join(out, 'card.blend')), copy=True)
    if preview:
        outputs = {'beauty': passes.preview(os.path.join(out, 'beauty.png'), scale=30, samples=24)}
    else:
        bpy.context.scene.cycles.samples = render.get('samples', 128)
        outputs = {'beauty': passes.render_beauty(os.path.join(out, 'beauty.png'))}
    if render_passes and render.get('passes', True) and not preview:
        outputs.update(passes.render_passes(subject, os.path.join(out, 'passes')))
    hero = spec.hero_zone(subline, stage)
    return {'outputs': outputs, 'prep': report, 'anchor_uv': framing['anchor_uv'],
            'hero_zone': hero, 'width_of_hero': framing['width_of_hero']}


def _tuples(params):
    return {k: tuple(v) if isinstance(v, list) else v for k, v in params.items()}


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = parse(argv)
    with open(args.recipe) as handle:
        recipe = json.load(handle)
    summary = build(recipe, args.model_dir, args.out, preview=args.preview,
                    render_passes=not args.no_passes, save_blend=args.save_blend)
    print(json.dumps(summary, default=str))


if __name__ == '__main__':
    main()
