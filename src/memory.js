// Used-memory share. MemAvailable is the honest Linux number; macOS and
// Windows have no /proc, so fall back to os.totalmem()/freemem().
import { readFileSync } from "node:fs";
import { totalmem, freemem } from "node:os";

export function memoryPercent(read = () => readFileSync("/proc/meminfo", "utf8"), os = { totalmem, freemem }) {
  try {
    const info = read();
    const total = Number(info.match(/MemTotal:\s+(\d+)/)?.[1]);
    const avail = Number(info.match(/MemAvailable:\s+(\d+)/)?.[1]);
    if (total && avail) return Math.round((1 - avail / total) * 100);
  } catch {
    /* no /proc: fall through */
  }
  try {
    const total = os.totalmem();
    const free = os.freemem();
    return total ? Math.round((1 - free / total) * 100) : null;
  } catch {
    return null;
  }
}
