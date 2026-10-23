"""Build the Mega ex shard burst (shardmath.py) as flat emissive geometry in front of the camera.

Back shards sit behind the subject and front shards between it and the camera, so they layer
correctly in the render, and their emission tints the subject's rim the way the real cards do.
"""

import bpy
import numpy as np

from . import scene as card_scene
from . import spec
from .shardmath import generate_shards

COLLECTION_NAME = 'CardShards'
MATERIAL_PREFIX = 'CardShard_'


def build_mega_shards(subject, seed=0, count=28, back_depth=1.6, front_depth=0.55,
                      emission=1.0, keep_clear=0.22, center=None, scene=None):
    """Replace any previous shards with a new burst framed by the current card camera.

    Depths are multiples of the camera-to-subject distance: back shards at `back_depth` (>1, behind
    the subject), front shards at `front_depth` (<1, in front of it). `center` is the burst origin in
    card-frame (u, v); it defaults to the Mega hero-zone centre.
    """
    scene = scene or bpy.context.scene
    cam_obj = scene.camera
    if cam_obj is None:
        raise RuntimeError('no scene camera; call scene.frame_subject first')
    if not back_depth > 1.0 > front_depth > 0.0:
        raise ValueError('need back_depth > 1 > front_depth > 0')
    remove_shards()
    collection = bpy.data.collections.new(COLLECTION_NAME)
    scene.collection.children.link(collection)

    points = card_scene.world_points(subject)
    target = (points.min(0) + points.max(0)) / 2
    inv = np.array(cam_obj.matrix_world.inverted())
    subject_depth = -float((target @ inv[:3, :3].T + inv[:3, 3])[2])
    if subject_depth <= 0:
        raise RuntimeError('subject is behind the camera')

    shards = generate_shards(seed=seed, count=count, center=center, keep_clear=keep_clear)
    frame = _frame(scene, cam_obj)
    for i, shard in enumerate(shards):
        depth = subject_depth * (front_depth if shard.layer == 'front' else back_depth)
        # Nudge each shard's depth so overlapping shards never z-fight.
        depth *= 1.0 + (i - len(shards) / 2) * 0.002
        obj = _shard_object(f'CardShard_{i:02d}_{shard.layer}', shard, depth, frame, cam_obj)
        obj.data.materials.append(_material(shard.color, emission))
        obj.visible_shadow = False
        collection.objects.link(obj)
    return collection


def remove_shards():
    collection = bpy.data.collections.get(COLLECTION_NAME)
    if collection is None:
        return
    for obj in list(collection.objects):
        mesh = obj.data
        bpy.data.objects.remove(obj)
        if mesh is not None and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    bpy.data.collections.remove(collection)


def _frame(scene, cam_obj):
    corners = cam_obj.data.view_frame(scene=scene)
    xs, ys = [v.x for v in corners], [v.y for v in corners]
    return min(xs), max(xs), min(ys), max(ys), -corners[0].z


def _to_camera_local(u, v, depth, frame):
    x_min, x_max, y_min, y_max, z0 = frame
    scale = depth / z0
    x = (x_min + u * (x_max - x_min)) * scale
    y = (y_max - v * (y_max - y_min)) * scale
    return (x, y, -depth)


def _shard_object(name, shard, depth, frame, cam_obj):
    verts, faces = [], []
    for k, (left, right) in enumerate(zip(shard.left, shard.right)):
        verts.append(_to_camera_local(*left, depth, frame))
        verts.append(_to_camera_local(*right, depth, frame))
        if k:
            a = 2 * (k - 1)
            faces.append((a, a + 1, a + 3, a + 2))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    obj.matrix_world = cam_obj.matrix_world.copy()
    return obj


def _material(hex_color, strength):
    name = f'{MATERIAL_PREFIX}{hex_color.lstrip("#")}'
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:  # Blender 4.x; 5.x always has a node tree
        mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (*spec.hex_to_linear(hex_color), 1.0)
    emit.inputs['Strength'].default_value = strength
    out = nodes.new('ShaderNodeOutputMaterial')
    links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return mat
