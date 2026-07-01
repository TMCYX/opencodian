import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { DeepseekianSettings, DEFAULT_SETTINGS, DeepseekianSettingTab } from "./settings";

const VIEW_TYPE_DEEPSEEKIAN = "deepseekian-chat-view";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export default class DeepseekianPlugin extends Plugin {
  settings: DeepseekianSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new DeepseekianSettingTab(this.app, this));

    this.registerView(
      VIEW_TYPE_DEEPSEEKIAN,
      (leaf) => new DeepseekianChatView(leaf, this)
    );

    this.addRibbonIcon("message-square", "Open Deepseekian", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-deepseekian",
      name: "Open Deepseekian chat",
      callback: () => this.activateView(),
    });
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_DEEPSEEKIAN).first();

    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: VIEW_TYPE_DEEPSEEKIAN, active: true });
    }

    workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class DeepseekianChatView extends ItemView {
  plugin: DeepseekianPlugin;
  messages: ChatMessage[] = [];
  messageContainerEl: HTMLElement;
  inputEl: HTMLTextAreaElement;
  sendBtnEl: HTMLElement;
  contextLabelEl: HTMLElement;
  abortController: AbortController | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DeepseekianPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DEEPSEEKIAN;
  }

  getDisplayText(): string {
    return "Deepseekian";
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
    this.abortController?.abort();
  }

  updateContextBar() {
    const file = this.app.workspace.getActiveFile();
    this.contextLabelEl.setText(file ? `Context: ${file.path}` : "Context: (no file open)");
  }

  setupDOM() {
    const container = this.containerEl;
    container.empty();

    const chatContainer = container.createDiv({ cls: "deepseekian-container" });
    this.messageContainerEl = chatContainer.createDiv({ cls: "deepseekian-messages" });

    const contextBar = chatContainer.createDiv({ cls: "deepseekian-context-bar" });
    this.contextLabelEl = contextBar.createSpan({ cls: "deepseekian-context-label" });
    this.updateContextBar();

    const inputArea = chatContainer.createDiv({ cls: "deepseekian-input-area" });
    const row = inputArea.createDiv({ cls: "deepseekian-input-row" });

    this.inputEl = row.createEl("textarea", {
      cls: "deepseekian-input",
      attr: { placeholder: "Ask DeepSeek anything..." },
    });

    this.sendBtnEl = row.createEl("button", {
      cls: "deepseekian-send-btn",
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
    const el = this.messageContainerEl.createDiv({ cls: "deepseekian-message deepseekian-welcome" });
    const content = el.createDiv({ cls: "deepseekian-message-content" });

    content.createEl("h2", { text: "Deepseekian" });
    content.createEl("p", { text: "Your DeepSeek AI assistant in Obsidian. Ask anything about your vault." });

    const ul = content.createEl("ul");
    const tips = [
      "Summarise the current note",
      "Draft a response based on my notes",
      "Find connections between ideas",
    ];
    for (const tip of tips) {
      const li = ul.createEl("li", { text: tip });
      li.addClass("deepseekian-hint");
      li.addEventListener("click", () => {
        this.inputEl.value = tip;
        this.inputEl.focus();
      });
    }
  }

  async handleSend() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    if (!this.plugin.settings.apiKey) {
      new Notice("Please set your DeepSeek API key in Settings → Deepseekian");
      return;
    }

    this.inputEl.value = "";
    this.inputEl.style.height = "auto";
    this.sendBtnEl.setAttr("disabled", "true");

    this.addMessageBubble("user", text);

    let noteContent = "";
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      try {
        noteContent = await this.app.vault.read(activeFile);
      } catch {}
    }

    const userMsg: ChatMessage = {
      role: "user",
      content: noteContent
        ? `Current note (${activeFile!.path}):\n\n\`\`\`\n${noteContent.slice(0, 3000)}\`\`\`\n\n---\n\n${text}`
        : text,
    };

    this.messages.push(userMsg);

    const apiMessages: ChatMessage[] = [
      { role: "system", content: this.plugin.settings.systemPrompt },
      ...this.messages.slice(-20),
    ];

    const assistantEl = this.addMessageBubble("assistant", "");
    const contentEl = assistantEl.querySelector(".deepseekian-message-content") as HTMLElement;
    const thinkingEl = assistantEl.querySelector(".deepseekian-thinking") as HTMLElement | null;

    this.abortController = new AbortController();

    try {
      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.plugin.settings.apiKey}`,
        },
        body: JSON.stringify({
          model: this.plugin.settings.model,
          messages: apiMessages,
          stream: true,
          temperature: this.plugin.settings.temperature,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        contentEl.setText(`API error ${response.status}: ${errBody}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        contentEl.setText("No response stream available");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let reasoningText = "";
      let showedReasoning = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          try {
            const chunk = JSON.parse(jsonStr);
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.reasoning_content) {
              reasoningText += delta.reasoning_content;
              if (thinkingEl) {
                thinkingEl.setText(reasoningText);
                thinkingEl.show();
              }
              showedReasoning = true;
            }

            if (delta.content) {
              if (showedReasoning && !fullContent) {
                fullContent += delta.content;
                contentEl.setText(fullContent);
              } else {
                fullContent += delta.content;
                contentEl.setText(fullContent);
              }
            }
          } catch {}
        }
      }

      this.messages.push({ role: "assistant", content: fullContent || reasoningText });
    } catch (err: any) {
      if (err.name === "AbortError") {
        contentEl.setText("(cancelled)");
      } else {
        contentEl.setText(`Error: ${err.message}`);
      }
    } finally {
      this.sendBtnEl.removeAttribute("disabled");
      this.abortController = null;
      this.scrollToBottom();
    }
  }

  addMessageBubble(role: string, content: string): HTMLElement {
    const el = this.messageContainerEl.createDiv({
      cls: `deepseekian-message deepseekian-${role}`,
    });

    if (role === "assistant") {
      const thinking = el.createDiv({ cls: "deepseekian-thinking" });
      thinking.hide();
    }

    const contentEl = el.createDiv({ cls: "deepseekian-message-content" });
    contentEl.setText(content);

    this.scrollToBottom();
    return el;
  }

  scrollToBottom() {
    this.messageContainerEl.scrollTop = this.messageContainerEl.scrollHeight;
  }
}
