// Design 071: pure helpers for the TCG Live deck box import — names, the catalog file, and the
// deck customization scene's poses converted to three's right-handed space.

/** TCG Live's own default box (`DB_PC_Pokeballs`) is not in the extract; this plain Poké Ball box is. */
export const DEFAULT_BOX_ID = 'db_pokeball_tcgl-default';

const SLOTS = ['box', 'sleeve', 'coin'];
const POSE_NODES = { box: 'Deckbox', sleeve: 'CardSleeve', coin: 'Coin' };
const IDENTITY_Q = [0, 0, 0, 1];
const UNIT_SCALE = [1, 1, 1];

/** loc text is TextMeshPro rich text; the extract also lost one dash to U+FFFD. */
export function cleanBoxName(text) {
  return String(text ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/�/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `db_151_sv3-5_etb` → `151 sv3-5 etb` — shown only when the game has no name for a box. */
export function humanizeId(id) {
  return String(id)
    .replace(/^db_/, '')
    .replace(/_/g, ' ')
    .trim();
}

/**
 * @param {{ ids: string[], names: Record<string, string> }} input lowercase box ids, loc_en by lowercase key
 * @returns {{ default: string, boxes: { id: string, name: string, atlas: string, thumb: string }[] }}
 */
export function buildBoxCatalog({ ids, names }) {
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
  if (unique.length === 0) throw new Error('deck box catalog: no boxes');
  if (!unique.includes(DEFAULT_BOX_ID)) throw new Error(`deck box catalog: default box ${DEFAULT_BOX_ID} is missing`);
  const boxes = unique.map((id) => ({
    id,
    name: cleanBoxName(names[id]) || humanizeId(id),
    atlas: `atlases/${id}.webp`,
    thumb: `thumbs/${id}.webp`,
  }));
  boxes.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id));
  return { default: DEFAULT_BOX_ID, boxes };
}

const withDefault = (value, fallback) => (Array.isArray(value) ? value : fallback);

/**
 * A Unity local transform in three's space. Unity is left-handed; the stage mirrors z, so positions
 * negate z and quaternions negate x and y (the same mapping the game's web port uses).
 */
export function toThreePose(node) {
  const [px, py, pz] = withDefault(node.lp, [0, 0, 0]);
  const [qx, qy, qz, qw] = withDefault(node.lq, IDENTITY_Q);
  return {
    p: [px, py, -pz],
    q: [-qx, -qy, qz, qw],
    s: [...withDefault(node.ls, UNIT_SCALE)],
  };
}

const findNode = (node, name) => {
  if (node.n === name) return node;
  for (const child of node.ch ?? []) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return null;
};

const requireNode = (root, name) => {
  const node = findNode(root, name);
  if (!node) throw new Error(`deck customization scene has no node "${name}"`);
  return node;
};

const childNamed = (node, name) => {
  const child = (node.ch ?? []).find((entry) => entry.n === name);
  if (!child) throw new Error(`deck customization scene: "${node.n}" has no child "${name}"`);
  return child;
};

/** `main` texture key of material `index` of the node's renderer. */
const materialTextureKey = (node, index) => {
  const key = node.c?.mr?.mats?.[index]?.main;
  if (!key) throw new Error(`node "${node.n}" material ${index} has no main texture`);
  return key;
};

/** textures.json keys for the box interior (submesh 1) and each slot's floor shadow. */
export function sceneTextureKeys(level4) {
  const root = level4.roots.map((entry) => findNode(entry, 'CustomizationObjects')).find(Boolean);
  if (!root) throw new Error('deck customization scene has no CustomizationObjects');
  return {
    interior: materialTextureKey(requireNode(root, 'Sleeve_Deck_Box'), 1),
    'shadow-box': materialTextureKey(childNamed(requireNode(root, 'Deck_Box'), 'Shadow'), 0),
    'shadow-card': materialTextureKey(childNamed(requireNode(root, 'CardSleeve'), 'Shadow'), 0),
    'shadow-coin': materialTextureKey(childNamed(requireNode(root, 'SM_Coin'), 'Shadow'), 0),
  };
}

/** The shadow plane's tint, `_Color` of its first material. */
const shadowTint = (node) => {
  const color = node.c?.mr?.mats?.[0]?.cols?._Color;
  if (!Array.isArray(color) || color.length !== 4) throw new Error(`shadow "${node.n}" has no _Color`);
  return color;
};

/**
 * `scene.json` from level4: the camera, the three slots' grouped and focused poses, and each slot's
 * mesh and shadow local transforms (the coin also its pivot: the disc sits at pivot × mesh).
 * Everything is already in three's space.
 */
export function extractScene(level4) {
  const root = level4.roots.map((entry) => findNode(entry, 'RendertoTextureCamera')).find(Boolean);
  if (!root) throw new Error('deck customization scene has no RendertoTextureCamera');
  const camera = root.c?.cam;
  if (!camera || !Number.isFinite(camera.fov)) throw new Error('RendertoTextureCamera has no camera fov');
  const objects = childNamed(root, 'CustomizationObjects');
  const holder = toThreePose(objects);

  const slots = {};
  for (const slot of SLOTS) {
    slots[slot] = {
      grouped: toThreePose(childNamed(root, `${POSE_NODES[slot]}_Grouped`)),
      focused: toThreePose(childNamed(root, `${POSE_NODES[slot]}_Focused`)),
    };
  }

  const boxMesh = requireNode(objects, 'Sleeve_Deck_Box');
  const cardMesh = requireNode(objects, 'cardModel');
  const boxShadow = childNamed(requireNode(objects, 'Deck_Box'), 'Shadow');
  const cardShadow = childNamed(requireNode(objects, 'CardSleeve'), 'Shadow');
  const coinShadow = childNamed(requireNode(objects, 'SM_Coin'), 'Shadow');
  slots.box.mesh = toThreePose(boxMesh);
  slots.box.shadow = { ...toThreePose(boxShadow), tint: shadowTint(boxShadow) };
  slots.sleeve.mesh = toThreePose(cardMesh);
  slots.sleeve.shadow = { ...toThreePose(cardShadow), tint: shadowTint(cardShadow) };
  slots.coin.shadow = { ...toThreePose(coinShadow), tint: shadowTint(coinShadow) };
  const coinPivot = childNamed(requireNode(objects, 'SM_Coin'), 'SM_Coin');
  slots.coin.pivot = toThreePose(coinPivot);
  slots.coin.mesh = toThreePose(childNamed(coinPivot, 'Coin_model'));

  return {
    fov: camera.fov,
    distance: objects.lp[2],
    holder: { q: holder.q },
    slots,
  };
}

/** A packed mesh (`p`, `n`, `uv`, `i`, `submeshes`) with z mirrored; index order already faces outward after the mirror. */
export function mirrorMeshZ(packed) {
  const mirror = (values) => values.map((value, index) => (index % 3 === 2 ? -value : value));
  return { ...packed, p: mirror(packed.p), n: mirror(packed.n) };
}
