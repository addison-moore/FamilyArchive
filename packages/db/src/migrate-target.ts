/**
 * Hosts a migration may target without asking: loopback for the host-side dev
 * workflow (docs/development/setup.md), and the compose service name from
 * inside the stack.
 */
const EXPECTED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

export interface MigrationTarget {
  /** `user@host:port/database`. Never includes the password. */
  label: string;
  /** False for anything that is not an expected local/compose host. */
  expected: boolean;
}

/**
 * Summarise DATABASE_URL for display before migrations run.
 *
 * The password is deliberately dropped: this string is printed to a terminal
 * and may end up in CI logs or a pasted bug report.
 */
export function describeTarget(databaseUrl: string): MigrationTarget {
  try {
    const url = new URL(databaseUrl);
    const database = url.pathname.replace(/^\/+/, "") || "(default)";
    const user = url.username || "(default user)";
    const port = url.port || "5432";
    return {
      label: `${user}@${url.hostname}:${port}/${database}`,
      expected: EXPECTED_HOSTS.has(url.hostname),
    };
  } catch {
    // An unparseable URL is not something to guess at — let the driver report
    // it, but do not claim it is a known-safe target.
    return { label: "(unparseable DATABASE_URL)", expected: false };
  }
}
