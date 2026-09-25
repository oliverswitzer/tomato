import crypto from 'crypto';
import { execFileSync } from 'child_process';
import os from 'os';

const DISTINCT_ID_SALT = 'tomato-analytics-v1';

/** The machine's hardware UUID, falling back to the hostname. Never leaves the machine as-is. */
export function getMachineId(): string {
  try {
    const output = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']).toString();
    const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {}
  return os.hostname();
}

/**
 * A stable, non-reversible analytics identity for this machine. Stable across
 * reinstalls (which is what makes retention measurable) and introduces no new
 * personal data — the hardware UUID itself is never transmitted.
 */
export function anonymousDistinctId(machineId: string): string {
  return crypto
    .createHash('sha256')
    .update(`${DISTINCT_ID_SALT}:${machineId}`)
    .digest('hex')
    .slice(0, 32);
}
