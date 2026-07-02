import { FuzzySuggestModal, ItemView, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { OpencodianSettings, DEFAULT_SETTINGS, OpencodianSettingTab } from "./settings";
import { AcpConnection, ConfigOption } from "./acp/connection";

const VIEW_TYPE_OPENCODIAN = "opencodian-chat-view";

// File picker modal
class FilePickerModal extends FuzzySuggestModal<TFile> {
  constructor(app: any, private onPick: (file: TFile) => void) {
    super(app);
    this.setPlaceholder("Pick a file to attach as context...");
  }
  getItems(): TFile[] {
    return this.app.vault.getFiles();
  }
  getItemText(file: TFile): string {
    return file.path;
  }
  onChooseItem(file: TFile): void {
    this.onPick(file);
  }
}

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

  toolbarEl: HTMLElement;
  modelBtnEl: HTMLElement;
  modelDropdownEl: HTMLElement;
  modeToggleEl: HTMLElement;
  modeLabelEl: HTMLElement;
  fileBtnEl: HTMLElement;
  attachedFile: TFile | null = null;
  useAutoContext: boolean = true;

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
      this.conn.onConfigOptionsChanged = (options) => this.refreshToolbar(options);

      await this.conn.start(this.plugin.settings.opencodePath, vaultPath, extra);
      this.connected = true;
      this.updateStatus("connected");
      this.refreshToolbar(this.conn.configOptions);
    } catch (err: any) {
      this.updateStatus(`error: ${err.message}`);
      this.connected = false;
    }
  }

  refreshToolbar(options: ConfigOption[]) {
    const modelOpt = options.find(o => o.category === "model");
    if (modelOpt) {
      const model = modelOpt.options.find(o => o.value === modelOpt.currentValue);
      this.modelBtnEl.setText(model?.name || modelOpt.currentValue);
      this.renderModelDropdown(modelOpt);
    }

    const modeOpt = options.find(o => o.category === "mode");
    if (modeOpt) {
      const isPlan = modeOpt.currentValue === "plan";
      this.modeToggleEl.toggleClass("active", isPlan);
      this.modeLabelEl.setText(isPlan ? "plan" : "build");
    }
  }

  renderModelDropdown(modelOpt: ConfigOption) {
    this.modelDropdownEl.empty();
    for (const opt of modelOpt.options) {
      const item = this.modelDropdownEl.createDiv({ cls: "opencodian-model-option" });
      item.toggleClass("selected", opt.value === modelOpt.currentValue);
      item.setText(opt.name);
      if (opt.description) item.setAttr("title", opt.description);
      item.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await this.conn.setConfigOption("model", opt.value);
          new Notice(`Model: ${opt.name}`);
        } catch (err: any) {
          new Notice(`Failed to change model: ${err.message}`);
        }
      });
    }
  }

  handleStreamText(text: string) {
    if (!this.currentAssistantEl) return;
    const thinkingEl = this.currentAssistantEl.querySelector(".opencodian-thinking") as HTMLElement;
    if (thinkingEl?.isShown()) {
      thinkingEl.hide();
      this.updateStatus("receiving...");
    }
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

    // Toolbar at top
    this.toolbarEl = chatContainer.createDiv({ cls: "opencodian-toolbar" });
    this.buildToolbar();

    this.statusEl = chatContainer.createDiv({ cls: "opencodian-status" });
    this.messageContainerEl = chatContainer.createDiv({ cls: "opencodian-messages" });

    // Context bar
    const contextBar = chatContainer.createDiv({ cls: "opencodian-context-bar" });
    const ctxLabel = contextBar.createSpan({ cls: "opencodian-context-label" });
    const updateCtx = () => {
      const f = this.app.workspace.getActiveFile();
      ctxLabel.setText(f ? `Context: ${f.path}` : "Context: (none)");
    };
    updateCtx();
    this.registerEvent(this.app.workspace.on("active-leaf-change", updateCtx));

    // Input area
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

  buildToolbar() {
    this.toolbarEl.empty();
    const leftGroup = this.toolbarEl.createDiv({ cls: "opencodian-toolbar-group" });
    const rightGroup = this.toolbarEl.createDiv({ cls: "opencodian-toolbar-group opencodian-toolbar-right" });

    // Model selector
    const modelWrap = leftGroup.createDiv({ cls: "opencodian-model-selector" });
    this.modelBtnEl = modelWrap.createDiv({ cls: "opencodian-model-btn" });
    this.modelBtnEl.setText("model...");
    this.modelDropdownEl = modelWrap.createDiv({ cls: "opencodian-model-dropdown" });

    // File attach button
    this.fileBtnEl = leftGroup.createEl("button", { cls: "opencodian-toolbar-btn opencodian-file-btn" });
    this.fileBtnEl.setText("+");
    this.fileBtnEl.setAttr("title", "Attach a file as context");
    this.fileBtnEl.addEventListener("click", () => this.pickFile());

    // Spacer
    rightGroup.createDiv({ cls: "opencodian-toolbar-spacer" });

    // Mode toggle (build/plan)
    const modeWrap = rightGroup.createDiv({ cls: "opencodian-mode-toggle" });
    this.modeLabelEl = modeWrap.createSpan({ cls: "opencodian-mode-label", text: "build" });
    this.modeToggleEl = modeWrap.createDiv({ cls: "opencodian-toggle-switch" });
    this.modeToggleEl.addEventListener("click", () => this.toggleMode());
  }

  async toggleMode() {
    const modeOpt = this.conn.configOptions.find(o => o.category === "mode");
    if (!modeOpt) return;
    const next = modeOpt.currentValue === "plan" ? "build" : "plan";
    try {
      await this.conn.setConfigOption("mode", next);
    } catch (err: any) {
      new Notice(`Failed to switch mode: ${err.message}`);
    }
  }

  pickFile() {
    new FilePickerModal(this.app, (file: TFile) => {
      this.attachedFile = file;
      this.fileBtnEl.addClass("active");
      new Notice(`Attached: ${file.path}`);
    }).open();
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

    const thinkingEl = this.currentAssistantEl.querySelector(".opencodian-thinking") as HTMLElement;
    thinkingEl?.show();

    this.updateStatus("waiting for opencode...");

    let prompt = text;

    // Attach explicitly picked file
    if (this.attachedFile) {
      try {
        const content = await this.app.vault.read(this.attachedFile);
        prompt = `File: ${this.attachedFile.path}\n\`\`\`\n${content.slice(0, 5000)}\`\`\`\n\n---\n\n${text}`;
      } catch {}
    } else if (this.useAutoContext) {
      // Auto-attach current active note as context
      const contextFile = this.app.workspace.getActiveFile();
      if (contextFile) {
        let noteContent = "";
        try { noteContent = await this.app.vault.read(contextFile); } catch {}
        if (noteContent) {
          prompt = `Current note (${contextFile.path}):\n\`\`\`\n${noteContent.slice(0, 2000)}\`\`\`\n\n---\n\n${text}`;
        }
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
    if (role === "assistant") {
      const thinking = el.createDiv({ cls: "opencodian-thinking" });
      thinking.hide();
      const dots = thinking.createSpan({ cls: "opencodian-thinking-dots" });
      for (let i = 0; i < 3; i++) {
        dots.createSpan({ cls: "opencodian-dot" });
      }
      thinking.createSpan({ cls: "opencodian-thinking-label", text: "thinking" });
    }
    const contentEl = el.createDiv({ cls: "opencodian-message-content" });
    contentEl.setText(content);
    this.scrollToBottom();
    return el;
  }

  scrollToBottom() {
    this.messageContainerEl.scrollTop = this.messageContainerEl.scrollHeight;
  }
}
