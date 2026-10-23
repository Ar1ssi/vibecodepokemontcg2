"""Blockout and sculpt brushes for Blender meshes (object mode, world-space inputs).

Brushes read the mesh, run the numpy math in brushmath.py in world space, and write it back, so
they behave the same through blender-mcp's execute_blender_code and in `blender -b` scripts.
"""

import math

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

from . import brushmath

_SHAPES = {'ball': 'BALL', 'ellipsoid': 'ELLIPSOID', 'capsule': 'CAPSULE', 'cube': 'CUBE', 'plane': 'PLANE'}


def blockout(name, parts, resolution=0.04, voxel_size=None, collection=None):
    """Build a sculptable mesh from metaball parts, then voxel-remesh it to even topology.

    Each part is a dict: shape ('ball', 'ellipsoid', 'capsule', 'cube', 'plane'), co (x, y, z),
    radius, optional size (x, y, z) for non-ball shapes, rotation (degrees XYZ), negative (bool,
    carves instead of adds). Metaball surfaces land a little inside `radius`. Replaces an object
    of the same name.
    """
    if not parts:
        raise ValueError('blockout needs at least one part')
    collection = collection or bpy.context.scene.collection
    meta = bpy.data.metaballs.new(f'{name}_meta')
    meta.resolution = resolution
    meta.render_resolution = resolution
    for part in parts:
        _add_element(meta, part)
    meta_obj = bpy.data.objects.new(f'{name}_meta', meta)
    collection.objects.link(meta_obj)
    try:
        mesh = _evaluated_mesh(meta_obj, name)
    finally:
        bpy.data.objects.remove(meta_obj)
        bpy.data.metaballs.remove(meta)
    if len(mesh.vertices) == 0:
        bpy.data.meshes.remove(mesh)
        raise ValueError('blockout produced an empty mesh; parts may be too small for the resolution')
    obj = _replace_object(name, mesh, collection)
    remesh(obj, voxel_size or resolution)
    return obj


