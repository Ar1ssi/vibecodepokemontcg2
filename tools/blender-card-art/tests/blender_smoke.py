"""End-to-end check inside real Blender (5.x):

    blender -b --factory-startup --python-exit-code 1 -P tools/blender-card-art/tests/blender_smoke.py -- OUT_DIR
"""

import os
import sys

import bmesh
import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from cardart import fx, modelprep, passes, pose, scene, sculpt, shards, spec  # noqa: E402

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/cardart-smoke'


def check(condition, message):
    if not condition:
        raise AssertionError(message)
    print(f'ok - {message}')


def vertices(obj):
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def image_array(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1]  # top row first


def main():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)

    creature = sculpt.blockout('Creature', [
        {'shape': 'ellipsoid', 'co': (0, 0, 1.0), 'radius': 1.0, 'size': (0.8, 0.6, 1.0)},
        {'shape': 'ball', 'co': (0, -0.2, 2.0), 'radius': 0.7},
        {'shape': 'capsule', 'co': (0.7, -0.3, 1.3), 'radius': 0.35, 'size': (0.5, 1, 1), 'rotation': (0, 30, 20)},
        {'shape': 'capsule', 'co': (-0.7, -0.3, 1.3), 'radius': 0.35, 'size': (0.5, 1, 1), 'rotation': (0, -30, -20)},
        {'shape': 'capsule', 'co': (0, 0.8, 0.5), 'radius': 0.3, 'size': (0.8, 1, 1), 'rotation': (0, 0, 90)},
    ], resolution=0.06)
    check(len(creature.data.vertices) > 1000, f'blockout has even topology ({len(creature.data.vertices)} verts)')

    before = vertices(creature)
    sculpt.grab(creature, (0.4, -0.75, 2.1), 0.3, (0.0, -0.15, 0.1), mirror_x=True)
    after = vertices(creature)
    moved = np.linalg.norm(after - before, axis=1) > 1e-6
    check(moved.any() and not moved.all(), 'grab moves only vertices under the brush')
    check((after[moved][:, 0] > 0).any() and (after[moved][:, 0] < 0).any(), 'mirror_x sculpts both sides')
    dabs = sculpt.stroke(creature, 'crease', [(-0.3, -0.85, 2.3), (0.3, -0.85, 2.3)], 0.12, depth=0.03)
    check(dabs >= 3, f'crease stroke laid {dabs} dabs')
    for brush in ('inflate', 'smooth', 'flatten', 'pinch'):
        kwargs = {'amount': 0.05} if brush == 'inflate' else {}
        snapshot = vertices(creature)
        sculpt.BRUSHES[brush](creature, (0, 0.55, 1.0), 0.4, **kwargs)
        check(np.abs(vertices(creature) - snapshot).max() > 1e-6, f'{brush} changes the mesh')

    scene.setup_render(quality='preview', color='punchy')
    framing = scene.frame_subject(creature, 'mega', focus=(0, -0.6, 2.1), fill=0.85)
    hero_u, hero_v = spec.hero_center('mega')
    au, av = framing['anchor_uv']
    check(abs(au - hero_u) < 0.01 and abs(av - hero_v) < 0.01, f'focus lands on the hero centre ({au:.3f}, {av:.3f})')
    check(abs(framing['width_of_hero'] - 0.85) < 0.02, f'subject fills 85% of hero width ({framing["width_of_hero"]:.3f})')
    cam = bpy.context.scene.camera
    pts = scene.world_points(creature)[::500]
    ours = scene.project(bpy.context.scene, cam, pts)
    theirs = np.array([tuple(world_to_camera_view(bpy.context.scene, cam, Vector(p)))[:2] for p in pts])
    theirs[:, 1] = 1 - theirs[:, 1]
    check(np.abs(ours - theirs).max() < 1e-4, 'projection matches bpy_extras.world_to_camera_view (with shift)')

    lights = scene.setup_lights(creature, 'Darkness', 'mega')
    check(sorted(o.name for o in lights) == ['CardLight_Fill', 'CardLight_Key', 'CardLight_RimA', 'CardLight_RimB'],
          'mega gets key, two shard-coloured rims and fill')
    scene.setup_lights(creature, 'Fire', 'standard')
    check(len([o for o in bpy.context.scene.objects if o.name.startswith('CardLight_')]) == 3,
          'setup_lights replaces previous card lights')
    scene.setup_lights(creature, 'Darkness', 'mega')

    collection = shards.build_mega_shards(creature, seed=3, count=32)
    check(len(collection.objects) == 32, 'shard burst has 32 shards')
    inv = cam.matrix_world.inverted()
    subject_depth = -(inv @ Vector(scene.world_points(creature).mean(0))).z
    depths = {o.name: -(inv @ o.matrix_world @ o.data.vertices[0].co).z for o in collection.objects}
    check(all(d < subject_depth for n, d in depths.items() if n.endswith('front')), 'front shards sit before the subject')
    check(all(d > subject_depth for n, d in depths.items() if n.endswith('back')), 'back shards sit behind the subject')
    shards.build_mega_shards(creature, seed=4, count=32)
    check(len(bpy.data.collections['CardShards'].objects) == 32, 'rebuilding shards replaces the old burst')

    fx.build_backdrop(creature, stars=1.0)
    backdrop = bpy.data.objects['CardBackdrop']
    check(-(inv @ backdrop.matrix_world @ backdrop.data.vertices[0].co).z > max(depths.values()),
          'backdrop sits behind every shard')
    debris = fx.build_debris(creature, count=12, seed=1, motion=0.04)
    check(len(debris.objects) == 12 and bpy.context.scene.render.use_motion_blur, 'debris built with motion blur')
    flight = debris.objects[0]
    frame_now = bpy.context.scene.frame_current
    bpy.context.scene.frame_set(frame_now - 1)
    p0 = flight.matrix_world.translation.copy()
    bpy.context.scene.frame_set(frame_now + 1)
    p1 = flight.matrix_world.translation.copy()
    bpy.context.scene.frame_set(frame_now)
    check((p1 - p0).length > 1e-4, 'debris is keyframed to move across the shutter')
    lines = fx.build_speed_lines(creature, count=24)
    check(len(lines.objects) == 24, 'speed lines built')
    fx.build_debris(creature, count=5, seed=2, motion=0)
    check(len(bpy.data.collections['CardDebris'].objects) == 5, 'rebuilding debris replaces the old set')

    scene.setup_bloom()
    check(bpy.context.scene.compositing_node_group.name == 'CardCompositor', 'bloom compositor installed')
    check(bpy.context.scene.render.compositor_device == 'CPU', 'headless bloom runs on the CPU compositor')
    guide = scene.add_zone_guide('mega')
    check(guide.size[0] == 300 and len(cam.data.background_images) == 1, 'zone guide attached to the camera')

    bpy.context.scene.render.resolution_percentage = 20
    settings = (bpy.context.scene.render.engine, bpy.context.scene.view_settings.view_transform,
                bpy.context.scene.view_settings.look, bpy.context.scene.cycles.samples)
    path = passes.preview(os.path.join(OUT, 'preview.png'), scale=20, samples=8)
    check(os.path.getsize(path) > 1000, 'preview render written')
    out = passes.render_passes(creature, os.path.join(OUT, 'passes'), samples=4)
    check(set(out) == {'depth', 'normal', 'mask', 'shard_mask'}, 'all control passes rendered')
    after = (bpy.context.scene.render.engine, bpy.context.scene.view_settings.view_transform,
             bpy.context.scene.view_settings.look, bpy.context.scene.cycles.samples)
    check(after == settings and bpy.context.view_layer.material_override is None, 'passes restore scene settings')
    check(not any(o.hide_render for o in bpy.context.scene.objects), 'passes restore object visibility')

    mask = image_array(out['mask'])[..., 0]
    coverage = (mask > 0.5).mean()
    check(0.03 < coverage < 0.8, f'subject mask covers {coverage:.1%} of the frame')
    ys, xs = np.nonzero(mask > 0.5)
    cy, cx = int(ys.mean()), int(xs.mean())
    normal = image_array(out['normal'])[cy, cx]
    check(normal[2] > 0.7, f'camera-facing normals encode as blue (b={normal[2]:.2f})')
    depth = image_array(out['depth'])[..., 0]
    check(depth[cy, cx] > 0.2 and depth[mask < 0.01].max() < 0.05,  # skip anti-aliased edge pixels
          'depth is bright on the subject, black elsewhere')
    shard_mask = image_array(out['shard_mask'])[..., 0]
    check((shard_mask > 0.5).mean() > 0.05, 'shard mask is non-empty')

    rig = bpy.data.objects.new('Rig', bpy.data.armatures.new('Rig'))
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    bone = rig.data.edit_bones.new('arm')
    bone.head, bone.tail = (0, 0, 0), (0, 0, 1)
    bpy.ops.object.mode_set(mode='OBJECT')
    pose.pose(rig, {'arm': (30, 0, 0)})
    check(abs(rig.pose.bones['arm'].rotation_euler.x - 0.5236) < 1e-3, 'pose sets bone rotation in degrees')
    try:
        pose.pose(rig, {'missing': (0, 0, 0)})
        check(False, 'unknown bone raises')
    except KeyError:
        check(True, 'unknown bone raises')
    check_modelprep()
    print('SMOKE PASSED')


