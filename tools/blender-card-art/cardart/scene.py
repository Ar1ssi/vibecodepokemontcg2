"""Card scene setup from the spec: render and colour presets, camera framing, lights, bloom."""

import math

import bpy
import numpy as np
from mathutils import Quaternion, Vector

from . import spec

CAMERA_NAME = 'CardCamera'
LIGHT_PREFIX = 'CardLight_'
WORLD_NAME = 'CardWorld'
COMPOSITOR_NAME = 'CardCompositor'
GUIDE_NAME = 'CardZoneGuide'

COLOR_PRESETS = {
    # AgX's default look washes saturated brights toward white; Punchy restores the card look.
    'punchy': ('AgX', 'AgX - Punchy'),
    # Standard shows emission colours exactly (use it when shard hexes must match the spec).
    'standard': ('Standard', 'None'),
}
QUALITY = {'final': (100, 256), 'preview': (40, 32)}


def setup_render(scene=None, quality='final', color='punchy'):
    """Cycles at the spec's full-card canvas (1200x1676), denoised, with a colour preset."""
    scene = scene or bpy.context.scene
    if quality not in QUALITY:
        raise ValueError(f'quality must be one of {sorted(QUALITY)}, got {quality!r}')
    if color not in COLOR_PRESETS:
        raise ValueError(f'color must be one of {sorted(COLOR_PRESETS)}, got {color!r}')
    percentage, samples = QUALITY[quality]
    render = scene.render
    render.engine = 'CYCLES'
    render.resolution_x, render.resolution_y = spec.FINAL_RESOLUTION
    render.resolution_percentage = percentage
    render.film_transparent = False
    render.image_settings.file_format = 'PNG'
    render.image_settings.color_mode = 'RGB'
    render.image_settings.color_depth = '8'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    view = scene.view_settings
    view.view_transform, view.look = COLOR_PRESETS[color]
    view.exposure = 0.0
    view.gamma = 1.0
    return scene


def frame_subject(subject, subline='standard', stage='basic', focus=None, focal=28.0,
                  azimuth=25.0, elevation=-12.0, roll=8.0, fill=0.85, scene=None, iterations=8):
    """Aim the card camera so the subject fills `fill` of the hero-zone width.

    The anchor (`focus`, a world point such as the face, or else the subject's bounding-box centre)
    lands on the hero-zone centre for this sub-line. Negative elevation is a low angle; `fill` above
    1 crops the subject at the frame edges, as many real cards do. Returns the measured framing.
    """
    scene = scene or bpy.context.scene
    points = world_points(subject)
    lo, hi = points.min(0), points.max(0)
    target = Vector((lo + hi) / 2)
    radius = float(np.linalg.norm(points - np.asarray(target), axis=1).max())
    cam_obj = _camera(scene)
    cam = cam_obj.data
    cam.type = 'PERSP'
    cam.lens = focal
    cam.sensor_fit = 'AUTO'
    cam.sensor_width = 36.0
    cam.shift_x = cam.shift_y = 0.0
    cam.clip_start = max(radius * 0.01, 0.001)
    cam.clip_end = radius * 200

    left, top, right, bottom = spec.hero_zone(subline, stage)
    hero_u, hero_v = spec.hero_center(subline, stage)
    target_width = fill * (right - left)
    aspect = spec.FINAL_RESOLUTION[0] / spec.FINAL_RESOLUTION[1]
    az, el = math.radians(azimuth), math.radians(elevation)
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    distance = radius / ((18.0 / focal) * aspect * target_width)

    for _ in range(iterations):
        cam_obj.location = target + direction * distance
        _look_at(cam_obj, target, roll)
        bpy.context.view_layer.update()
        uv = project(scene, cam_obj, points)
        width = float(uv[:, 0].max() - uv[:, 0].min())
        anchor = project(scene, cam_obj, np.asarray([focus]))[0] if focus else (uv.min(0) + uv.max(0)) / 2
        distance *= width / target_width
        # Shift is measured in the frame's larger dimension, which is the height for a card.
        cam.shift_x += (anchor[0] - hero_u) * aspect
        cam.shift_y -= anchor[1] - hero_v

    bpy.context.view_layer.update()
    uv = project(scene, cam_obj, points)
    anchor = project(scene, cam_obj, np.asarray([focus]))[0] if focus else (uv.min(0) + uv.max(0)) / 2
    return {'camera': cam_obj, 'distance': distance, 'anchor_uv': tuple(anchor),
            'hero_center_uv': (hero_u, hero_v),
            'width_of_hero': float(uv[:, 0].max() - uv[:, 0].min()) / (right - left)}


