# Deepseekian

DeepSeek AI chat assistant embedded in your Obsidian vault sidebar.

## Features

- Chat with DeepSeek directly in Obsidian sidebar
- Context-aware: automatically includes your current note as context
- Supports DeepSeek V3 (deepseek-chat) and DeepSeek R1 (deepseek-reasoner)
- Streaming responses with reasoning display (R1)
- Conversation history preserved in-memory

## Requirements

- Obsidian v1.5.0+
- A DeepSeek API key from https://platform.deepseek.com

## Installation

### Via BRAT (recommended)

1. Install the [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) plugin from Community Plugins
2. Open Obsidian → Settings → BRAT → Add Beta plugin
3. Enter this repository URL
4. Click "Add Plugin"
5. Enable Deepseekian in Community Plugins

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create `{vault}/.obsidian/plugins/deepseekian/`
3. Copy the three files into that folder
4. Enable the plugin in Settings → Community plugins

## Usage

1. Click the message-square icon in the ribbon bar, or run the "Open Deepseekian chat" command
2. Open a note to use as context
3. Type your question and press Enter or click Send
4. DeepSeek will respond with the current note as context

## Configuration

Go to Settings → Deepseekian:

- **API Key**: Your DeepSeek API key
- **Model**: deepseek-chat (V3) or deepseek-reasoner (R1)
- **Temperature**: 0-2, higher for more creativity
- **System Prompt**: Custom instructions for the AI

## License

MIT
