import { App, Plugin, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import { ConnectionMonitor } from 'src/connection-moditor';
import { Repo } from 'src/repo';
import { ConflictResolutionStrategy, SettingsController } from 'src/settings-controller';

type TestResult = {
	status: 'success' | 'error' | '';
	message: string;
};

export class SettingTab extends PluginSettingTab {
	private settingsController: SettingsController;
	private testResult: TestResult | null = null;

	constructor(app: App, plugin: Plugin, settingsController: SettingsController) {
		super(app, plugin);
		this.settingsController = settingsController;
	}

	display(): void {
		console.log('[SettingTab] render: display');
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h1', { text: 'Paintress Sync' });
		const description = containerEl.createDiv();
		description.createEl('h2', { text: 'Sync Obsidian with Paintress Server' });

		new Setting(containerEl)
			.setName('Enabled')
			.setDesc('Whether the sync is enabled')
			.addToggle((toggle) =>
				toggle.setValue(this.settingsController.settings.enabled).onChange(async (value) => {
					await this.settingsController.updateSettings({ enabled: value });
				}),
			);

		new Setting(containerEl)
			.setName('Automatic Sync')
			.setDesc('Whether the sync is automatic or manual')
			.addToggle((toggle) =>
				toggle.setValue(this.settingsController.settings.sync_type === 'auto').onChange(async (value) => {
					console.log('[SettingTab] render: sync_type', value);
					await this.settingsController.updateSettings({ sync_type: value ? 'auto' : 'manual' });
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName('Sync Interval')
			.setDesc('The interval at which the sync is run (for manual sync, it will be ignored)')
			.addDropdown((dropdown) =>
				dropdown
					.setValue(`${this.settingsController.settings.sync_interval}`)
					.setDisabled(this.settingsController.settings.sync_type === 'manual')
					.addOptions({
						'5000': '5s',
						'10000': '10s',
						'30000': '30s',
						'60000': '1m',
						'300000': '5m',
					})
					.onChange(async (value) => {
						await this.settingsController.updateSettings({ sync_interval: Number(value) });
					}),
			);

		const apiDiv = containerEl.createDiv();
		apiDiv.style.paddingTop = '32px';
		apiDiv.createEl('h2', { text: 'API Connection Settings' });

		new Setting(containerEl)
			.setName('API Connection')
			.setDesc('The host and key of the API')
			.addText((text) =>
				text
					.setPlaceholder('https://app.paintress.com')
					.setValue(this.settingsController.settings.api_host)
					.onChange(async (value) => {
						await this.settingsController.updateSettings({ api_host: value });
					}),
			)
			.addText((text) =>
				text
					.setPlaceholder('pk_...')
					.setValue(this.settingsController.settings.api_key)
					.onChange(async (value) => {
						await this.settingsController.updateSettings({ api_key: value });
					}),
			);

		new Setting(containerEl)
			.setName('Encryption Key')
			.setDesc('The key of the encryption')
			.addText((text) =>
				text
					.setPlaceholder('1234567890')
					.setValue(this.settingsController.settings.encryption_key)
					.onChange(async (value) => {
						await this.settingsController.updateSettings({ encryption_key: value });
					}),
			);

		let s = new Setting(containerEl);

		const msg = containerEl.createEl('p');

		if (this.testResult) {
			msg.setText(this.testResult.message);

			s.settingEl.prepend(msg);

			if (this.testResult.status === 'error') {
				msg.style.color = 'red';
			} else {
				msg.style.color = 'green';
			}
		}

		s.addButton((button) =>
			button.setButtonText('Test Connection').onClick(async () => {
				this.testConnection();
			}),
		);

		s.addExtraButton((button) =>
			button.setIcon('external-link').onClick(async () => {
				window.open('https://app.paintress.com/settings/api-key');
			}),
		);

		const syncDiv = containerEl.createDiv();
		syncDiv.style.paddingTop = '32px';
		syncDiv.createEl('h2', { text: 'Sync Settings' });

		new Setting(containerEl)
			.setName('Sync max file size')
			.setDesc('The max file size of the sync (4KB, 10KB, 10MB, 15GB)')
			.addText((text) =>
				text
					.setPlaceholder('10MB')
					.setValue(this.settingsController.settings.sync_max_file_size)
					.onChange(async (value) => {
						await this.settingsController.updateSettings({ sync_max_file_size: value });
					}),
			);

		new Setting(containerEl)
			.setName('Exclude Glob')
			.setDesc('The glob to exclude')
			.addTextArea((text) => {
				const component = text.setValue(`${this.settingsController.settings.exclude_globs}`).onChange(async (value) => {
					await this.settingsController.updateSettings({ exclude_globs: value });
				});

				component.inputEl.style.resize = 'vertical';
				component.inputEl.style.width = '100%';

				return component;
			});

		const conflictResolveDiv = containerEl.createDiv();
		conflictResolveDiv.style.paddingTop = '32px';
		conflictResolveDiv.createEl('h2', { text: 'Conflict Resolution Settings' });

		new Setting(containerEl)
			.setName('Auto resolve conflict')
			.setDesc('Whether to auto resolve conflicts')
			.addToggle((toggle) =>
				toggle.setValue(this.settingsController.settings.auto_resolve_conflict).onChange(async (value) => {
					await this.settingsController.updateSettings({ auto_resolve_conflict: value });
				}),
			);

		new Setting(containerEl)
			.setName('Fallback conflict resolution strategy')
			.setDesc('The fallback conflict resolution strategy')
			.addDropdown((dropdown) =>
				dropdown.setValue(this.settingsController.settings.fallback_conflict_resolution_strategy).addOptions({
					ignore: 'Ignore',
					latest: 'Latest',
					oldest: 'Oldest',
					always_pull: 'Always Pull',
					always_push: 'Always Push',
				}),
			);

		const advConflictResolveDiv = containerEl.createDiv();
		advConflictResolveDiv.style.padding = '16px 0 0 0';
		advConflictResolveDiv.createEl('h2', { text: 'Advanced Conflict Resolution Settings' });

		for (const [index, strategy] of this.settingsController.settings.resolution_strategies.entries()) {
			new Setting(advConflictResolveDiv)
				.addText((text) => {
					const e = text
						.setValue(strategy.glob)
						.setPlaceholder('**/.png, **/.jpg')
						.onChange(async (value) => {
							await this.settingsController.updateSettings({
								resolution_strategies: this.settingsController.settings.resolution_strategies.map((s) =>
									s.glob === strategy.glob ? { ...s, glob: value } : s,
								),
							});
						});

					e.inputEl.style.width = '100%';

					return e;
				})
				.addDropdown((dropdown) =>
					dropdown
						.setValue(strategy.strategy)
						.addOptions({
							ignore: 'Ignore',
							latest: 'Latest',
							oldest: 'Oldest',
							always_pull: 'Always Pull',
							always_push: 'Always Push',
						})
						.onChange(async (value) => {
							await this.settingsController.updateSettings({
								resolution_strategies: this.settingsController.settings.resolution_strategies.map((s) =>
									s.glob === strategy.glob ? { ...s, strategy: value as ConflictResolutionStrategy } : s,
								),
							});
						}),
				)
				.addExtraButton((button) =>
					button.setIcon('trash').onClick(async () => {
						await this.settingsController.updateSettings({
							resolution_strategies: this.settingsController.settings.resolution_strategies.filter((_, i) => i !== index),
						});

						this.display();
					}),
				);
		}

		new Setting(advConflictResolveDiv).addButton((button) =>
			button
				.setButtonText('New')
				.setIcon('plus')
				.onClick(async () => {
					await this.settingsController.updateSettings({
						resolution_strategies: [...this.settingsController.settings.resolution_strategies, { glob: '', strategy: 'ignore' }],
					});

					this.display();
				}),
		);

		const disclaimerDiv = containerEl.createDiv();
		disclaimerDiv.style.padding = '16px 0 0 0';
		disclaimerDiv.createEl('h2', { text: 'Disclaimer' });

		const disclaimerStyles: Partial<CSSStyleDeclaration> = {
			fontSize: '13px',
			opacity: '0.8',
		};

		const p1 = disclaimerDiv.createEl('p', {
			text: 'This plugin is not affiliated with Obsidian. It is a third-party plugin that allows you to sync your Obsidian notes with a paintress server.',
		});
		const p3 = disclaimerDiv.createEl('p', {
			text: 'Please make sure you have a backup of your notes before using this plugin.',
		});
		const p4 = disclaimerDiv.createEl('p', {
			text: 'Please read document below before using this plugin.',
		});

		const a1 = disclaimerDiv.createEl('a', {
			text: 'Paintress Sync - Before you start',
			attr: {
				href: 'https://docs.paintress.com/sync/before-you-start',
			},
		});

		[p1, p3, p4, a1].forEach((p) => {
			Object.entries(disclaimerStyles).forEach(([key, value]) => {
				p.style[key as any] = value as string;
			});
		});

		a1.style.marginBottom = '8px';

		new Setting(disclaimerDiv)
			.addButton((button) => {
				if (this.settingsController.settings.terms_accepted) {
					button
						.setButtonText('Paintress Sync is ready...')
						.setDisabled(true)
						.onClick(async () => {
							await this.settingsController.updateSettings({ terms_accepted: true });
							this.display();
						});
				} else {
					button.setButtonText('I understand, start sync').onClick(async () => {
						await this.settingsController.updateSettings({ terms_accepted: true });
						this.display();
					});
				}
			})
			.addExtraButton((button) =>
				button.setIcon('external-link').onClick(async () => {
					window.open('https://docs.paintress.com/sync/before-you-start');
				}),
			);

		const dangerDiv = containerEl.createDiv();
		dangerDiv.style.padding = '16px 0 0 0';
		dangerDiv.createEl('h2', { text: 'Danger Zone' });

		new Setting(dangerDiv)
			.setName('Reset sync counter')
			.setDesc('Reset local sync counter to initialize fresh sync')
			.addButton((button) => {
				button.setButtonText('Reset Sync').onClick(async () => {
					await this.settingsController.updateSettings({ last_synced_at: 0 });
				});
			});
	}

	private async testConnection() {
		this.testResult = {
			status: '',
			message: 'Testing...',
		};

		try {
			if (!this.settingsController.settings.api_host || !this.settingsController.settings.api_key) {
				this.testResult = {
					status: 'error',
					message: 'API host or key not configured',
				};
				return;
			}

			const repo = new Repo(this.settingsController.settings.api_host, this.settingsController.settings.api_key);

			const res = await repo.validateConfig();

			if (res?.success) {
				this.testResult = {
					status: 'success',
					message: 'Connected',
				};
			} else {
				this.testResult = {
					status: 'error',
					message: res.message,
				};
			}
		} catch (e) {
			this.testResult = {
				status: 'error',
				message: 'Failed to connect',
			};
		} finally {
			this.display();
		}
	}
}
