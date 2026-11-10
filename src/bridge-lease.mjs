export function createBridgeLease({ now = () => performance.now() } = {}) {
  let ownerId = null;
  let lastSeenAtMs = null;
  let leaseMs = 10000;
  const inspect = () => ({
    required: ownerId !== null, ownerId, lastSeenAtMs, leaseMs,
    connected: ownerId === null || now() - lastSeenAtMs <= leaseMs,
  });
  return {
    inspect,
    claim(candidate, duration = 10000) {
      if (typeof candidate !== 'string' || !candidate || candidate.length > 128 || !Number.isFinite(duration) || duration < 3000 || duration > 60000) return false;
      if (ownerId !== null && ownerId !== candidate && inspect().connected) return false;
      ownerId = candidate; leaseMs = duration; lastSeenAtMs = now();
      return true;
    },
    renew(candidate) {
      if (ownerId === null || candidate !== ownerId) return false;
      lastSeenAtMs = now(); return true;
    },
    accepts: candidate => ownerId === null || candidate === ownerId,
  };
}
