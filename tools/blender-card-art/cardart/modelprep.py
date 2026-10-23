"""Bring a game-resolution Pokémon model up to card-render quality.

Game exports are low-poly, split along UV seams, and shaded for a toon renderer. The card look
(spec section 3) needs smooth subdivided surfaces with crisp spikes and claws, plus glossy PBR
materials. Order matters: weld_seams -> crease_sharp_edges -> bake_subdivision -> sculpt brushes ->
live_subdivision for render.
"""

import os

import bmesh
import bpy
import numpy as np


def weld_seams(obj, distance=1e-4):
    """Merge vertices duplicated along UV seams so subdivision doesn't tear the patches apart.

    UVs live on face corners and the split copies carry identical skin weights, so both survive.
    Returns (vertices removed, open edges before, open edges after).
    """
    _require_mesh(obj)
    mesh = obj.data
    before = open_edge_count(mesh)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    count = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=distance)
    removed = count - len(bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return removed, before, open_edge_count(mesh)


def open_edge_count(mesh):
    """Edges used by exactly one face (holes, seams, rims of open shells)."""
    counts = np.zeros(len(mesh.edges), dtype=np.int64)
    loops = np.empty(len(mesh.loops), dtype=np.int64)
    mesh.loops.foreach_get('edge_index', loops)
    np.add.at(counts, loops, 1)
    return int((counts == 1).sum())


def crease_sharp_edges(obj, hard=65.0, soft=45.0):
    """Crease edges by the angle between their faces: 1.0 above `hard` degrees, 0.5 above `soft`.

    Spikes, claws and armour ridges stay sharp through subdivision while curved forms smooth out.
    Open edges get full crease so shell rims keep their shape. Returns (hard count, soft count).
    """
    _require_mesh(obj)
    if not 0 < soft <= hard < 180:
        raise ValueError('need 0 < soft <= hard < 180 degrees')
    mesh = obj.data
    normals = np.empty(len(mesh.polygons) * 3)
    mesh.polygons.foreach_get('normal', normals)
    normals = normals.reshape(-1, 3)
    loop_edges = np.empty(len(mesh.loops), dtype=np.int64)
    mesh.loops.foreach_get('edge_index', loop_edges)
    loop_faces = np.repeat(np.arange(len(mesh.polygons)), [p.loop_total for p in mesh.polygons])
    order = np.argsort(loop_edges, kind='stable')
    edges_sorted, faces_sorted = loop_edges[order], loop_faces[order]
    crease = np.ones(len(mesh.edges), dtype=np.float32)
    starts = np.searchsorted(edges_sorted, np.arange(len(mesh.edges)))
    ends = np.searchsorted(edges_sorted, np.arange(len(mesh.edges)), side='right')
    two = (ends - starts) == 2
    a, b = faces_sorted[starts[two]], faces_sorted[starts[two] + 1]
    angle = np.degrees(np.arccos(np.clip((normals[a] * normals[b]).sum(1), -1.0, 1.0)))
    crease[two] = np.where(angle > hard, 1.0, np.where(angle > soft, 0.5, 0.0))
    attr = mesh.attributes.get('crease_edge') or mesh.attributes.new('crease_edge', 'FLOAT', 'EDGE')
    attr.data.foreach_set('value', crease)
    return int((crease == 1.0).sum()), int((crease == 0.5).sum())


def bake_subdivision(obj, levels=1):
    """Bake creased Catmull-Clark subdivision into the rest mesh (skin weights and materials kept),
    so the sculpt brushes have enough vertices. UVs are not smoothed: game decals stay exact."""
    _require_mesh(obj)
    if levels < 1:
        raise ValueError('levels must be at least 1')
    armatures = [m for m in obj.modifiers if m.type == 'ARMATURE']
    for mod in armatures:
        mod.show_viewport = False  # bake the rest pose, not the current pose
    sub = obj.modifiers.new('CardBakeSubdiv', 'SUBSURF')
    sub.levels = levels
    sub.use_creases = True
    sub.uv_smooth = 'NONE'
    try:
        depsgraph = bpy.context.evaluated_depsgraph_get()
        depsgraph.update()
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=True,
                                               depsgraph=depsgraph)
    finally:
        obj.modifiers.remove(sub)
        for mod in armatures:
            mod.show_viewport = True
    old = obj.data
    name = old.name
    obj.data = mesh
    if old.users == 0:
        bpy.data.meshes.remove(old)
    mesh.name = name
    for poly in mesh.polygons:
        poly.use_smooth = True
    return len(mesh.vertices)