def setup_lights(subject, type_name, subline='standard', key_power=40.0, scene=None):
    """Key, rim and fill lights around the subject relative to the card camera (spec section 3).

    Rim colour is the type accent, or the two Mega shard colours for Mega ex; fill is the type
    accent. Light power scales with distance, so `key_power` behaves the same at any scene scale.
    """
    scene = scene or bpy.context.scene
    if scene.camera is None:
        raise RuntimeError('no scene camera; call frame_subject first')
    accent, _ = spec.type_colors(type_name)
    points = world_points(subject)
    target = Vector((points.min(0) + points.max(0)) / 2)
    radius = float(np.linalg.norm(points - np.asarray(target), axis=1).max())
    remove_lights(scene)

    forward = (scene.camera.location - target).normalized()
    up = Vector((0.0, 0.0, 1.0))
    side = up.cross(forward).normalized() if abs(forward.dot(up)) < 0.99 else Vector((1.0, 0.0, 0.0))
    dist = radius * 4.0
    power = key_power * dist * dist

    _area_light(scene, 'Key', target, forward + side * 0.9 + up, dist, power,
                (1.0, 0.94, 0.86), radius * 1.5)
    if subline == 'mega':
        rim_a, rim_b = (spec.hex_to_linear(c) for c in spec.MEGA_RIM_COLORS)
        _area_light(scene, 'RimA', target, -forward + side * 0.7 + up * 0.5, dist, power * 2.5, rim_a, radius * 0.8)
        _area_light(scene, 'RimB', target, -forward - side * 0.7 + up * 0.3, dist, power * 2.0, rim_b, radius * 0.8)
    else:
        _area_light(scene, 'Rim', target, -forward + side * 0.6 + up * 0.5, dist, power * 2.5,
                    spec.hex_to_linear(accent), radius * 0.8)
    _area_light(scene, 'Fill', target, forward - side * 0.5 - up * 0.6, dist, power * 0.4,
                spec.hex_to_linear(accent), radius * 2.0)
    _world(scene, accent, dark=(subline == 'mega'))
    return [o for o in scene.objects if o.name.startswith(LIGHT_PREFIX)]


def remove_lights(scene=None):
    scene = scene or bpy.context.scene
    for obj in [o for o in scene.objects if o.name.startswith(LIGHT_PREFIX)]:
        data = obj.data
        bpy.data.objects.remove(obj)
        if data is not None and data.users == 0:
            bpy.data.lights.remove(data)


def setup_bloom(scene=None, strength=0.5, threshold=0.8, size=0.6):
    """Compositor bloom (Glare node), replacing any previous card compositor."""
    scene = scene or bpy.context.scene
    if bpy.app.version < (5, 0, 0):
        raise RuntimeError('setup_bloom needs Blender 5.0+ (compositor node groups)')
    old = bpy.data.node_groups.get(COMPOSITOR_NAME)
    if old is not None:
        bpy.data.node_groups.remove(old)
    tree = bpy.data.node_groups.new(COMPOSITOR_NAME, 'CompositorNodeTree')
    layers = tree.nodes.new('CompositorNodeRLayers')
    layers.scene = scene
    glare = tree.nodes.new('CompositorNodeGlare')
    glare.inputs['Type'].default_value = 'Bloom'
    glare.inputs['Threshold'].default_value = threshold
    glare.inputs['Strength'].default_value = strength
    glare.inputs['Size'].default_value = size
    out = tree.nodes.new('NodeGroupOutput')
    tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    tree.links.new(layers.outputs['Image'], glare.inputs['Image'])
    tree.links.new(glare.outputs['Image'], out.inputs['Image'])
    scene.compositing_node_group = tree
    scene.render.use_compositing = True
    if bpy.app.background:
        # Blender defaults the compositor to GPU, which aborts on headless servers without EGL.
        scene.render.compositor_device = 'CPU'
    return tree


def add_zone_guide(subline='standard', stage='basic', scene=None, opacity=0.5):
    """Overlay the spec's frame zones on the camera view (viewport only; never rendered)."""
    scene = scene or bpy.context.scene
    cam_obj = _camera(scene)
    w, h = 300, round(300 / spec.CARD_ASPECT)
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    header = spec.header_bottom(subline, stage)
    _shade(rgba, (0, 0, 1, header), (0.9, 0.2, 0.2, 0.35))
    _shade(rgba, (0, spec.HERO_BOTTOM, 1, spec.TEXT_ZONE[0]), (0.9, 0.6, 0.1, 0.25))
    _shade(rgba, (0, spec.TEXT_ZONE[0], 1, 1), (0.2, 0.4, 0.9, 0.35))
    _outline(rgba, spec.hero_zone(subline, stage), (0.1, 1.0, 0.3, 1.0))
    if subline == 'standard' and stage == 'stage':
        _shade(rgba, (0.03, 0.08, 0.18, 0.18), (0.9, 0.2, 0.2, 0.35))
    image = bpy.data.images.get(GUIDE_NAME) or bpy.data.images.new(GUIDE_NAME, w, h, alpha=True)
    image.scale(w, h)
    image.pixels.foreach_set(rgba[::-1].ravel())  # Blender stores rows bottom-up
    image.pack()
    cam = cam_obj.data
    cam.show_background_images = True
    bg = next((b for b in cam.background_images if b.image == image), None) or cam.background_images.new()
    bg.image = image
    bg.alpha = opacity
    bg.display_depth = 'FRONT'
    bg.frame_method = 'STRETCH'
    return image


