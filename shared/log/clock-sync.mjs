// Server clock offset from the lowest-RTT ping among the last `keep` samples.
export function createClockSync({ keep = 8 } = {}) {
  const samples = [];

  function best() {
    let pick = null;
    for (const s of samples) if (!pick || s.rtt <= pick.rtt) pick = s;
    return pick;
  }

  return {
    sample({ t0, t1, serverT } = {}) {
      if (![t0, t1, serverT].every(Number.isFinite) || t1 < t0) return;
      samples.push({ rtt: t1 - t0, offset: serverT - (t0 + t1) / 2 });
      if (samples.length > keep) samples.shift();
    },
    offset: () => best()?.offset ?? 0,
    rtt: () => best()?.rtt ?? 0,
  };
}
