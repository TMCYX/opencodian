import { App, PluginSettingTab, Setting } from "obsidian";
import OpencodianPlugin from "./main";

export interface OpencodianSettings {
  opencodePath: string;
  extraArgs: string;
}

export const DEFAULT_SETTINGS: OpencodianSettings = {
  opencodePath: "opencode",
  extraArgs: "",
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
      .setName("Opencode CLI path")
      .setDesc("Path to the opencode binary (e.g. /usr/local/bin/opencode, or just 'opencode' if in PATH)")
      .addText((text) =>
        text
          .setPlaceholder("opencode")
          .setValue(this.plugin.settings.opencodePath)
          .onChange(async (value) => {
            this.plugin.settings.opencodePath = value.trim() || "opencode";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Extra CLI arguments")
      .setDesc("Optional flags passed to opencode (e.g. --model claude-sonnet-4-20250514)")
      .addText((text) =>
        text
          .setPlaceholder("--model claude-sonnet-4-20250514")
          .setValue(this.plugin.settings.extraArgs)
          .onChange(async (value) => {
            this.plugin.settings.extraArgs = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