def check_modelprep():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.split_edges(bm, edges=bm.edges[:])  # every face its own island, like a seam-split game export
    mesh = bpy.data.meshes.new('SplitCube')
    bm.to_mesh(mesh)
    bm.free()
    cube = bpy.data.objects.new('SplitCube', mesh)
    bpy.context.scene.collection.objects.link(cube)
    check(len(cube.data.vertices) == 24, 'split cube has 24 vertices')
    removed, before, after = modelprep.weld_seams(cube)
    check(removed == 16 and before == 24 and after == 0, f'weld_seams closes the seams ({removed}, {before}, {after})')
    hard, soft = modelprep.crease_sharp_edges(cube)
    check(hard == 12 and soft == 0, 'cube edges (90 degrees) get full crease')
    verts = modelprep.bake_subdivision(cube, 1)
    co = np.empty(verts * 3)
    cube.data.vertices.foreach_get('co', co)
    extent = np.abs(co.reshape(-1, 3) - (0, 0, 0)).max()
    check(verts == 26 and abs(extent - 0.5) < 1e-4, 'creased subdivision keeps the cube corners sharp')
    mat = bpy.data.materials.new('CardTest')
    path = os.path.join(OUT, 'tex.png')
    img = bpy.data.images.new('tex', 4, 4)
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    modelprep.card_material(mat, 'tex.png', normal='tex.png', spec_mask='tex.png', rim_mask='tex.png',
                            texture_dir=OUT)
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    check(bsdf.inputs['Roughness'].is_linked and bsdf.inputs['Emission Strength'].is_linked,
          'card_material wires spec mask to gloss and rim mask to emission')
    try:
        modelprep.card_material(mat, 'missing.png', texture_dir=OUT)
        check(False, 'missing texture raises')
    except FileNotFoundError:
        check(True, 'missing texture raises')


main()
