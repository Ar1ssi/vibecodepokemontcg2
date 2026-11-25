// A uniformly random element of a non-empty list, drawn from the seeded `rng` so a run reproduces.
export function pickRandom(list, rng) {
  if (list.length === 1) return list[0];
  return list[Math.floor(rng() * list.length) % list.length];
}
