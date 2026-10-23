"""Renders for the AI stage (spec 7A): beauty, depth, normal, subject mask, shard mask, previews.

Control passes render with a temporary material override and the Raw view transform, so pixel
values are the data itself. Every scene setting they touch is restored afterwards, even on error.
"""

import contextlib
import os

import bpy
import numpy as np

from . import scene as card_scene
from .shards import COLLECTION_NAME as SHARD_COLLECTION

_RENDERABLE = {'MESH', 'CURVE', 'SURFACE', 'META', 'FONT', 'CURVES', 'POINTCLOUD', 'VOLUME'}


def render_beauty(path, scene=None):
    """Render the scene as set up (camera, lights, bloom, colour preset) to a PNG."""
    scene = scene or bpy.context.scene
    _check_ready(scene)
    return _render(scene, path)


def preview(path, scale=40, samples=24, scene=None):
    """Quick low-res beauty render for checking progress (works headless and in the live UI)."""
    scene = scene or bpy.context.scene
    _check_ready(scene)
    with _restored(scene):
        scene.render.resolution_percentage = scale
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
        return _render(scene, path)


def render_passes(subject, out_dir, samples=16, scene=None):
    """Depth (16-bit, near = white), camera-space normals, subject mask and, if present, shard mask.

    Depth is normalised over the subject's own depth range so it uses the full value range.
    Returns {pass name: path}.
    """
    scene = scene or bpy.context.scene
    _check_ready(scene)
    os.makedirs(out_dir, exist_ok=True)
    near, far = _depth_range(scene, subject)
    shard_objects = _shard_objects()
    results = {}
    with _restored(scene):
        _control_settings(scene, samples)
        _only_visible(scene, set(card_scene.subjects(subject)))
        results['depth'] = _with_override(scene, _depth_material(near, far),
                                          os.path.join(out_dir, 'depth.png'), color_depth='16')
        results['normal'] = _with_override(scene, _normal_material(), os.path.join(out_dir, 'normal.png'))
        results['mask'] = _with_override(scene, _flat_material('CardPassWhite', 1.0),
                                         os.path.join(out_dir, 'mask.png'), color_mode='BW')
        if shard_objects:
            _only_visible(scene, set(shard_objects))
            results['shard_mask'] = _with_override(scene, _flat_material('CardPassWhite', 1.0),
                                                   os.path.join(out_dir, 'shard_mask.png'), color_mode='BW')
    return results


def _check_ready(scene):
    if scene.camera is None:
        raise RuntimeError('no scene camera; call scene.frame_subject first')


def _render(scene, path):
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if not os.path.exists(path):
        raise RuntimeError(f'render finished but {path} was not written')
    return path


def _shard_objects():
    collection = bpy.data.collections.get(SHARD_COLLECTION)
    return list(collection.objects) if collection else []


def _depth_range(scene, subject):
    points = card_scene.world_points(subject)
    inv = np.array(scene.camera.matrix_world.inverted())
    depth = -(points @ inv[:3, :3].T + inv[:3, 3])[:, 2]
    near, far = float(depth.min()), float(depth.max())
    pad = (far - near) * 0.05 or 0.01
    return max(near - pad, 1e-4), far + pad


