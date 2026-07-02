import { ChildProcess } from "child_process";
import { JsonRpcTransport } from "./transport";
import { spawnOpencode, shutdownProcess } from "./subprocess";

export type AcpMessageHandler = (text: string) => void;
export type AcpStatusHandler = (status: string, data?: any) => void;

export class AcpConnection {
  private transport: JsonRpcTransport | null = null;
  private proc: ChildProcess | null = null;
  private sessionId: string | null = null;
  private onAssistantText: AcpMessageHandler | null = null;
  private onStatus: AcpStatusHandler | null = null;

  set onText(h: AcpMessageHandler) { this.onAssistantText = h; }
  set onStatusChange(h: AcpStatusHandler) { this.onStatus = h; }

  async start(binPath: string, cwd: string, extraArgs: string[]): Promise<void> {
    this.proc = spawnOpencode(binPath, cwd, extraArgs);
    this.transport = new JsonRpcTransport(this.proc);

    this.transport.onNotification("session/update", (params: any) => {
      // text content blocks in assistant messages
      if (params.update?.type === "message" && params.update.message?.role === "assistant") {
        const blocks = params.update.message.content || [];
        for (const block of blocks) {
          if (block.type === "text" && block.text) {
            this.onAssistantText?.(block.text);
          }
        }
      }
      // flattened message format
      if (params.message?.role === "assistant") {
        const blocks = params.message.content || [];
        for (const block of blocks) {
          if (block.type === "text" && block.text) {
            this.onAssistantText?.(block.text);
          }
        }
      }
      // turn completion
      const update = params.update || params;
      if (update.type === "turn" && update.turn?.status === "done") {
        this.onStatus?.("turn_done");
      }
    });

    const result = await this.transport.request("initialize", {
      protocolVersion: 1,
      capabilities: {},
      clientInfo: { name: "opencodian", version: "1.0.0" },
    });
    if (!result) throw new Error("initialize failed");

    const session = await this.transport.request("session/new", { cwd, mcpServers: [] });
    this.sessionId = session?.sessionId || session?.id || null;
    if (!this.sessionId) throw new Error("session/new: no sessionId returned");
  }

  async sendPrompt(prompt: string): Promise<void> {
    if (!this.transport || !this.sessionId) throw new Error("Not connected");

    const msg = {
      sessionId: this.sessionId,
      prompt: [{ type: "text", content: prompt }],
    };

    await this.transport.request("session/prompt", msg);
  }

  async cancel(): Promise<void> {
    if (!this.transport || !this.sessionId) return;
    try { await this.transport.request("session/cancel", { sessionId: this.sessionId }); } catch {}
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
