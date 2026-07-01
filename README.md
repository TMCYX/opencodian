# Opencodian

AI chat assistant embedded in your Obsidian vault sidebar. Works with any OpenAI-compatible backend — LM Studio, Ollama, DeepSeek, OpenAI, or anything you point it at.

## Features

- Chat with any LLM directly in Obsidian sidebar
- Context-aware: automatically includes your current note as context
- Bring your own backend: LM Studio, Ollama, DeepSeek, OpenAI...
- Streaming responses with reasoning display
- Conversation history preserved in-memory

## Requirements

- Obsidian v1.5.0+
- A running OpenAI-compatible API endpoint (e.g. LM Studio on localhost, or any cloud API)

## Installation

### Via BRAT (recommended)

1. Install the [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) plugin from Community Plugins
2. Open Obsidian → Settings → BRAT → Add Beta plugin
3. Enter this repository URL
4. Click "Add Plugin"
5. Enable Opencodian in Community Plugins

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create `{vault}/.obsidian/plugins/opencodian/`
3. Copy the three files into that folder
4. Enable the plugin in Settings → Community plugins

## Usage

1. Click the message-square icon in the ribbon bar, or run the "Open Opencodian chat" command
2. Open a note to use as context
3. Type your question and press Enter or click Send
4. The AI will respond with the current note as context

## Configuration

Go to Settings → Opencodian:

- **API Endpoint**: Your OpenAI-compatible chat completions URL (default: `http://127.0.0.1:1234/v1` for LM Studio)
- **API Key**: Optional — only if your endpoint requires auth
- **Model**: Model name (leave empty for endpoint default)
- **Temperature**: 0-2, higher for more creativity
- **System Prompt**: Custom instructions for the AI

## License

MIT
