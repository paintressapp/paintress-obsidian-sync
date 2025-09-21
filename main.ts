import { Notice, Plugin, setIcon, getIcon } from 'obsidian';
import { SettingTab } from 'setting-tab/setting';
import { ConflictResolver } from 'src/conflict-resolver';
import { ConnectionMonitor } from 'src/connection-moditor';
import { Crypto } from 'src/crypto';
import { LocalFileSystem } from 'src/fs.local';
import { LocalFileHistory } from 'src/fs.local.file-history';
import { RemoteFileSystem } from 'src/fs.remote';
import { Repo } from 'src/repo';
import { SettingsController } from 'src/settings-controller';
import { SyncController } from 'src/sync-controller';

export default class PaintressSyncPlugin extends Plugin {
	settingsController: SettingsController;
	syncController: SyncController | null = null;
	connectionMonitor: ConnectionMonitor | null = null;
	fileHistory: LocalFileHistory | null = null;
	statusBarItem: HTMLDivElement | null = null;

	syncing = false;

	async onload() {
		this.settingsController = new SettingsController(this);
		await this.settingsController.loadSettings();

		this.initializeSyncController();

		this.registerEvent('');

		this.app.workspace.onLayoutReady(() => {
			const intervalID = window.setInterval(() => {
				if (this.settingsController.settings.sync_type === 'auto') {
					this.runSync();
				}
			}, 3000);

			this.registerInterval(intervalID);
		});

		this.addSettingTab(new SettingTab(this.app, this, this.settingsController));

		this.addCommand({
			id: 'start-sync',
			name: 'Start Sync',
			icon: 'refresh-cw',
			callback: async () => {
				this.runSync({
					showNotice: true,
				});
			},
		});

		const statusBarItem = this.addStatusBarItem();
		this.statusBarItem = statusBarItem.createEl('div');

		this.statusBarItem.style.display = 'flex';
		this.statusBarItem.style.alignItems = 'center';
		this.statusBarItem.style.gap = '0.5rem';

		this.clearStatusBarItem();
	}

	private clearStatusBarItem() {
		this.statusBarItem!.empty();
		this.statusBarItem!.append(getIcon('circle-dashed')!);
		this.statusBarItem!.append('Not syncing');
	}

	private setStatusBarItemAsSyncing() {
		this.statusBarItem!.empty();
		this.statusBarItem!.append(getIcon('refresh-cw')!);
		this.statusBarItem!.append('Syncing');
	}

	private setStatusBarItemAsNotSyncing() {
		this.statusBarItem!.empty();
		this.statusBarItem!.append(getIcon('circle-check')!);
		this.statusBarItem!.append('Synced');
	}

	private setStatusBarItemAsError() {
		this.statusBarItem!.empty();
		this.statusBarItem!.append(getIcon('alert-triangle')!);
		this.statusBarItem!.append('Sync error');
	}

	private initializeSyncController() {
		const { api_host, api_key } = this.settingsController.settings;

		if (!api_host || !api_key) {
			console.warn('Paintress Sync: API host or key not configured');
			return;
		}

		const repo = new Repo(api_host, api_key);
		this.connectionMonitor = new ConnectionMonitor(repo);
		this.fileHistory = new LocalFileHistory(this);

		const localFs = new LocalFileSystem(this, this.settingsController, this.fileHistory);
		const remoteFs = new RemoteFileSystem(repo, this.settingsController);
		const crypto = new Crypto(this.settingsController);
		const conflictResolver = new ConflictResolver();

		this.syncController = new SyncController(localFs, remoteFs, this.settingsController, crypto, conflictResolver);
	}

	private async runSync(opt: { showNotice: boolean } = { showNotice: false }) {
		this.setStatusBarItemAsSyncing();

		if (!this.settingsController.settings.enabled) {
			if (opt.showNotice) {
				new Notice('PaintressSync: Sync is not enabled', 5000);
			}
			return;
		}

		if (this.syncing) {
			if (opt.showNotice) {
				new Notice('PaintressSync: Sync is already running', 5000);
			}
			return;
		}

		if (!this.settingsController.settings.terms_accepted) {
			if (opt.showNotice) {
				new Notice('PaintressSync: Can not sync, terms are not accepted', 5000);
			}
			return;
		}

		try {
			this.syncing = true;
			this.setStatusBarItemAsSyncing();
			await this.syncController?.sync();
			this.setStatusBarItemAsNotSyncing();
		} catch (error) {
			console.log(error);
			console.log(error?.stack);
			console.log(error?.message);
			console.error('Paintress Sync: Error syncing', error);
			this.setStatusBarItemAsError();
		} finally {
			this.syncing = false;
		}
	}
}
