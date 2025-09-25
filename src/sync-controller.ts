import { ConflictResolver } from './conflict-resolver';
import { FileMetadata, FileSystem } from './fs';
import { Crypto } from './crypto';
import { SettingsController } from './settings-controller';
import { minimatch } from 'minimatch';

interface SyncAction {
	hostFile: FileMetadata | null;
	remoteFile: FileMetadata | null;
	action: 'prune' | 'remove' | 'conflict' | 'push' | 'pull';
}

export class SyncController {
	private last_synced_at = 0;

	constructor(
		private host: FileSystem,
		private remote: FileSystem,
		private settings: SettingsController,
		private crypto: Crypto,
		private conflictResolver: ConflictResolver,
	) {}

	async sync() {
		this.last_synced_at = this.settings.settings.last_synced_at || 0;
		const now = Date.now();

		const excludePatterns = this.settings.settings.exclude_globs;
		// TODO: send last_synced_remote_status to server for query optimization
		const hostFiles = await this.host.getFiles();
		const remoteFiles = await this.remote.getFiles();

		const filteredRemoteFiles = remoteFiles.filter((file) => {
			if (
				this.isFileExcluded(
					file.path,
					excludePatterns
						.split('\n')
						.flatMap((pattern) => pattern.trim().split(','))
						.flatMap((pattern) => pattern.trim()),
				)
			) {
				return false;
			}

			return true;
		});

		const actions = await this.createSyncAction(hostFiles, filteredRemoteFiles);

		console.log('[SyncController] Current Status: ', { hostFiles, remoteFiles: filteredRemoteFiles });
		console.log('[SyncController] Last Synced At: ', { lastSyncedAt: this.last_synced_at, now });
		console.log('[SyncController] Created actions: ', actions);

		for (const action of actions) {
			await this.applySyncAction(action, now);
		}

		this.settings.updateSettings({ last_synced_at: now });
	}

	private createAction(hostFile: FileMetadata | null, remoteFile: FileMetadata | null, action: 'prune' | 'remove' | 'conflict' | 'push' | 'pull') {
		return {
			hostFile,
			remoteFile,
			action,
		};
	}

	private isFileExcluded(filePath: string, excludePatterns: string[]): boolean {
		if (!excludePatterns || excludePatterns.length === 0) {
			return false;
		}

		// Use minimatch to check if file matches any exclude pattern
		for (const pattern of excludePatterns) {
			if (pattern.trim() === '') continue;

			try {
				// Use minimatch with dot option to handle hidden files
				if (minimatch(filePath, pattern, { dot: true })) {
					return true;
				}
			} catch (error) {
				// Invalid pattern, skip it
				console.warn(`Invalid exclude pattern: ${pattern}`, error);
				continue;
			}
		}

		return false;
	}

	private async applySyncAction(action: SyncAction, now: number): Promise<void> {
		switch (action.action) {
			case 'prune': {
				if (action.hostFile) {
					await this.host.prune(action.hostFile.path);
				}
				break;
			}
			case 'remove': {
				// Always do remote first
				if (action.remoteFile) {
					await this.remote.remove(action.remoteFile.path, action.remoteFile.updatedAt, now);
				}

				if (action.hostFile) {
					await this.host.remove(action.hostFile.path, action.hostFile.updatedAt, now);
				}

				break;
			}
			case 'conflict': {
				if (action.hostFile && action.remoteFile) {
					const { resolutionStrategy, updatedData } = await this.handleConflict(action.hostFile, action.remoteFile);

					switch (resolutionStrategy) {
						case 'resolve': {
							if (updatedData) {
								// Always do remote first
								await this.remote.update(action.remoteFile.path, updatedData, action.remoteFile.updatedAt, now);
								await this.host.update(action.hostFile.path, updatedData, action.hostFile.updatedAt, now);
							}

							break;
						}
						case 'ignore': {
							break;
						}
						case 'latest': {
							const updatedAction = action.hostFile.updatedAt < action.remoteFile.updatedAt ? 'pull' : 'push';
							return this.applySyncAction(
								{
									...action,
									action: updatedAction,
								},
								now,
							);
						}
						case 'oldest': {
							const updatedAction = action.hostFile.updatedAt < action.remoteFile.updatedAt ? 'push' : 'pull';
							return this.applySyncAction(
								{
									...action,
									action: updatedAction,
								},
								now,
							);
						}
						case 'always-pull': {
							return this.applySyncAction(
								{
									...action,
									action: 'pull',
								},
								now,
							);
						}
						case 'always-push': {
							return this.applySyncAction(
								{
									...action,
									action: 'push',
								},
								now,
							);
						}
						default: {
							throw new Error(`Invalid resolution strategy: ${resolutionStrategy}`);
						}
					}
				}
				break;
			}
			case 'push': {
				if (action.hostFile) {
					await this.remote.update(
						action.hostFile.path,
						await this.host.getFileContent(action.hostFile.path),
						action.remoteFile ? action.remoteFile.updatedAt : action.hostFile.updatedAt,
						action.hostFile.updatedAt,
					);
				}
				break;
			}
			case 'pull': {
				if (action.remoteFile) {
					await this.host.update(
						action.remoteFile.path,
						await this.remote.getFileContent(action.remoteFile.path),
						action?.hostFile ? action.hostFile.updatedAt : action.remoteFile.updatedAt,
						action.remoteFile.updatedAt,
					);
				}
				break;
			}
		}
	}

