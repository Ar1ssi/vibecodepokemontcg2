"""Pose an armature by bone rotations (degrees), e.g. into a signature attack's key pose."""

import math

import bpy


def pose(armature, rotations, mode='XYZ'):
    """Set {bone name: (x, y, z) degrees} on an armature object's pose bones; returns bones set."""
    if armature is None or armature.type != 'ARMATURE':
        raise ValueError('pose needs an armature object')
    missing = [name for name in rotations if name not in armature.pose.bones]
    if missing:
        raise KeyError(f'bones not found on {armature.name}: {missing}')
    for name, degrees in rotations.items():
        bone = armature.pose.bones[name]
        bone.rotation_mode = mode
        bone.rotation_euler = [math.radians(d) for d in degrees]
    bpy.context.view_layer.update()
    return list(rotations)


def reset(armature):
    """Clear every pose bone back to its rest transform."""
    if armature is None or armature.type != 'ARMATURE':
        raise ValueError('reset needs an armature object')
    for bone in armature.pose.bones:
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()


def bone_names(armature):
    if armature is None or armature.type != 'ARMATURE':
        raise ValueError('bone_names needs an armature object')
    return [b.name for b in armature.pose.bones]
