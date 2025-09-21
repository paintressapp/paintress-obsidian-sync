import { Plugin } from 'obsidian';

export type ConflictResolutionStrategy = 'ignore' | 'latest' | 'oldest' | 'always-pull' | 'always-push';

export type PaintressSyncSettings = {
	enabled: boolean;

	sync_type: 'auto' | 'manual';
	sync_interval: number;

	api_host: string;
	api_key: string;
	encryption_key: string;

	exclude_globs: string;

	sync_max_file_size: string;

	auto_resolve_conflict: boolean;
	fallback_conflict_resolution_strategy: ConflictResolutionStrategy;
	resolution_strategies: Array<{ glob: string; strategy: ConflictResolutionStrategy }>;

	terms_accepted: boolean;

	last_synced_at: number;
};

export const DEFAULT_SETTINGS: PaintressSyncSettings = {
	enabled: true,
	sync_type: 'auto',
	sync_interval: 30000,
	api_host: 'https://app.paintress.com',
	api_key: '',
	encryption_key: '',

	sync_max_file_size: '10MB', // 10MB

	auto_resolve_conflict: true,
	fallback_conflict_resolution_strategy: 'latest',

	resolution_strategies: [],

	exclude_globs: './paintress/file-history.db',

	terms_accepted: false,

	last_synced_at: 0,
};

export class SettingsController {
	private plugin: Plugin;
	private _settings: PaintressSyncSettings;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this._settings = { ...DEFAULT_SETTINGS };
	}

	get settings(): PaintressSyncSettings {
		return this._settings;
	}

	async loadSettings(): Promise<void> {
		this._settings = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData());
	}

	async saveSettings(): Promise<void> {
		console.log('[SettingsController] saveSettings: ', this._settings);
		await this.plugin.saveData(this._settings);
	}

	async updateSettings(newSettings: Partial<PaintressSyncSettings>): Promise<void> {
		this._settings = Object.assign(this._settings, newSettings);
		await this.saveSettings();
	}
}