	private async createSyncAction(hostFiles: FileMetadata[], remoteFiles: FileMetadata[]): Promise<SyncAction[]> {
		const objMap = new Map<string, SyncAction>();

		const set = (key: string, value: SyncAction) => {
			if (objMap.has(key)) {
				return;
			}

			objMap.set(key, value);
		};

		// Apply remote deletions
		const remoteDeletedFiles = remoteFiles.filter((file) => file.deleted);

		for (const remoteDeletedFile of remoteDeletedFiles) {
			const hostFile = this.getFile(hostFiles, remoteDeletedFile.path);

			if (hostFile) {
				if (hostFile.deleted) {
					set(hostFile.path, this.createAction(hostFile, remoteDeletedFile, 'prune'));
				} else if (hostFile.createdAt < remoteDeletedFile.deletedAt) {
					set(hostFile.path, this.createAction(hostFile, remoteDeletedFile, 'remove'));
				} else {
					set(hostFile.path, this.createAction(hostFile, remoteDeletedFile, 'push'));
				}
			} else {
				// DO-NOT prune remote, it will affect other hosts
				// await this.remote.prune(remoteDeletedFile.path);
			}
		}

		// Apply host deletions
		const hostDeletedFiles = hostFiles.filter((file) => file.deleted);

		for (const hostDeletedFile of hostDeletedFiles) {
			const remoteFile = this.getFile(remoteFiles, hostDeletedFile.path);

			if (remoteFile) {
				if (remoteFile.deleted) {
					// 01
					// DO-NOT prune remote, it will affect other hosts
					// await this.remote.prune(remoteFile.path);
				} else if (remoteFile.createdAt < hostDeletedFile.deletedAt) {
					//04
					set(remoteFile.path, this.createAction(hostDeletedFile, remoteFile, 'remove'));
				} else {
					//05, 03
					set(hostDeletedFile.path, this.createAction(hostDeletedFile, remoteFile, 'pull'));
				}
			} else {
				set(hostDeletedFile.path, this.createAction(hostDeletedFile, null, 'prune'));
			}
		}

		const hostModifiedFiles = hostFiles.filter((file) => !file.deleted);

		for (const hostModifiedFile of hostModifiedFiles) {
			const remoteFile = this.getFile(remoteFiles, hostModifiedFile.path);

			// push -> no remote, or remote is last updated before sync
			if (!remoteFile || remoteFile.updatedAt < hostModifiedFile.updatedAt) {
				console.log('[SyncController] Push: ', { hostModifiedFile, remoteFile, lastSyncedAt: this.last_synced_at });
				set(hostModifiedFile.path, this.createAction(hostModifiedFile, remoteFile || null, 'push'));
			} else if (remoteFile.updatedAt > this.last_synced_at) {
				console.log('[SyncController] Conflict: ', { hostModifiedFile, remoteFile, lastSyncedAt: this.last_synced_at });
				set(hostModifiedFile.path, this.createAction(hostModifiedFile, remoteFile, 'conflict'));
			}
		}

		const remoteModifiedFiles = remoteFiles.filter((file) => !file.deleted);

		for (const remoteModifiedFile of remoteModifiedFiles) {
			const hostFile = this.getFile(hostFiles, remoteModifiedFile.path);

			if (!hostFile || hostFile.updatedAt < remoteModifiedFile.updatedAt) {
				// pull -> no host, or host is last updated before sync
				console.log('[SyncController] Pull: ', { hostFile, remoteModifiedFile, lastSyncedAt: this.last_synced_at });
				set(remoteModifiedFile.path, this.createAction(hostFile || null, remoteModifiedFile, 'pull'));
			} else if (hostFile.updatedAt > this.last_synced_at) {
				// conflict -> host is last updated after sync
				console.log('[SyncController] Conflict: ', { hostFile, remoteModifiedFile, lastSyncedAt: this.last_synced_at });
				set(remoteModifiedFile.path, this.createAction(hostFile, remoteModifiedFile, 'conflict'));
			}
		}

		return Array.from(objMap.values());
	}

	private async handleConflict(hostFile: FileMetadata, remoteFile: FileMetadata) {
		const hostFileData = await this.crypto.decrypt(await this.host.getFileContent(hostFile.path));
		const remoteFileData = await this.crypto.decrypt(await this.remote.getFileContent(remoteFile.path));

		const hostFileDataString = await this.crypto.bufferToString(hostFileData);
		const remoteFileDataString = await this.crypto.bufferToString(remoteFileData);

		const resolutionStrategy = this.conflictResolver.getResolutionStrategy(hostFile, remoteFile);

		if (resolutionStrategy === 'resolve') {
			const resolvedData = this.conflictResolver.resolve(hostFile, remoteFile, hostFileDataString, remoteFileDataString);

			return {
				resolutionStrategy,
				updatedData: await this.crypto.encrypt(await this.crypto.stringToBuffer(resolvedData)),
			};
		}

		return {
			resolutionStrategy,
			updatedData: null,
		};
	}

	private getFile(files: FileMetadata[], path: string) {
		return files.find((file) => file.path === path);
	}
}
