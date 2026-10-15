// Design 069: the coin disc from TCG Live's coin_model.obj. Each distinct position/uv/normal corner
// becomes one vertex, so the whole disc draws from one index buffer. Each `g` group is a submesh
// (coin_model_0 is the back face, coin_model_1 the front), so a renderer can give each its material.

/** One face corner `v/vt/vn` (1-based, uv and normal optional) as 0-based indices. */
function parseCorner(text) {
  const [position, uv, normal] = text.split('/');
  const indices = [position, uv, normal].map((field) => (field ? Number(field) - 1 : undefined));
  if (!Number.isInteger(indices[0]) || indices[0] < 0 || indices[1] === undefined || indices[2] === undefined) {
    throw new Error(`coin mesh: face corner "${text}" needs position, uv and normal`);
  }
  return indices;
}

/**
 * `{positions:[[x,y,z]], normals:[[x,y,z]], uvs:[[u,v]], indices:number[], submeshes:[{name,start,count}]}`.
 * Polygons are fan-triangulated; the source's own vertex order is not kept.
 */
export function parseCoinObj(text) {
  const sourcePositions = [];
  const sourceUvs = [];
  const sourceNormals = [];
  const vertexByCorner = new Map();
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const groups = [];

  const vertexFor = (corner) => {
    const key = corner.join('/');
    if (!vertexByCorner.has(key)) {
      const [p, t, n] = corner;
      if (!sourcePositions[p]) throw new Error(`coin mesh: position ${p + 1} is not defined`);
      if (!sourceUvs[t]) throw new Error(`coin mesh: uv ${t + 1} is not defined`);
      if (!sourceNormals[n]) throw new Error(`coin mesh: normal ${n + 1} is not defined`);
      vertexByCorner.set(key, positions.length);
      positions.push(sourcePositions[p]);
      uvs.push(sourceUvs[t]);
      normals.push(sourceNormals[n]);
    }
    return vertexByCorner.get(key);
  };

  for (const line of text.split(/\r?\n/)) {
    const [kind, ...fields] = line.trim().split(/\s+/);
    if (kind === 'v') sourcePositions.push(fields.slice(0, 3).map(Number));
    else if (kind === 'vt') sourceUvs.push(fields.slice(0, 2).map(Number));
    else if (kind === 'vn') sourceNormals.push(fields.slice(0, 3).map(Number));
    else if (kind === 'g') groups.push({ name: fields.join(' '), start: indices.length });
    else if (kind === 'f') {
      if (fields.length < 3) throw new Error(`coin mesh: face "${line}" has fewer than three corners`);
      const corners = fields.map((field) => vertexFor(parseCorner(field)));
      for (let index = 1; index < corners.length - 1; index += 1) {
        indices.push(corners[0], corners[index], corners[index + 1]);
      }
    }
  }

  const submeshes = groups
    .map((group, index) => ({
      name: group.name,
      start: group.start,
      count: (groups[index + 1]?.start ?? indices.length) - group.start,
    }))
    .filter((submesh) => submesh.count > 0);
  if (submeshes.length === 0) throw new Error('coin mesh: no faces');
  return { positions, normals, uvs, indices, submeshes };
}

/** The flat arrays a stage needs: p (xyz), n (xyz), uv (uv), i; numbers rounded to 5 places. */
export function packCoinMesh(mesh) {
  const flatten = (rows) => rows.flat().map((value) => Number(value.toFixed(5)));
  return {
    p: flatten(mesh.positions),
    n: flatten(mesh.normals),
    uv: flatten(mesh.uvs),
    i: mesh.indices,
    submeshes: mesh.submeshes,
  };
}
