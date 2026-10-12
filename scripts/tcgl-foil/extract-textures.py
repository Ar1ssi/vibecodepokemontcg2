# Design 069: decodes TCG Live card textures (front, etch, white plate, cold foil) from the card bundles and the
# MAT_Cards3D_* material textures from the shaders bundle, and stores them as lossless WebP at native size.
# The DXT5 data inside the bundles is the quality ceiling; nothing here resizes or uses a lossy step.
#   python -P extract-textures.py <job.json> <result.json>
# Driven by import-foil.mjs, which writes the job and reads the result.
import glob
import json
import os
import sys
import traceback
from multiprocessing import Pool

import UnityPy
from PIL import Image

WEBP_OPTIONS = {'lossless': True, 'exact': True, 'quality': 100, 'method': 6}
WRAP_MODES = ['repeat', 'clamp', 'mirror', 'mirror_once']
FILTER_MODES = ['point', 'bilinear', 'trilinear']


def same_size_file(path, width, height):
    if not os.path.exists(path):
        return False
    try:
        with Image.open(path) as img:
            return img.size == (width, height)
    except Exception:
        return False


def save_lossless(texture, path):
    img = texture.image
    if img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGBA')
    tmp = path + '.tmp'
    img.save(tmp, 'WEBP', **WEBP_OPTIONS)
    os.replace(tmp, path)


def extract_card(task):
    """One card bundle: writes each requested texture. Returns (bundle, present, missing, error, bytes)."""
    bundle, out_dir, names, force = task['bundle'], task['outDir'], task['textures'], task['force']
    present, missing, written_bytes = [], [], 0
    try:
        env = UnityPy.load(task['path'])
        textures = {}
        for obj in env.objects:
            if obj.type.name == 'Texture2D':
                tex = obj.read()
                textures[tex.m_Name] = tex
        os.makedirs(out_dir, exist_ok=True)
        for name in names:
            tex = textures.get(name)
            if tex is None:
                missing.append(name)
                continue
            path = os.path.join(out_dir, name + '.webp')
            if force or not same_size_file(path, tex.m_Width, tex.m_Height):
                save_lossless(tex, path)
                written_bytes += os.path.getsize(path)
            present.append(name)
        return bundle, present, missing, None, written_bytes
    except Exception as exc:
        return bundle, present, missing, '%s: %s' % (type(exc).__name__, exc), written_bytes


def texture_settings(tex):
    ts = getattr(tex, 'm_TextureSettings', None)
    if ts is None:
        return {'wrapU': 'repeat', 'wrapV': 'repeat', 'filter': 'bilinear'}
    return {
        'wrapU': WRAP_MODES[getattr(ts, 'm_WrapU', 0) or 0],
        'wrapV': WRAP_MODES[getattr(ts, 'm_WrapV', 0) or 0],
        'filter': FILTER_MODES[getattr(ts, 'm_FilterMode', 1) or 0],
    }


def export_materials(job):
    """MAT_Cards3D_* materials (shader, textures, floats, colours) and their textures, as export_foil.py does."""
    data = glob.glob(os.path.join(job['shadersBundle'], '*', '__data'))
    if not data:
        raise FileNotFoundError('no shadersbundle under ' + job['shadersBundle'])
    env = UnityPy.load(data[0])
    textures, shader_names = {}, {}
    for obj in env.objects:
        if obj.type.name == 'Texture2D':
            textures[obj.path_id] = obj
    for obj in env.objects:
        if obj.type.name != 'Shader':
            continue
        name = obj.read_typetree()['m_ParsedForm']['m_Name']
        if name.startswith('TPCi/Cards3D'):
            shader_names[obj.path_id] = name
    materials, used = {}, set()
    for obj in env.objects:
        if obj.type.name != 'Material':
            continue
        tree = obj.read_typetree()
        shader = shader_names.get(tree['m_Shader']['m_PathID'])
        if not shader:
            continue
        saved = tree['m_SavedProperties']
        tex_envs = {}
        for key, value in saved['m_TexEnvs']:
            pid = value['m_Texture']['m_PathID']
            name = None
            if pid and pid in textures:
                name = textures[pid].read().m_Name
                used.add(pid)
            tex_envs[key] = {
                'name': name,
                'scale': [value['m_Scale']['x'], value['m_Scale']['y']],
                'offset': [value['m_Offset']['x'], value['m_Offset']['y']],
            }
        materials[tree['m_Name']] = {
            'shader': shader,
            'tex': tex_envs,
            'floats': dict(saved['m_Floats']),
            'colors': {k: [c['r'], c['g'], c['b'], c['a']] for k, c in saved['m_Colors']},
        }
    # cast-and-cure pattern textures: card manifests name them (`_cc`); the game loads them from this bundle
    for pid, obj in textures.items():
        if obj.read().m_Name.startswith('TEX_'):
            used.add(pid)
    os.makedirs(job['outTex'], exist_ok=True)
    meta, written_bytes = {}, 0
    for pid in sorted(used):
        tex = textures[pid].read()
        path = os.path.join(job['outTex'], tex.m_Name + '.webp')
        if job['force'] or not same_size_file(path, tex.m_Width, tex.m_Height):
            save_lossless(tex, path)
            written_bytes += os.path.getsize(path)
        meta[tex.m_Name] = {
            'url': job['texUrlPrefix'] + tex.m_Name + '.webp',
            **texture_settings(tex),
            'srgb': bool(getattr(tex, 'm_ColorSpace', 1)),
        }
    ordered = {
        'materials': {k: materials[k] for k in sorted(materials)},
        'textures': {k: meta[k] for k in sorted(meta)},
    }
    with open(job['materialsOut'], 'w', encoding='utf8', newline='\n') as fh:
        json.dump(ordered, fh, indent=1, sort_keys=False)
        fh.write('\n')
    return len(materials), len(meta), written_bytes


def main():
    job_path, result_path = sys.argv[1], sys.argv[2]
    with open(job_path, encoding='utf8') as fh:
        job = json.load(fh)
    result = {'present': {}, 'missing': [], 'failed': [], 'bytes': 0, 'materials': 0, 'textures': 0}
    if job.get('materialsOut'):
        try:
            result['materials'], result['textures'], tex_bytes = export_materials(job)
            result['bytes'] += tex_bytes
        except Exception:
            result['failed'].append({'bundle': 'shadersbundle', 'error': traceback.format_exc(limit=3)})
    tasks = [
        {
            'bundle': card['bundle'],
            'path': os.path.join(job['bundlesDir'], card['bundle']),
            'outDir': os.path.join(job['outCards'], card['set']),
            'textures': card['textures'],
            'force': job['force'],
        }
        for card in job['cards']
    ]
    done = 0
    with Pool(max(1, int(job.get('workers') or 1))) as pool:
        for bundle, present, missing, error, written in pool.imap_unordered(extract_card, tasks, chunksize=2):
            result['present'][bundle] = present
            result['missing'] += [{'bundle': bundle, 'texture': name} for name in missing]
            if error:
                result['failed'].append({'bundle': bundle, 'error': error})
            result['bytes'] += written
            done += 1
            if done % 250 == 0 or done == len(tasks):
                print('textures: %d/%d bundles, %.1f MB written' % (done, len(tasks), result['bytes'] / 1e6), flush=True)
    with open(result_path, 'w', encoding='utf8') as fh:
        json.dump(result, fh)


if __name__ == '__main__':
    main()
