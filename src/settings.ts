import { App, PluginSettingTab, Setting } from "obsidian";
import DeepseekianPlugin from "./main";

export interface DeepseekianSettings {
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
}

export const DEFAULT_SETTINGS: DeepseekianSettings = {
  apiKey: "",
  model: "deepseek-chat",
  systemPrompt: "You are a helpful AI assistant integrated in Obsidian. The user's vault root is available as context. Be concise and direct.",
  temperature: 0.7,
};

export class DeepseekianSettingTab extends PluginSettingTab {
  plugin: DeepseekianPlugin;

  constructor(app: App, plugin: DeepseekianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("DeepSeek API Key")
      .setDesc("Your DeepSeek API key from platform.deepseek.com")
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
      .setDesc("DeepSeek model to use")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("deepseek-chat", "DeepSeek V3 (deepseek-chat)")
          .addOption("deepseek-reasoner", "DeepSeek R1 (deepseek-reasoner)")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
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
