# Paintress Sync

An Obsidian plugin that synchronizes your vault with a remote Paintress server, providing secure cloud backup and cross-device synchronization.

## Features

-   **Automatic & Manual Sync**: Choose between automatic syncing every 30 seconds or manual sync on demand
-   **End-to-End Encryption**: All files are encrypted before being sent to the server
-   **Conflict Resolution**: Intelligent conflict handling with multiple resolution strategies
-   **File Filtering**: Exclude specific files and folders using glob patterns
-   **Real-time Status**: Visual status indicators in the status bar
-   **Cross-Platform**: Works on desktop and mobile devices

## Installation

1. Download the latest release from the GitHub releases page
2. Extract the files to your vault's plugins folder: `<vault>/.obsidian/plugins/paintress-sync/`
3. Reload Obsidian and enable the plugin in **Settings → Community plugins**

## Configuration

Navigate to **Settings → Paintress Sync** to configure the plugin:

### Basic Settings

-   **Enable Sync**: Toggle synchronization on/off
-   **Sync Type**: Choose between `auto` (every 30 seconds) or `manual`
-   **API Host**: Server URL (default: `https://app.paintress.com`)
-   **API Key**: Your Paintress API key
-   **Encryption Key**: Encryption key for secure file storage

### Advanced Settings

-   **Exclude Patterns**: Glob patterns for files to exclude from sync (default: `**/.paintress, **/paintress-obsidian-plugin`)
-   **Max File Size**: Maximum file size to sync (default: 10MB)
-   **Sync Internal Files**: Whether to sync Obsidian's internal files

### Conflict Resolution

-   **Auto Resolve Conflicts**: Automatically resolve conflicts using configured strategies
-   **Fallback Strategy**: Default strategy when no specific rule matches (default: `latest`)
-   **Custom Rules**: Define glob-based rules for specific conflict resolution strategies

Available conflict resolution strategies:

-   `latest`: Use the most recently modified version
-   `oldest`: Use the older version
-   `always-pull`: Always use the remote version
-   `always-push`: Always use the local version
-   `ignore`: Skip conflicted files
-   `resolve`: Attempt automatic merge resolution

## Usage

### Manual Sync

Use the command palette (`Ctrl/Cmd + P`) and search for "Start Sync" or use the ribbon icon.

### Status Bar

The status bar shows the current sync status:

-   🔄 **Syncing**: Currently synchronizing files
-   ✅ **Synced**: All files are up to date
-   ⚠️ **Sync error**: An error occurred during sync
-   ⭕ **Not syncing**: Sync is disabled or not configured

### File Operations

The plugin automatically tracks:

-   File creation and modification
-   File deletion and renaming
-   Maintains file history for conflict resolution

## Security & Privacy

-   **Local Encryption**: All files are encrypted locally before transmission
-   **Zero-Knowledge**: The server cannot read your vault contents
-   **Secure Communication**: All API calls use HTTPS
-   **No Telemetry**: No usage data is collected

## Troubleshooting

### Common Issues

1. **Plugin not loading**: Ensure `main.js` and `manifest.json` are in the correct plugin folder
2. **Sync not working**: Check API host and key configuration
3. **Files not syncing**: Verify files aren't excluded by glob patterns
4. **Conflicts not resolving**: Review conflict resolution settings

### Debug Information

Enable developer console (`Ctrl/Cmd + Shift + I`) to view detailed sync logs. Look for messages prefixed with `[SyncController]` or `[SettingsController]`.

## File Structure

```
paintress-sync/
├── main.js              # Compiled plugin entry point
├── manifest.json        # Plugin metadata
├── styles.css          # Plugin styles (if any)
└── src/                # Source code (development)
    ├── sync-controller.ts
    ├── settings-controller.ts
    ├── conflict-resolver.ts
    ├── fs.local.ts
    ├── fs.remote.ts
    └── ...
```

## Requirements

-   Obsidian 0.15.0 or later
-   Valid Paintress account and API key
-   Internet connection for synchronization

## License

This project is licensed under the terms specified in the LICENSE file.

## Support

For issues, feature requests, or questions:

-   GitHub Issues: [Report an issue](https://github.com/reezpatel/paintress-obsidian-sync/issues)
-   Author: [Reez](https://github.com/reezpatel)