def live_subdivision(obj, viewport=0, render=1):
    """Creased subdivision applied after the armature, so posed silhouettes render smooth."""
    _require_mesh(obj)
    sub = obj.modifiers.get('CardSubdiv') or obj.modifiers.new('CardSubdiv', 'SUBSURF')
    sub.levels = viewport
    sub.render_levels = render
    sub.use_creases = True
    sub.uv_smooth = 'NONE'
    return sub


def card_material(material, albedo, normal=None, spec_mask=None, rim_mask=None, texture_dir='',
                  saturation=1.15, value=0.92, normal_strength=1.0, rough_matte=0.5, rough_gloss=0.18,
                  coat=0.4, rim_strength=0.3, rim_color=(1.0, 1.0, 1.0)):
    """Rebuild a material as the glossy CG card look from a game texture set.

    The game's specular mask decides where the surface is glossy (rough_gloss) or matte
    (rough_matte) and how much clear coat it gets; its rim mask drives a fresnel rim glow.
    Saturation and value adjust the albedo, which game textures usually bake slightly flat.
    """
    if material is None:
        raise ValueError('material is required')
    if material.node_tree is None:  # Blender 4.x; 5.x always has a node tree
        material.use_nodes = True
    nt = material.node_tree
    nt.nodes.clear()
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    base = _image_node(nt, texture_dir, albedo, 'sRGB')
    grade = _node(nt, 'ShaderNodeHueSaturation', Saturation=saturation, Value=value)
    nt.links.new(base.outputs['Color'], grade.inputs['Color'])
    nt.links.new(grade.outputs['Color'], bsdf.inputs['Base Color'])
    if normal:
        nmap = _node(nt, 'ShaderNodeNormalMap', Strength=normal_strength)
        nt.links.new(_image_node(nt, texture_dir, normal, 'Non-Color').outputs['Color'], nmap.inputs['Color'])
        nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    if spec_mask:
        mask = _image_node(nt, texture_dir, spec_mask, 'Non-Color').outputs['Color']
        nt.links.new(_remap(nt, mask, rough_matte, rough_gloss), bsdf.inputs['Roughness'])
        nt.links.new(_remap(nt, mask, 0.0, coat), bsdf.inputs['Coat Weight'])
        nt.links.new(_remap(nt, mask, 0.4, 0.75), bsdf.inputs['Specular IOR Level'])
    else:
        bsdf.inputs['Roughness'].default_value = rough_gloss
        bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = 0.12
    if rim_mask and rim_strength > 0:
        fresnel = _node(nt, 'ShaderNodeLayerWeight', Blend=0.35)
        masked = _math(nt, 'MULTIPLY', fresnel.outputs['Fresnel'],
                       _image_node(nt, texture_dir, rim_mask, 'Non-Color').outputs['Color'])
        strength = _math(nt, 'MULTIPLY', masked, rim_strength)
        bsdf.inputs['Emission Color'].default_value = (*rim_color, 1.0)
        nt.links.new(strength, bsdf.inputs['Emission Strength'])
    return bsdf


def _require_mesh(obj):
    if obj is None or obj.type != 'MESH':
        raise ValueError('expected a mesh object')


def _image_node(nt, texture_dir, name, colorspace):
    path = os.path.join(texture_dir, name)
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    node = nt.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(path, check_existing=True)
    node.image.colorspace_settings.name = colorspace
    return node


def _node(nt, kind, **inputs):
    node = nt.nodes.new(kind)
    for key, value in inputs.items():
        node.inputs[key].default_value = value
    return node


def _remap(nt, socket, low, high):
    node = _node(nt, 'ShaderNodeMapRange')
    node.inputs['To Min'].default_value = low
    node.inputs['To Max'].default_value = high
    nt.links.new(socket, node.inputs['Value'])
    return node.outputs['Result']


def _math(nt, operation, a, b):
    node = nt.nodes.new('ShaderNodeMath')
    node.operation = operation
    for index, value in enumerate((a, b)):
        if isinstance(value, (int, float)):
            node.inputs[index].default_value = value
        else:
            nt.links.new(value, node.inputs[index])
    return node.outputs['Value']
