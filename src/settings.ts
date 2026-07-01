import { App, PluginSettingTab, Setting } from "obsidian";
import OpencodianPlugin from "./main";

export interface OpencodianSettings {
  apiEndpoint: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
}

export const DEFAULT_SETTINGS: OpencodianSettings = {
  apiEndpoint: "http://127.0.0.1:1234/v1",
  apiKey: "",
  model: "",
  systemPrompt: "You are a helpful AI assistant integrated in Obsidian. The user's vault root is available as context. Be concise and direct.",
  temperature: 0.7,
};

export class OpencodianSettingTab extends PluginSettingTab {
  plugin: OpencodianPlugin;

  constructor(app: App, plugin: OpencodianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("API Endpoint")
      .setDesc("OpenAI-compatible chat completions URL (e.g. http://127.0.0.1:1234/v1 for LM Studio)")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:1234/v1")
          .setValue(this.plugin.settings.apiEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.apiEndpoint = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API Key (optional)")
      .setDesc("Only if your endpoint requires authentication")
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Model name (leave empty for endpoint default)")
      .addText((text) =>
        text
          .setPlaceholder("e.g. deepseek-chat, gpt-4, qwen2.5")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Temperature")
      .setDesc("Higher = more creative, lower = more focused (0-2)")
      .addSlider((slider) =>
        slider
          .setLimits(0, 2, 0.1)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("System prompt")
      .setDesc("Custom system prompt sent with every message")
      .addTextArea((text) =>
        text
          .setPlaceholder("You are a helpful AI assistant...")
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
