import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { OpencodianSettings, DEFAULT_SETTINGS, OpencodianSettingTab } from "./settings";
import { AcpConnection } from "./acp/connection";

const VIEW_TYPE_OPENCODIAN = "opencodian-chat-view";

export default class OpencodianPlugin extends Plugin {
  settings: OpencodianSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new OpencodianSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_OPENCODIAN, (leaf) => new OpencodianChatView(leaf, this));
    this.addRibbonIcon("message-square", "Open Opencodian", () => this.activateView());
    this.addCommand({ id: "open-opencodian", name: "Open Opencodian chat", callback: () => this.activateView() });
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN).first();
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: VIEW_TYPE_OPENCODIAN, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getVaultPath(): string {
    return (this.app.vault.adapter as any).getBasePath?.() || "";
  }
}

class OpencodianChatView extends ItemView {
  plugin: OpencodianPlugin;
  conn: AcpConnection;
  messageContainerEl: HTMLElement;
  inputEl: HTMLTextAreaElement;
  sendBtnEl: HTMLElement;
  statusEl: HTMLElement;
  currentAssistantContent: string = "";
  currentAssistantEl: HTMLElement | null = null;
  contentEl: HTMLElement | null = null;
  connected = false;

  constructor(leaf: WorkspaceLeaf, plugin: OpencodianPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.conn = new AcpConnection();
  }

  getViewType(): string { return VIEW_TYPE_OPENCODIAN; }
  getDisplayText(): string { return "Opencodian"; }
  getIcon(): string { return "message-square"; }

  async onOpen() {
    this.setupDOM();
    this.updateStatus("idle");
    try { await this.connectToOpencode(); } catch {}
  }

  async onClose() {
    await this.conn.stop();
  }

  async connectToOpencode() {
    const vaultPath = this.plugin.getVaultPath();
    if (!vaultPath) return;

    this.updateStatus("connecting...");
    try {
      const extra = this.plugin.settings.extraArgs
        ? this.plugin.settings.extraArgs.split(/\s+/).filter(Boolean)
        : [];

      this.conn.onText = (text) => this.handleStreamText(text);
      this.conn.onStatusChange = (status) => {
        if (status === "turn_done") this.handleTurnDone();
      };

      await this.conn.start(this.plugin.settings.opencodePath, vaultPath, extra);
      this.connected = true;
      this.updateStatus("connected");
    } catch (err: any) {
      this.updateStatus(`error: ${err.message}`);
      this.connected = false;
    }
  }

  handleStreamText(text: string) {
    if (!this.currentAssistantEl) return;
    this.currentAssistantContent += text;
    if (this.contentEl) {
      this.contentEl.setText(this.currentAssistantContent);
      this.scrollToBottom();
    }
  }

  handleTurnDone() {
    this.currentAssistantEl = null;
    this.contentEl = null;
    this.currentAssistantContent = "";
    this.sendBtnEl.removeAttribute("disabled");
    this.updateStatus("connected");
  }

  updateStatus(status: string) {
    this.statusEl.setText(status);
  }

  setupDOM() {
    const container = this.containerEl;
    container.empty();

    const chatContainer = container.createDiv({ cls: "opencodian-container" });
    this.statusEl = chatContainer.createDiv({ cls: "opencodian-status" });
    this.messageContainerEl = chatContainer.createDiv({ cls: "opencodian-messages" });

    const contextBar = chatContainer.createDiv({ cls: "opencodian-context-bar" });
    const ctxLabel = contextBar.createSpan({ cls: "opencodian-context-label" });
    const updateCtx = () => {
      const f = this.app.workspace.getActiveFile();
      ctxLabel.setText(f ? `Context: ${f.path}` : "Context: (none)");
    };
    updateCtx();
    this.registerEvent(this.app.workspace.on("active-leaf-change", updateCtx));

    const inputArea = chatContainer.createDiv({ cls: "opencodian-input-area" });
    const row = inputArea.createDiv({ cls: "opencodian-input-row" });

    this.inputEl = row.createEl("textarea", {
      cls: "opencodian-input",
      attr: { placeholder: "Ask opencode..." },
    });

    this.sendBtnEl = row.createEl("button", { cls: "opencodian-send-btn", text: "Send" });

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.handleSend(); }
    });
    this.sendBtnEl.addEventListener("click", () => this.handleSend());

    this.addWelcomeMessage();
  }

  addWelcomeMessage() {
    const el = this.messageContainerEl.createDiv({ cls: "opencodian-message opencodian-welcome" });
    const content = el.createDiv({ cls: "opencodian-message-content" });
    content.createEl("h2", { text: "Opencodian" });
    content.createEl("p", { text: "Connected to opencode via ACP. Type a message to start." });
    const ul = content.createEl("ul");
    for (const tip of ["Summarise the current note", "Refactor this file", "Find bugs in my code"]) {
      const li = ul.createEl("li", { text: tip });
      li.addClass("opencodian-hint");
      li.addEventListener("click", () => { this.inputEl.value = tip; this.inputEl.focus(); });
    }
  }

  async handleSend() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    if (!this.connected) {
      new Notice("Not connected to opencode. Check Settings → Opencodian");
      return;
    }

    this.inputEl.value = "";
    this.sendBtnEl.setAttr("disabled", "true");

    this.addMessageBubble("user", text);
    this.currentAssistantContent = "";
    this.currentAssistantEl = this.addMessageBubble("assistant", "");
    this.contentEl = this.currentAssistantEl.querySelector(".opencodian-message-content") as HTMLElement;
    this.updateStatus("thinking...");

    const contextFile = this.app.workspace.getActiveFile();
    let prompt = text;
    if (contextFile) {
      let noteContent = "";
      try { noteContent = await this.app.vault.read(contextFile); } catch {}
      if (noteContent) {
        prompt = `Current note (${contextFile.path}):\n\`\`\`\n${noteContent.slice(0, 2000)}\`\`\`\n\n---\n\n${text}`;
      }
    }

    try {
      await this.conn.sendPrompt(prompt);
    } catch (err: any) {
      if (this.contentEl) this.contentEl.setText(`Error: ${err.message}`);
      this.handleTurnDone();
    }
  }

  addMessageBubble(role: string, content: string): HTMLElement {
    const el = this.messageContainerEl.createDiv({ cls: `opencodian-message opencodian-${role}` });
    const contentEl = el.createDiv({ cls: "opencodian-message-content" });
    contentEl.setText(content);
    this.scrollToBottom();
    return el;
  }

  scrollToBottom() {
    this.messageContainerEl.scrollTop = this.messageContainerEl.scrollHeight;
  }
}
