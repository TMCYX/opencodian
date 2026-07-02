import { ChildProcess } from "child_process";
import { JsonRpcTransport } from "./transport";
import { spawnOpencode, shutdownProcess } from "./subprocess";

export type AcpMessageHandler = (text: string) => void;
export type AcpStatusHandler = (status: string, data?: any) => void;

export interface ConfigOptionValue {
  value: string;
  name: string;
  description?: string;
}

export interface ConfigOption {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type: string;
  currentValue: string;
  options: ConfigOptionValue[];
}

export class AcpConnection {
  private transport: JsonRpcTransport | null = null;
  private proc: ChildProcess | null = null;
  private sessionId: string | null = null;
  private onAssistantText: AcpMessageHandler | null = null;
  private onStatus: AcpStatusHandler | null = null;
  private _configOptions: ConfigOption[] = [];
  private _onConfigOptionsChanged: ((options: ConfigOption[]) => void) | null = null;

  set onText(h: AcpMessageHandler) { this.onAssistantText = h; }
  set onStatusChange(h: AcpStatusHandler) { this.onStatus = h; }
  set onConfigOptionsChanged(h: (options: ConfigOption[]) => void) { this._onConfigOptionsChanged = h; }

  get configOptions(): ConfigOption[] {
    return this._configOptions;
  }

  async start(binPath: string, cwd: string, extraArgs: string[]): Promise<void> {
    this.proc = spawnOpencode(binPath, cwd, extraArgs);
    this.transport = new JsonRpcTransport(this.proc);

    this.transport.onNotification("session/update", (params: any) => {
      const update = params.update || params;
      if (!update) return;

      if (update.sessionUpdate === "config_option_update" && update.configOptions) {
        this._configOptions = update.configOptions;
        this._onConfigOptionsChanged?.(this._configOptions);
      }

      if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") {
        this.onAssistantText?.(update.content.text);
      }

      if (update.sessionUpdate === "usage_update") {
        this.onStatus?.("turn_done");
      }

      if (update.type === "message" && update.message?.role === "assistant") {
        const blocks = update.message.content || [];
        for (const block of blocks) {
          if (block.type === "text" && block.text) {
            this.onAssistantText?.(block.text);
          }
        }
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
    this._configOptions = session?.configOptions || [];
  }

  async setConfigOption(configId: string, value: string): Promise<ConfigOption[]> {
    if (!this.transport || !this.sessionId) throw new Error("Not connected");
    const result = await this.transport.request("session/set_config_option", {
      sessionId: this.sessionId,
      configId,
      value,
    });
    if (result?.configOptions) {
      this._configOptions = result.configOptions;
      this._onConfigOptionsChanged?.(this._configOptions);
    }
    return this._configOptions;
  }

  async sendPrompt(prompt: string): Promise<void> {
    if (!this.transport || !this.sessionId) throw new Error("Not connected");

    const msg = {
      sessionId: this.sessionId,
      prompt: [{ type: "text", text: prompt }],
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
    this._configOptions = [];
  }

  get isConnected(): boolean {
    return this.proc !== null && this.proc.exitCode === null;
  }
}
