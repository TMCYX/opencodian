import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { OpencodianSettings, DEFAULT_SETTINGS, OpencodianSettingTab } from "./settings";
import { spawn, ChildProcess } from "child_process";

const VIEW_TYPE_OPENCODIAN = "opencodian-chat-view";

export default class OpencodianPlugin extends Plugin {
  settings: OpencodianSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new OpencodianSettingTab(this.app, this));

    this.registerView(
      VIEW_TYPE_OPENCODIAN,
      (leaf) => new OpencodianChatView(leaf, this)
    );

    this.addRibbonIcon("message-square", "Open Opencodian", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-opencodian",
      name: "Open Opencodian chat",
      callback: () => this.activateView(),
    });
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
  messages: { role: string; content: string }[] = [];
  messageContainerEl: HTMLElement;
  inputEl: HTMLTextAreaElement;
  sendBtnEl: HTMLElement;
  contextLabelEl: HTMLElement;
  proc: ChildProcess | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: OpencodianPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_OPENCODIAN;
  }

  getDisplayText(): string {
    return "Opencodian";
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen() {
    this.setupDOM();
    this.addWelcomeMessage();

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.updateContextBar())
    );
  }

  async onClose() {
    this.killProcess();
  }

  killProcess() {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  updateContextBar() {
    const file = this.app.workspace.getActiveFile();
    this.contextLabelEl.setText(file ? `Context: ${file.path}` : "Context: (no file open)");
  }

  setupDOM() {
    const container = this.containerEl;
    container.empty();

    const chatContainer = container.createDiv({ cls: "opencodian-container" });
    this.messageContainerEl = chatContainer.createDiv({ cls: "opencodian-messages" });

    const contextBar = chatContainer.createDiv({ cls: "opencodian-context-bar" });
    this.contextLabelEl = contextBar.createSpan({ cls: "opencodian-context-label" });
    this.updateContextBar();

    const inputArea = chatContainer.createDiv({ cls: "opencodian-input-area" });
    const row = inputArea.createDiv({ cls: "opencodian-input-row" });

    this.inputEl = row.createEl("textarea", {
      cls: "opencodian-input",
      attr: { placeholder: "Ask opencode..." },
    });

    this.sendBtnEl = row.createEl("button", {
      cls: "opencodian-send-btn",
      text: "Send",
    });

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.sendBtnEl.addEventListener("click", () => this.handleSend());
  }

  addWelcomeMessage() {
    const el = this.messageContainerEl.createDiv({ cls: "opencodian-message opencodian-welcome" });
    const content = el.createDiv({ cls: "opencodian-message-content" });

    content.createEl("h2", { text: "Opencodian" });
    content.createEl("p", { text: "Opencode AI agent running in your vault. Each message runs opencode as a subprocess." });

    const ul = content.createEl("ul");
    const tips = [
      "Summarise the current note",
      "Refactor this file",
      "Find bugs in my code",
    ];
    for (const tip of tips) {
      const li = ul.createEl("li", { text: tip });
      li.addClass("opencodian-hint");
      li.addEventListener("click", () => {
        this.inputEl.value = tip;
        this.inputEl.focus();
      });
    }
  }

  async handleSend() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    if (!this.plugin.settings.opencodePath) {
      new Notice("Please set the opencode CLI path in Settings → Opencodian");
      return;
    }

    this.inputEl.value = "";
    this.inputEl.style.height = "auto";
    this.sendBtnEl.setAttr("disabled", "true");

    this.addMessageBubble("user", text);
    const assistantEl = this.addMessageBubble("assistant", "Running opencode...");
    const contentEl = assistantEl.querySelector(".opencodian-message-content") as HTMLElement;

    const vaultPath = this.plugin.getVaultPath();
    if (!vaultPath) {
      contentEl.setText("Error: could not resolve vault path");
      this.sendBtnEl.removeAttribute("disabled");
      return;
    }

    const contextFile = this.app.workspace.getActiveFile();
    let prompt = text;
    if (contextFile) {
      prompt = `(Current note: ${contextFile.path})\n\n${text}`;
    }

    const extra = this.plugin.settings.extraArgs
      ? this.plugin.settings.extraArgs.split(/\s+/).filter(Boolean)
      : [];

    const args = ["run", ...extra, "--", prompt];

    let output = "";
    let errorOutput = "";

    this.proc = spawn(this.plugin.settings.opencodePath, args, {
      cwd: vaultPath,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    this.proc.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
      contentEl.setText(output.slice(-3000));
      this.scrollToBottom();
    });

    this.proc.stderr?.on("data", (data: Buffer) => {
      errorOutput += data.toString();
    });

    this.proc.on("error", (err) => {
      contentEl.setText(`Failed to spawn opencode: ${err.message}\n\nCheck the path in Settings → Opencodian`);
      this.sendBtnEl.removeAttribute("disabled");
      this.proc = null;
    });

    this.proc.on("close", (code) => {
      if (errorOutput) {
        output += `\n\n--- stderr ---\n${errorOutput}`;
      }
      contentEl.setText(output || `(exit code ${code}, no output)`);
      this.messages.push({ role: "user", content: text });
      this.messages.push({ role: "assistant", content: output });
      this.sendBtnEl.removeAttribute("disabled");
      this.proc = null;
      this.scrollToBottom();
    });
  }

  addMessageBubble(role: string, content: string): HTMLElement {
    const el = this.messageContainerEl.createDiv({
      cls: `opencodian-message opencodian-${role}`,
    });

    const contentEl = el.createDiv({ cls: "opencodian-message-content" });
    contentEl.setText(content);

    this.scrollToBottom();
    return el;
  }

  scrollToBottom() {
    this.messageContainerEl.scrollTop = this.messageContainerEl.scrollHeight;
  }
}