def subjects(subject):
    """Normalise a subject (one object or several, e.g. body + eyes) to a list of objects."""
    objs = list(subject) if isinstance(subject, (list, tuple, set)) else [subject]
    if not objs or any(o is None for o in objs):
        raise ValueError('subject object is required')
    return objs


def world_points(subject, limit=6000):
    """World-space vertex positions of the evaluated subject (modifiers and pose applied), subsampled."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    chunks = []
    for obj in subjects(subject):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            co = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
            mesh.vertices.foreach_get('co', co)
        finally:
            evaluated.to_mesh_clear()
        m = np.array(evaluated.matrix_world)
        chunks.append(co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3])
    co = np.concatenate(chunks)
    if len(co) == 0:
        raise ValueError('subject has no vertices')
    if len(co) > limit:
        co = co[np.linspace(0, len(co) - 1, limit).astype(int)]
    return co


def project(scene, cam_obj, points):
    """World points -> card-frame (u, v), v from the top, honouring lens shift. Perspective only."""
    frame = cam_obj.data.view_frame(scene=scene)
    xs = [v.x for v in frame]
    ys = [v.y for v in frame]
    z0 = frame[0].z
    inv = np.array(cam_obj.matrix_world.inverted())
    local = np.asarray(points, dtype=np.float64) @ inv[:3, :3].T + inv[:3, 3]
    z = np.where(local[:, 2] < -1e-9, local[:, 2], -1e-9)
    x = local[:, 0] * z0 / z
    y = local[:, 1] * z0 / z
    u = (x - min(xs)) / (max(xs) - min(xs))
    v = 1.0 - (y - min(ys)) / (max(ys) - min(ys))
    return np.stack([u, v], axis=1)


def _camera(scene):
    cam_obj = bpy.data.objects.get(CAMERA_NAME)
    if cam_obj is None:
        cam_obj = bpy.data.objects.new(CAMERA_NAME, bpy.data.cameras.new(CAMERA_NAME))
    if cam_obj.name not in scene.collection.all_objects:
        scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    return cam_obj


def _look_at(obj, target, roll_deg):
    direction = Vector(target) - obj.location
    quat = direction.to_track_quat('-Z', 'Y') @ Quaternion((0.0, 0.0, 1.0), math.radians(roll_deg))
    obj.rotation_mode = 'XYZ'
    obj.rotation_euler = quat.to_euler('XYZ')


def _area_light(scene, role, target, direction, dist, power, color, size):
    light = bpy.data.lights.new(LIGHT_PREFIX + role, 'AREA')
    light.energy = power
    light.color = color
    light.size = size
    obj = bpy.data.objects.new(LIGHT_PREFIX + role, light)
    scene.collection.objects.link(obj)
    obj.location = target + direction.normalized() * dist
    _look_at(obj, target, 0.0)
    return obj


def _world(scene, accent, dark):
    world = bpy.data.worlds.get(WORLD_NAME) or bpy.data.worlds.new(WORLD_NAME)
    if world.node_tree is None:  # Blender 4.x; 5.x always has a node tree
        world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    tint = spec.hex_to_linear(accent)
    scale = 0.015 if dark else 0.08
    background.inputs['Color'].default_value = (*[c * scale for c in tint], 1.0)
    background.inputs['Strength'].default_value = 1.0
    scene.world = world


def _shade(rgba, box, color):
    h, w = rgba.shape[:2]
    x0, y0, x1, y1 = box
    region = rgba[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
    region[:] = color


def _outline(rgba, box, color, px=2):
    h, w = rgba.shape[:2]
    x0, y0, x1, y1 = int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)
    rgba[y0:y0 + px, x0:x1] = color
    rgba[y1 - px:y1, x0:x1] = color
    rgba[y0:y1, x0:x0 + px] = color
    rgba[y0:y1, x1 - px:x1] = color
