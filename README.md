# Opencodian

Run opencode AI agent directly from your Obsidian sidebar. No API key needed — opencode is the backend.

## How it works

Each message spawns `opencode` as a subprocess in your vault directory. Opencode reads, writes, edits, and searches your files — just like it does in the terminal.

## Requirements

- Obsidian v1.7.2+ (desktop only)
- [opencode](https://opencode.ai/) installed and available in PATH

## Installation

### Via BRAT (recommended)

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) from Community Plugins
2. Settings → BRAT → Add Beta plugin → `https://github.com/TMCYX/opencodian`
3. Enable Opencodian in Community Plugins

### Manual

1. Download `main.js`, `manifest.json`, `styles.css` from the latest release
2. Create `{vault}/.obsidian/plugins/opencodian/`
3. Copy files into that folder
4. Enable the plugin

## Usage

1. Click the message-square icon in the ribbon, or run "Open Opencodian chat"
2. Type your task and press Enter
3. Opencode runs in your vault and returns the result

## Configuration

Settings → Opencodian:

- **Opencode CLI path**: Path to the opencode binary (default: `opencode`)
- **Extra CLI arguments**: Optional flags like `--model claude-sonnet-4-20250514`

## License

MIT
