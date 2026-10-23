"""Blender toolkit for Gen 9 ex / Mega ex card art (docs/card-art-gen9-ex-mega-generation-spec.md).

Import submodules explicitly; spec, brushmath and shardmath work without Blender:
    from cardart import sculpt, scene, shards, fx, passes, pose
"""

import importlib
import sys

_MODULES = ('spec', 'brushmath', 'shardmath', 'sculpt', 'scene', 'shards', 'fx', 'passes', 'pose')


def reload_all():
    """Reload every loaded submodule after editing the toolkit inside a live Blender session."""
    reloaded = []
    for name in _MODULES:
        module = sys.modules.get(f'{__name__}.{name}')
        if module is not None:
            importlib.reload(module)
            reloaded.append(name)
    return reloaded
