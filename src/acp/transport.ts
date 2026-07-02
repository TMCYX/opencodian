import { ChildProcess } from "child_process";
import { createInterface, Interface } from "readline";

export class JsonRpcTransport {
  private proc: ChildProcess;
  private rl: Interface;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private notificationHandlers = new Map<string, (params: any) => void>();
  private closed = false;

  constructor(proc: ChildProcess) {
    this.proc = proc;
    this.rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });
    this.rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line.trim());
        if (msg.id != null && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message));
          else p.resolve(msg.result);
        } else if (msg.method && !msg.id) {
          const h = this.notificationHandlers.get(msg.method);
          h?.(msg.params);
        }
      } catch {}
    });
    proc.on("exit", () => this.dispose());
  }

  request(method: string, params?: any): Promise<any> {
    if (this.closed) throw new Error("Transport closed");
    const id = this.nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin!.write(JSON.stringify(msg) + "\n");
    });
  }

  onNotification(method: string, handler: (params: any) => void) {
    this.notificationHandlers.set(method, handler);
  }

  dispose() {
    this.closed = true;
    this.rl.close();
    for (const p of this.pending.values()) p.reject(new Error("Transport closed"));
    this.pending.clear();
  }
}