@contextlib.contextmanager
def _restored(scene):
    render, cycles, view, layer = scene.render, scene.cycles, scene.view_settings, bpy.context.view_layer
    saved = {
        'engine': render.engine, 'percentage': render.resolution_percentage,
        'film_transparent': render.film_transparent, 'filepath': render.filepath,
        'use_compositing': render.use_compositing,
        'format': render.image_settings.file_format, 'color_mode': render.image_settings.color_mode,
        'color_depth': render.image_settings.color_depth,
        'samples': cycles.samples, 'denoise': cycles.use_denoising, 'bounces': cycles.max_bounces,
        'view_transform': view.view_transform, 'look': view.look, 'exposure': view.exposure,
        'gamma': view.gamma, 'override': layer.material_override, 'world': scene.world,
        'hidden': {o.name: o.hide_render for o in scene.objects},
    }
    try:
        yield
    finally:
        render.engine = saved['engine']
        render.resolution_percentage = saved['percentage']
        render.film_transparent = saved['film_transparent']
        render.filepath = saved['filepath']
        render.use_compositing = saved['use_compositing']
        render.image_settings.file_format = saved['format']
        render.image_settings.color_mode = saved['color_mode']
        render.image_settings.color_depth = saved['color_depth']
        cycles.samples = saved['samples']
        cycles.use_denoising = saved['denoise']
        cycles.max_bounces = saved['bounces']
        view.view_transform = saved['view_transform']
        view.look = saved['look']
        view.exposure = saved['exposure']
        view.gamma = saved['gamma']
        layer.material_override = saved['override']
        scene.world = saved['world']
        for name, hidden in saved['hidden'].items():
            obj = scene.objects.get(name)
            if obj is not None:
                obj.hide_render = hidden


def _control_settings(scene, samples):
    render = scene.render
    render.engine = 'CYCLES'
    render.film_transparent = False
    render.use_compositing = False  # no bloom on data passes
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 0
    scene.view_settings.view_transform = 'Raw'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.world = _black_world()


def _only_visible(scene, keep):
    for obj in scene.objects:
        if obj.type in _RENDERABLE:
            obj.hide_render = obj not in keep


def _with_override(scene, material, path, color_mode='RGB', color_depth='8'):
    bpy.context.view_layer.material_override = material
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = color_mode
    scene.render.image_settings.color_depth = color_depth
    return _render(scene, path)


def _black_world():
    world = bpy.data.worlds.get('CardPassWorld') or bpy.data.worlds.new('CardPassWorld')
    if world.node_tree is None:  # Blender 4.x; 5.x always has a node tree
        world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (0.0, 0.0, 0.0, 1.0)
    background.inputs['Strength'].default_value = 0.0
    return world


def _emission_material(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:  # Blender 4.x; 5.x always has a node tree
        mat.use_nodes = True
    mat.node_tree.nodes.clear()
    emit = mat.node_tree.nodes.new('ShaderNodeEmission')
    out = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return mat, emit


def _flat_material(name, value):
    mat, emit = _emission_material(name)
    emit.inputs['Color'].default_value = (value, value, value, 1.0)
    return mat


def _depth_material(near, far):
    mat, emit = _emission_material('CardPassDepth')
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    camera = nodes.new('ShaderNodeCameraData')
    remap = nodes.new('ShaderNodeMapRange')
    remap.clamp = True
    remap.inputs['From Min'].default_value = near
    remap.inputs['From Max'].default_value = far
    remap.inputs['To Min'].default_value = 1.0
    remap.inputs['To Max'].default_value = 0.0
    links.new(camera.outputs['View Z Depth'], remap.inputs['Value'])
    links.new(remap.outputs['Result'], emit.inputs['Color'])
    return mat


def _normal_material():
    mat, emit = _emission_material('CardPassNormal')
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    geometry = nodes.new('ShaderNodeNewGeometry')
    to_camera = nodes.new('ShaderNodeVectorTransform')
    to_camera.vector_type = 'NORMAL'
    to_camera.convert_from = 'WORLD'
    to_camera.convert_to = 'CAMERA'
    # Shader camera space is +X right, +Y up, +Z away from the viewer; flip Z so camera-facing
    # surfaces encode blue, the usual normal-map / ControlNet convention.
    scale = nodes.new('ShaderNodeVectorMath')
    scale.operation = 'MULTIPLY_ADD'
    scale.inputs[1].default_value = (0.5, 0.5, -0.5)
    scale.inputs[2].default_value = (0.5, 0.5, 0.5)
    links.new(geometry.outputs['Normal'], to_camera.inputs['Vector'])
    links.new(to_camera.outputs['Vector'], scale.inputs[0])
    links.new(scale.outputs['Vector'], emit.inputs['Color'])
    return mat