def remesh(obj, voxel_size):
    """Voxel remesh in place (uniform quads, smooth shading); bakes all modifiers first."""
    if voxel_size <= 0:
        raise ValueError('voxel_size must be positive')
    mod = obj.modifiers.new('CardRemesh', 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = voxel_size
    mod.use_smooth_shade = True
    apply_modifiers(obj)
    return obj


def apply_modifiers(obj):
    """Bake the evaluated mesh (all modifiers) into the object's own mesh data."""
    _ensure_object_mode()
    old = obj.data
    name = old.name
    obj.data = _evaluated_mesh(obj, name)
    obj.modifiers.clear()
    if old.users == 0:
        bpy.data.meshes.remove(old)
    obj.data.name = name
    return obj


def grab(obj, center, radius, offset, strength=1.0, mirror_x=False):
    def apply(co, normals, edges, c, mirrored):
        off = _mirror_vector(obj, offset) if mirrored else offset
        return brushmath.grab(co, c, radius, off, strength)
    return _brush(obj, center, radius, mirror_x, apply)


def inflate(obj, center, radius, amount, mirror_x=False):
    return _brush(obj, center, radius, mirror_x,
                  lambda co, n, e, c, m: brushmath.inflate(co, n, c, radius, amount))


def smooth(obj, center, radius, strength=0.5, iterations=2, mirror_x=False):
    return _brush(obj, center, radius, mirror_x,
                  lambda co, n, e, c, m: brushmath.smooth(co, e, c, radius, strength, iterations))


def flatten(obj, center, radius, strength=0.5, mirror_x=False):
    return _brush(obj, center, radius, mirror_x,
                  lambda co, n, e, c, m: brushmath.flatten(co, n, c, radius, strength))


def pinch(obj, center, radius, strength=0.3, mirror_x=False):
    return _brush(obj, center, radius, mirror_x,
                  lambda co, n, e, c, m: brushmath.pinch(co, n, c, radius, strength))


def crease(obj, center, radius, strength=0.3, depth=0.02, mirror_x=False):
    return _brush(obj, center, radius, mirror_x,
                  lambda co, n, e, c, m: brushmath.crease(co, n, c, radius, strength, depth))


BRUSHES = {'grab': grab, 'inflate': inflate, 'smooth': smooth, 'flatten': flatten,
           'pinch': pinch, 'crease': crease}


def stroke(obj, brush, points, radius, spacing=None, **kwargs):
    """Drag a brush along a world-space polyline, one dab every `spacing` (default radius / 2).

    For 'grab', `offset` is the total move, split evenly across the dabs.
    """
    if brush not in BRUSHES:
        raise ValueError(f'brush must be one of {sorted(BRUSHES)}, got {brush!r}')
    dabs = brushmath.stroke_points(points, spacing or radius / 2)
    if brush == 'grab' and 'offset' in kwargs:
        kwargs['offset'] = tuple(np.asarray(kwargs['offset'], dtype=np.float64) / len(dabs))
    for dab in dabs:
        BRUSHES[brush](obj, tuple(dab), radius, **kwargs)
    return len(dabs)


def _brush(obj, center, radius, mirror_x, apply):
    if obj is None or obj.type != 'MESH':
        raise ValueError('sculpt brushes need a mesh object')
    _ensure_object_mode()
    co, normals, edges = _read_world(obj)
    center = np.asarray(center, dtype=np.float64)
    co = apply(co, normals, edges, center, False)
    if mirror_x:
        mirrored = np.asarray(_mirror_point(obj, center), dtype=np.float64)
        # A dab sitting on the symmetry plane would otherwise be applied twice.
        if np.linalg.norm(mirrored - center) > radius * 0.25:
            co = apply(co, normals, edges, mirrored, True)
    _write_world(obj, co)
    return obj


def _read_world(obj):
    mesh = obj.data
    n = len(mesh.vertices)
    co = np.empty(n * 3, dtype=np.float64)
    mesh.vertices.foreach_get('co', co)
    normals = np.empty(n * 3, dtype=np.float64)
    mesh.vertex_normals.foreach_get('vector', normals)
    edges = np.empty(len(mesh.edges) * 2, dtype=np.int64)
    mesh.edges.foreach_get('vertices', edges)
    m = np.array(obj.matrix_world)
    co = co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]
    normal_m = np.linalg.inv(m[:3, :3]).T
    normals = normals.reshape(-1, 3) @ normal_m.T
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = np.divide(normals, lengths, out=np.zeros_like(normals), where=lengths > 0)
    return co, normals, edges.reshape(-1, 2)


def _write_world(obj, co):
    inv = np.linalg.inv(np.array(obj.matrix_world))
    local = co @ inv[:3, :3].T + inv[:3, 3]
    obj.data.vertices.foreach_set('co', local.astype(np.float32).ravel())
    obj.data.update()


def _mirror_point(obj, point):
    local = obj.matrix_world.inverted() @ Vector(point)
    local.x = -local.x
    return tuple(obj.matrix_world @ local)


def _mirror_vector(obj, vec):
    rot = obj.matrix_world.to_3x3()
    local = rot.inverted() @ Vector(vec)
    local.x = -local.x
    return tuple(rot @ local)


def _add_element(meta, part):
    shape = part.get('shape', 'ball')
    if shape not in _SHAPES:
        raise ValueError(f'shape must be one of {sorted(_SHAPES)}, got {shape!r}')
    el = meta.elements.new(type=_SHAPES[shape])
    el.co = part['co']
    el.radius = part.get('radius', 1.0)
    size = part.get('size', (1.0, 1.0, 1.0))
    el.size_x, el.size_y, el.size_z = size
    rot = part.get('rotation', (0.0, 0.0, 0.0))
    el.rotation = Euler([math.radians(a) for a in rot], 'XYZ').to_quaternion()
    el.use_negative = bool(part.get('negative', False))


def _evaluated_mesh(obj, name):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    depsgraph.update()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    mesh.name = name
    return mesh


def _replace_object(name, mesh, collection):
    existing = bpy.data.objects.get(name)
    if existing is not None:
        old_mesh = existing.data if existing.type == 'MESH' else None
        bpy.data.objects.remove(existing)
        if old_mesh is not None and old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)
    obj = bpy.data.objects.new(name, mesh)
    obj.matrix_world = Matrix.Identity(4)
    collection.objects.link(obj)
    return obj


def _ensure_object_mode():
    # Mesh data is stale while a mesh is in edit or sculpt mode in the live UI.
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
