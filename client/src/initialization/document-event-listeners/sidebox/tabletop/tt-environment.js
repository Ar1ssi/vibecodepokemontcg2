import {
  BackSide,
  BoxGeometry,
  Color,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Scene,
} from 'three';

/**
 * The room the tabletop reflects (design 073): a dim study rather than three's bright white
 * RoomEnvironment, so glossy things show distinct highlights against dark surroundings — the
 * contrast holo foil and shrink-wrap need to flash when they tilt. A ceiling softbox overhead, a
 * window-like panel at the front left (where the key light comes from), a cool strip behind on
 * the right, warm bounce off the desk, and dark walls. Units are arbitrary: a PMREM only keeps
 * directions. Rendered once through `PMREMGenerator.fromScene`.
 */

const emissive = (intensity, color = 0xffffff) =>
  new MeshLambertMaterial({ color: 0x000000, emissive: new Color(color), emissiveIntensity: intensity });

export function createStudioEnvironment() {
  const scene = new Scene();
  const box = new BoxGeometry(1, 1, 1);
  const plane = new PlaneGeometry(1, 1);

  const room = new Mesh(box, new MeshStandardMaterial({ color: 0x2b2722, roughness: 1, side: BackSide }));
  room.scale.set(40, 22, 40);
  room.position.set(0, 8, 0);
  scene.add(room);
  const glow = new PointLight(0xfff1e0, 260, 60, 2);
  glow.position.set(0, 14, 4);
  scene.add(glow);

  const place = (material, position, scale, rotation = [0, 0, 0]) => {
    const mesh = new Mesh(plane, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rotation);
    scene.add(mesh);
    return mesh;
  };
  // Ceiling softbox, facing down.
  place(emissive(6, 0xfff4e6), [0, 18.5, 2], [12, 8, 1], [Math.PI / 2, 0, 0]);
  // The window: front left, facing the desk.
  place(emissive(4, 0xfff8f0), [-17, 9, 9], [10, 7, 1], [0, Math.PI / 2.6, 0]);
  // A cool strip light behind on the right.
  place(emissive(3, 0xd9e6ff), [15, 8, -15], [2.2, 9, 1], [0, -Math.PI / 4, 0]);
  // A dim lamp behind the viewer, so things facing the eye still catch a little light.
  place(emissive(1.2, 0xfff0dc), [3, 7, 19], [6, 4, 1], [0, Math.PI, 0]);
  // Warm bounce off the wooden desk.
  place(emissive(0.35, 0x8a5a36), [0, -2.9, 0], [38, 38, 1], [-Math.PI / 2, 0, 0]);

  return {
    scene,
    dispose: () => {
      scene.traverse((node) => {
        if (node.isMesh) node.material.dispose();
      });
      box.dispose();
      plane.dispose();
    },
  };
}
