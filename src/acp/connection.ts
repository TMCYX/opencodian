import { ChildProcess } from "child_process";
import { JsonRpcTransport } from "./transport";
import { spawnOpencode, shutdownProcess } from "./subprocess";

export type AcpMessageHandler = (text: string) => void;
export type AcpStatusHandler = (status: string, data?: any) => void;

export interface AcpCapabilities {
  fs?: boolean;
  terminal?: boolean;
  auth?: boolean;
  experimental?: Record<string, boolean>;
}

export class AcpConnection {
  private transport: JsonRpcTransport | null = null;
  private proc: ChildProcess | null = null;
  private sessionId: string | null = null;
  private serverCapabilities: AcpCapabilities = {};
  private onAssistantText: AcpMessageHandler | null = null;
  private onStatus: AcpStatusHandler | null = null;

  set onText(h: AcpMessageHandler) { this.onAssistantText = h; }
  set onStatusChange(h: AcpStatusHandler) { this.onStatus = h; }

  async start(binPath: string, cwd: string, extraArgs: string[]): Promise<void> {
    this.proc = spawnOpencode(binPath, cwd, extraArgs);
    this.transport = new JsonRpcTransport(this.proc);

    this.transport.onNotification("session/update", (params) => {
      if (params.type === "message" && params.message?.role === "assistant") {
        const blocks = params.message.content || [];
        for (const block of blocks) {
          if (block.type === "text" && block.text) {
            this.onAssistantText?.(block.text);
          }
        }
      }
      if (params.type === "status") {
        this.onStatus?.(params.status, params);
      }
      if (params.type === "turn" && params.turn?.status === "done") {
        this.onStatus?.("turn_done");
      }
    });

    const result = await this.transport.request("initialize", {
      protocolVersion: "0.1.0",
      capabilities: {},
      clientInfo: { name: "opencodian", version: "1.0.0" },
    });
    this.serverCapabilities = result?.capabilities || {};

    const session = await this.transport.request("newSession", {});
    this.sessionId = session?.sessionId || session?.id || null;
  }

  async sendPrompt(prompt: string): Promise<void> {
    if (!this.transport || !this.sessionId) throw new Error("Not connected");

    const promptMsg = {
      sessionId: this.sessionId,
      prompt: {
        blocks: [{ type: "text" as const, content: prompt }],
      },
    };

    await this.transport.request("prompt", promptMsg);
  }

  async cancel(): Promise<void> {
    if (!this.transport || !this.sessionId) return;
    try { await this.transport.request("cancel", { sessionId: this.sessionId }); } catch {}
  }

  async stop(): Promise<void> {
    try { await this.cancel(); } catch {}
    this.transport?.dispose();
    if (this.proc) await shutdownProcess(this.proc);
    this.proc = null;
    this.transport = null;
    this.sessionId = null;
  }

  get isConnected(): boolean {
    return this.proc !== null && this.proc.exitCode === null;
  }
}
