// Building the command string agy should run. Kept separate and pure so the
// Windows/POSIX difference (quoting, .cmd shims) has a test.
const isWin = (platform) => platform === "win32";

export const quote = (p, platform = process.platform) =>
  isWin(platform) ? `"${p}"` : `'${p.replace(/'/g, `'\\''`)}'`;

/**
 * Prefer a PATH-visible install (survives upgrades); otherwise run the script
 * through the current node binary. Windows paths usually contain spaces, so
 * both halves are quoted there.
 */
export function buildCommand({ platform = process.platform, onPath = null, execPath, scriptPath }) {
  if (onPath) return isWin(platform) ? `"${onPath}"` : onPath;
  return isWin(platform)
    ? `"${execPath}" "${scriptPath}"`
    : `${execPath} ${scriptPath}`;
}
