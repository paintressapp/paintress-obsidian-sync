import { ConflictResolver } from './conflict-resolver';
import { FileMetadata, FileSystem } from './fs';
import { Crypto } from './crypto';
import { SettingsController } from './settings-controller';

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
		// TODO: send last_synced_remote_status to server for query optimization
		const hostFiles = await this.host.getFiles();
		const remoteFiles = await this.remote.getFiles();

		const actions = await this.createSyncAction(hostFiles, remoteFiles);

		console.log('[SyncController] Current Status: ', { hostFiles, remoteFiles });
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

	private async applySyncAction(action: SyncAction, now: number) {
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
					await this.remote.remove(action.remoteFile.path, action.remoteFile.updatedAt);
				}

				if (action.hostFile) {
					await this.host.remove(action.hostFile.path, action.hostFile.updatedAt);
				}

				break;
			}
			case 'conflict': {
				if (action.hostFile && action.remoteFile) {
					const updatedData = await this.handleConflict(action.hostFile, action.remoteFile);

					if (updatedData) {
						// Always do remote first
						await this.remote.update(action.remoteFile.path, updatedData, action.remoteFile.updatedAt, now);
						await this.host.update(action.hostFile.path, updatedData, action.hostFile.updatedAt, now);
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

		// Apply remote deletions
		const remoteDeletedFiles = remoteFiles.filter((file) => file.deleted);

		for (const remoteDeletedFile of remoteDeletedFiles) {
			const hostFile = this.getFile(hostFiles, remoteDeletedFile.path);

			if (hostFile) {
				if (hostFile.deleted) {
					objMap.set(hostFile.path, this.createAction(hostFile, remoteDeletedFile, 'prune'));
				} else if (hostFile.createdAt < remoteDeletedFile.deletedAt) {
					objMap.set(hostFile.path, this.createAction(hostFile, remoteDeletedFile, 'remove'));
				} else {
					objMap.set(hostFile.path, this.createAction(hostFile, remoteDeletedFile, 'push'));
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
					objMap.set(remoteFile.path, this.createAction(hostDeletedFile, remoteFile, 'remove'));
				} else {
					//05, 03
					objMap.set(hostDeletedFile.path, this.createAction(hostDeletedFile, remoteFile, 'pull'));
				}
			} else {
				objMap.set(hostDeletedFile.path, this.createAction(hostDeletedFile, null, 'prune'));
			}
		}

		const hostModifiedFiles = hostFiles.filter((file) => !file.deleted && file.updatedAt > this.last_synced_at);

		for (const hostModifiedFile of hostModifiedFiles) {
			const remoteFile = this.getFile(remoteFiles, hostModifiedFile.path);

			// push -> no remote, or remote is last updated before sync
			if (!remoteFile || remoteFile.updatedAt < this.last_synced_at) {
				console.log('[SyncController] Push: ', { hostModifiedFile, remoteFile, lastSyncedAt: this.last_synced_at });
				objMap.set(hostModifiedFile.path, this.createAction(hostModifiedFile, remoteFile || null, 'push'));
			} else if (remoteFile.updatedAt > this.last_synced_at) {
				console.log('[SyncController] Conflict: ', { hostModifiedFile, remoteFile, lastSyncedAt: this.last_synced_at });
				objMap.set(hostModifiedFile.path, this.createAction(hostModifiedFile, remoteFile, 'conflict'));
			}
		}

		const remoteModifiedFiles = remoteFiles.filter((file) => !file.deleted && file.updatedAt > this.last_synced_at);

		for (const remoteModifiedFile of remoteModifiedFiles) {
			const hostFile = this.getFile(hostFiles, remoteModifiedFile.path);

			if (!hostFile || hostFile.updatedAt < this.last_synced_at) {
				// pull -> no host, or host is last updated before sync
				console.log('[SyncController] Pull: ', { hostFile, remoteModifiedFile, lastSyncedAt: this.last_synced_at });
				objMap.set(remoteModifiedFile.path, this.createAction(hostFile || null, remoteModifiedFile, 'pull'));
			} else if (hostFile.updatedAt > this.last_synced_at) {
				// conflict -> host is last updated after sync
				console.log('[SyncController] Conflict: ', { hostFile, remoteModifiedFile, lastSyncedAt: this.last_synced_at });
				objMap.set(remoteModifiedFile.path, this.createAction(hostFile, remoteModifiedFile, 'conflict'));
			}
		}

		return Array.from(objMap.values());
	}

	private async handleConflict(hostFile: FileMetadata, remoteFile: FileMetadata) {
		const hostFileData = await this.crypto.decrypt(await this.host.getFileContent(hostFile.path));
		const remoteFileData = await this.crypto.decrypt(await this.remote.getFileContent(remoteFile.path));

		const hostFileDataString = await this.crypto.bufferToString(hostFileData);
		const remoteFileDataString = await this.crypto.bufferToString(remoteFileData);

		if (this.conflictResolver.canResolve(hostFile, remoteFile)) {
			const resolvedData = this.conflictResolver.resolve(hostFile, remoteFile, hostFileDataString, remoteFileDataString);

			return this.crypto.encrypt(await this.crypto.stringToBuffer(resolvedData));
		}

		return null;
	}

	private getFile(files: FileMetadata[], path: string) {
		return files.find((file) => file.path === path);
	}
}
