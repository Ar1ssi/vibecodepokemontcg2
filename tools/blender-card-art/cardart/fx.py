"""Backdrop glow and flying debris, placed in the card camera's frame like the shards.

Spec section 3 asks for three layers: far (backdrop), mid (sub-line FX) and near (debris toward the
camera). These build the far and near layers.
"""

import random

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Vector

from . import scene as card_scene
from . import spec
from .shardmath import generate_speed_lines
from .shards import _frame, _material, _shard_object, _to_camera_local

BACKDROP_NAME = 'CardBackdrop'
DEBRIS_COLLECTION = 'CardDebris'
LINES_COLLECTION = 'CardSpeedLines'


def build_backdrop(subject, inner='#633F92', outer='#06040C', glow=0.35, radius=0.75,
                   depth=2.4, stars=0.0, center=None, scene=None):
    """A frame-filling plane behind everything: a radial glow from `inner` (at `glow` brightness)
    fading to `outer`, plus an optional faint starfield (`stars` = brightness, 0 = none), as on
    the dark Mega ex backdrops. `center` is the glow origin in card-frame (u, v), default the hero
    centre; `radius` is in card heights; `depth` is a multiple of the camera-to-subject distance."""
    scene = scene or bpy.context.scene
    cam_obj = _require_camera(scene)
    remove_backdrop()
    distance = _subject_depth(cam_obj, subject) * depth
    frame = _frame(scene, cam_obj)
    margin = 0.1
    corners = [(-margin, -margin), (1 + margin, -margin), (1 + margin, 1 + margin), (-margin, 1 + margin)]
    mesh = bpy.data.meshes.new(BACKDROP_NAME)
    mesh.from_pydata([_to_camera_local(u, v, distance, frame) for u, v in corners], [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new(name='CardFrame')
    for loop, (u, v) in zip(uv.data, corners):
        loop.uv = (u, v)
    obj = bpy.data.objects.new(BACKDROP_NAME, mesh)
    obj.matrix_world = cam_obj.matrix_world.copy()
    obj.visible_shadow = False
    scene.collection.objects.link(obj)
    cu, cv = center if center is not None else spec.hero_center('mega')
    mesh.materials.append(_glow_material(inner, outer, glow, radius, (cu, cv), stars))
    return obj


def remove_backdrop():
    obj = bpy.data.objects.get(BACKDROP_NAME)
    if obj is not None:
        mesh = obj.data
        bpy.data.objects.remove(obj)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def build_debris(subject, count=18, seed=0, color='#3A3533', size=(0.012, 0.045), keep_clear=0.2,
                 front=(0.55, 0.9), back=(1.1, 1.5), front_share=0.6, motion=0.04, center=None, scene=None):
    """Jagged rock chunks scattered through the frame, most of them between the camera and the
    subject. Sizes are fractions of the frame height at each chunk's depth; front chunks stay
    `keep_clear` card heights away from `center` (default hero centre) so the face stays visible.

    `motion` (card heights per frame) keyframes each chunk flying outward from the centre and turns
    on Cycles motion blur, so the debris streaks like the cards' instead of hanging still; 0 = static."""
    scene = scene or bpy.context.scene
    cam_obj = _require_camera(scene)
    if count < 1:
        raise ValueError('count must be at least 1')
    remove_debris()
    collection = bpy.data.collections.new(DEBRIS_COLLECTION)
    scene.collection.children.link(collection)
    rng = random.Random(seed)
    subject_depth = _subject_depth(cam_obj, subject)
    frame = _frame(scene, cam_obj)
    frame_height = frame[3] - frame[2]
    cu, cv = center if center is not None else spec.hero_center('mega')
    material = _rock_material(color)
    for i in range(count):
        is_front = rng.random() < front_share
        lo, hi = front if is_front else back
        depth = subject_depth * rng.uniform(lo, hi)
        u, v = _place(rng, cu, cv, keep_clear if is_front else 0.0)
        radius = rng.uniform(*size) * frame_height * depth / frame[4]
        obj = bpy.data.objects.new(f'CardDebris_{i:02d}', _rock_mesh(rng, radius))
        obj.matrix_world = cam_obj.matrix_world.copy()
        obj.location = cam_obj.matrix_world @ Vector(_to_camera_local(u, v, depth, frame))
        obj.rotation_euler = Euler([rng.uniform(0, 6.283) for _ in range(3)])
        obj.data.materials.append(material)
        collection.objects.link(obj)
        if motion > 0:
            _keyframe_flight(scene, obj, cam_obj, u, v, depth, frame, cu, cv, motion)
    if motion > 0:
        scene.render.use_motion_blur = True
        scene.render.motion_blur_shutter = 0.5
    return collection


def _keyframe_flight(scene, obj, cam_obj, u, v, depth, frame, cu, cv, motion):
    du, dv = (u - cu) * spec.CARD_ASPECT, v - cv
    norm = float(np.hypot(du, dv)) or 1.0
    step_u, step_v = du / norm * motion / spec.CARD_ASPECT, dv / norm * motion
    current = scene.frame_current
    for offset in (-1, 1):
        # Outward in the frame and slightly toward the camera.
        local = _to_camera_local(u + step_u * offset, v + step_v * offset, depth * (1 - 0.03 * offset), frame)
        obj.location = cam_obj.matrix_world @ Vector(local)
        obj.keyframe_insert('location', frame=current + offset)
    obj.location = cam_obj.matrix_world @ Vector(_to_camera_local(u, v, depth, frame))
    for fcurve in _fcurves(obj):
        for point in fcurve.keyframe_points:
            point.interpolation = 'LINEAR'


def _fcurves(obj):
    action = obj.animation_data.action if obj.animation_data else None
    if action is None:
        return []
    if hasattr(action, 'fcurves'):
        return list(action.fcurves)
    # Blender 5.x layered actions keep curves in channelbags.
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                curves.extend(bag.fcurves)
    return curves


def build_speed_lines(subject, count=48, seed=0, color='#FFFFFF', strength=0.6, depth=1.3,
                      center=None, scene=None):
    """Thin concentration lines converging on the subject, behind it (spec rule 12)."""
    scene = scene or bpy.context.scene
    cam_obj = _require_camera(scene)
    remove_speed_lines()
    collection = bpy.data.collections.new(LINES_COLLECTION)
    scene.collection.children.link(collection)
    distance = _subject_depth(cam_obj, subject) * depth
    frame = _frame(scene, cam_obj)
    material = _material(color, strength)
    for i, line in enumerate(generate_speed_lines(seed=seed, count=count, center=center)):
        obj = _shard_object(f'CardSpeedLine_{i:02d}', line, distance * (1 + i * 0.0005), frame, cam_obj)
        obj.data.materials.append(material)
        obj.visible_shadow = False
        collection.objects.link(obj)
    return collection


def remove_speed_lines():
    collection = bpy.data.collections.get(LINES_COLLECTION)
    if collection is None:
        return
    for obj in list(collection.objects):
        mesh = obj.data
        bpy.data.objects.remove(obj)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    bpy.data.collections.remove(collection)


def remove_debris():
    collection = bpy.data.collections.get(DEBRIS_COLLECTION)
    if collection is None:
        return
    for obj in list(collection.objects):
        mesh = obj.data
        bpy.data.objects.remove(obj)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    bpy.data.collections.remove(collection)


def _place(rng, cu, cv, keep_clear):
    for _ in range(200):
        u, v = rng.uniform(0.0, 1.0), rng.uniform(0.05, 0.95)
        if np.hypot((u - cu) * spec.CARD_ASPECT, v - cv) >= keep_clear:
            return u, v
    return (0.05 if cu > 0.5 else 0.95), cv


def _rock_mesh(rng, radius):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
    stretch = np.array([rng.uniform(0.6, 1.4) for _ in range(3)])
    for vert in bm.verts:
        jitter = np.array([rng.uniform(0.75, 1.25) for _ in range(3)])
        vert.co = tuple(np.array(vert.co) * stretch * jitter)
    mesh = bpy.data.meshes.new('CardDebris')
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = False  # faceted, like the chunky debris on the cards
    return mesh


def _rock_material(color):
    name = f'CardDebris_{color.lstrip("#")}'
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:  # Blender 4.x; 5.x always has a node tree
        mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*spec.hex_to_linear(color), 1.0)
    bsdf.inputs['Roughness'].default_value = 0.75
    return mat


def _glow_material(inner, outer, glow, radius, center, stars=0.0):
    name = BACKDROP_NAME
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:  # Blender 4.x; 5.x always has a node tree
        mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    coords = nt.nodes.new('ShaderNodeUVMap')
    coords.uv_map = 'CardFrame'
    offset = nt.nodes.new('ShaderNodeVectorMath')
    offset.operation = 'SUBTRACT'
    offset.inputs[1].default_value = (center[0], center[1], 0.0)
    squash = nt.nodes.new('ShaderNodeVectorMath')
    squash.operation = 'MULTIPLY'
    squash.inputs[1].default_value = (spec.CARD_ASPECT, 1.0, 0.0)  # distances in card heights
    length = nt.nodes.new('ShaderNodeVectorMath')
    length.operation = 'LENGTH'
    fade = nt.nodes.new('ShaderNodeMapRange')
    fade.inputs['From Min'].default_value = 0.0
    fade.inputs['From Max'].default_value = radius
    fade.inputs['To Min'].default_value = 1.0
    fade.inputs['To Max'].default_value = 0.0
    smooth = nt.nodes.new('ShaderNodeMath')
    smooth.operation = 'POWER'
    smooth.inputs[1].default_value = 2.0
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (*spec.hex_to_linear(outer), 1.0)
    mix.inputs['B'].default_value = (*[c * glow for c in spec.hex_to_linear(inner)], 1.0)
    emit = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    links = nt.links
    links.new(coords.outputs['UV'], offset.inputs[0])
    links.new(offset.outputs['Vector'], squash.inputs[0])
    links.new(squash.outputs['Vector'], length.inputs[0])
    links.new(length.outputs['Value'], fade.inputs['Value'])
    links.new(fade.outputs['Result'], smooth.inputs[0])
    links.new(smooth.outputs['Value'], mix.inputs['Factor'])
    color = mix.outputs['Result']
    if stars > 0:
        color = _add_stars(nt, squash.outputs['Vector'], color, stars)
    links.new(color, emit.inputs['Color'])
    links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return mat


def _add_stars(nt, coords, color, brightness):
    # Voronoi cell distance -> tiny bright points; a noise mask thins them into uneven clusters.
    voronoi = nt.nodes.new('ShaderNodeTexVoronoi')
    voronoi.feature = 'F1'
    voronoi.inputs['Scale'].default_value = 90.0
    voronoi.inputs['Randomness'].default_value = 1.0
    points = nt.nodes.new('ShaderNodeMapRange')
    points.inputs['From Min'].default_value = 0.0
    points.inputs['From Max'].default_value = 0.06
    points.inputs['To Min'].default_value = 1.0
    points.inputs['To Max'].default_value = 0.0
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 6.0
    thin = nt.nodes.new('ShaderNodeMapRange')
    thin.inputs['From Min'].default_value = 0.45
    thin.inputs['From Max'].default_value = 0.65
    mask = nt.nodes.new('ShaderNodeMath')
    mask.operation = 'MULTIPLY'
    scaled = nt.nodes.new('ShaderNodeMath')
    scaled.operation = 'MULTIPLY'
    scaled.inputs[1].default_value = brightness
    add = nt.nodes.new('ShaderNodeMix')
    add.data_type = 'RGBA'
    add.blend_type = 'ADD'
    add.inputs['Factor'].default_value = 1.0
    links = nt.links
    links.new(coords, voronoi.inputs['Vector'])
    links.new(voronoi.outputs['Distance'], points.inputs['Value'])
    links.new(coords, noise.inputs['Vector'])
    links.new(noise.outputs['Fac'], thin.inputs['Value'])
    links.new(points.outputs['Result'], mask.inputs[0])
    links.new(thin.outputs['Result'], mask.inputs[1])
    links.new(mask.outputs['Value'], scaled.inputs[0])
    links.new(color, add.inputs['A'])
    links.new(scaled.outputs['Value'], add.inputs['B'])
    return add.outputs['Result']


def _subject_depth(cam_obj, subject):
    points = card_scene.world_points(subject)
    target = (points.min(0) + points.max(0)) / 2
    inv = np.array(cam_obj.matrix_world.inverted())
    depth = -float((target @ inv[:3, :3].T + inv[:3, 3])[2])
    if depth <= 0:
        raise RuntimeError('subject is behind the camera')
    return depth


def _require_camera(scene):
    if scene.camera is None:
        raise RuntimeError('no scene camera; call scene.frame_subject first')
    return scene.camera

