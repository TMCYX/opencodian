import { spawn, ChildProcess } from "child_process";

export function spawnOpencode(binPath: string, cwd: string, extraArgs: string[]): ChildProcess {
  const args = ["acp", "--cwd", cwd, ...extraArgs];
  const proc = spawn(binPath, args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  return proc;
}

export function shutdownProcess(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!proc || !proc.pid) { resolve(); return; }

    const killTimeout = setTimeout(() => {
      try { process.kill(-proc.pid!, "SIGKILL"); } catch {}
      resolve();
    }, 3000);

    proc.on("exit", () => {
      clearTimeout(killTimeout);
      resolve();
    });

    try { process.kill(-proc.pid!, "SIGTERM"); } catch { clearTimeout(killTimeout); resolve(); }
  });
}
