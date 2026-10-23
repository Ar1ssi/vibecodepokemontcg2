"""Headless card render: set up camera, lights, bloom (and Mega shards), then render beauty + passes.

    blender -b [scene.blend] -P tools/blender-card-art/card_cli.py -- \\
        --subject Body,Eyes --subline mega --type Darkness --out out/card [--import model.fbx] \\
        [--quality preview|final] [--color punchy|standard] [--focus x,y,z] [--fill 0.9] \\
        [--azimuth 25] [--elevation -12] [--roll 8] [--focal 28] [--seed 0] [--no-shards] \\
        [--no-passes] [--save-blend path.blend]

Without --subject, every mesh in the scene is the subject. Prints a JSON summary on the last line.
"""

import argparse
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cardart import passes, scene, shards, spec  # noqa: E402

_IMPORTERS = {
    '.fbx': lambda p: bpy.ops.import_scene.fbx(filepath=p),
    '.obj': lambda p: bpy.ops.wm.obj_import(filepath=p),
    '.glb': lambda p: bpy.ops.import_scene.gltf(filepath=p),
    '.gltf': lambda p: bpy.ops.import_scene.gltf(filepath=p),
    '.dae': lambda p: bpy.ops.wm.collada_import(filepath=p),
}


def parse(argv):
    parser = argparse.ArgumentParser(prog='card_cli.py')
    parser.add_argument('--subject', help='comma-separated object names (default: all meshes)')
    parser.add_argument('--subline', choices=spec.SUBLINES, default='standard')
    parser.add_argument('--stage', choices=spec.STAGES, default='basic')
    parser.add_argument('--type', dest='type_name', choices=sorted(spec.TYPE_COLORS), required=True)
    parser.add_argument('--out', required=True, help='output directory')
    parser.add_argument('--import', dest='import_path', help='model file to import first')
    parser.add_argument('--quality', choices=sorted(scene.QUALITY), default='preview')
    parser.add_argument('--color', choices=sorted(scene.COLOR_PRESETS), default='punchy')
    parser.add_argument('--focus', type=_vector, help='world point to anchor in the hero zone, x,y,z')
    parser.add_argument('--fill', type=float, default=0.85)
    parser.add_argument('--azimuth', type=float, default=25.0)
    parser.add_argument('--elevation', type=float, default=-12.0)
    parser.add_argument('--roll', type=float, default=8.0)
    parser.add_argument('--focal', type=float, default=28.0)
    parser.add_argument('--seed', type=int, default=0)
    parser.add_argument('--no-shards', action='store_true')
    parser.add_argument('--no-passes', action='store_true')
    parser.add_argument('--save-blend')
    return parser.parse_args(argv)


def _vector(text):
    parts = [float(p) for p in text.split(',')]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError('expected x,y,z')
    return tuple(parts)


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    if ext not in _IMPORTERS:
        raise SystemExit(f'cannot import {ext} files; supported: {sorted(_IMPORTERS)}')
    if not os.path.exists(path):
        raise SystemExit(f'model not found: {path}')
    before = set(bpy.data.objects)
    _IMPORTERS[ext](os.path.abspath(path))
    return [o for o in bpy.data.objects if o not in before]


def pick_subject(names):
    if names:
        found = [bpy.data.objects.get(n.strip()) for n in names.split(',')]
        missing = [n for n, o in zip(names.split(','), found) if o is None]
        if missing:
            raise SystemExit(f'objects not found: {missing}')
        return found
    meshes = [o for o in bpy.context.scene.objects
              if o.type == 'MESH' and not o.name.startswith('CardShard_')]
    if not meshes:
        raise SystemExit('no mesh objects in the scene; pass --import or open a .blend')
    return meshes


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = parse(argv)
    if args.import_path:
        import_model(args.import_path)
    subject = pick_subject(args.subject)
    scene.setup_render(quality=args.quality, color=args.color)
    framing = scene.frame_subject(subject, args.subline, args.stage, focus=args.focus, focal=args.focal,
                                  azimuth=args.azimuth, elevation=args.elevation, roll=args.roll,
                                  fill=args.fill)
    scene.setup_lights(subject, args.type_name, args.subline)
    if args.subline == 'mega' and not args.no_shards:
        shards.build_mega_shards(subject, seed=args.seed)
    scene.setup_bloom()
    os.makedirs(args.out, exist_ok=True)
    outputs = {'beauty': passes.render_beauty(os.path.join(args.out, 'beauty.png'))}
    if not args.no_passes:
        outputs.update(passes.render_passes(subject, os.path.join(args.out, 'passes')))
    if args.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save_blend), copy=True)
    summary = {'outputs': outputs, 'subject': [o.name for o in subject],
               'anchor_uv': framing['anchor_uv'], 'hero_center_uv': framing['hero_center_uv'],
               'width_of_hero': framing['width_of_hero']}
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
