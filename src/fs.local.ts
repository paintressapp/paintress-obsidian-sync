import { Plugin, TFile, TFolder, Vault } from 'obsidian';
import { FileSystem, FileMetadata } from './fs';
import { Key, open, RootDatabase } from 'lmdb';
import { LocalFileHistory } from './fs.local.file-history';
import { SettingsController } from './settings-controller';
import { minimatch } from 'minimatch';

export class LocalFileSystem extends FileSystem {
	deleteToWhere: 'obsidian' | 'system' = 'obsidian';
	vault: Vault;
	kind: 'local' = 'local';

	db: RootDatabase<any, Key>;

	constructor(
		private plugin: Plugin,
		private settings: SettingsController,
		private history: LocalFileHistory,
		deleteToWhere: 'obsidian' | 'system' = 'obsidian',
	) {
		super();
		this.deleteToWhere = deleteToWhere;
		this.vault = plugin.app.vault;
	}

	async getFiles(): Promise<FileMetadata[]> {
		const arr = await this.walk();
		const deletedFiles = this.history.getAllDeletedFiles();

		const filteredDeletedFiles = deletedFiles
			.filter((file) => !arr.some((arrFile) => arrFile.path === file.path))
			.map((file) => ({
				...file,
				deleted: true,
				size: 0,
				createdAt: file.deletedAt,
				updatedAt: file.deletedAt,
			}));

		if (!this.settings.settings.sync_internal_files) {
			return [...arr, ...filteredDeletedFiles];
		}

		const internalFiles = await this.walkInternalFiles('.obsidian');

		return [...arr, ...filteredDeletedFiles, ...internalFiles];
	}

	async getFileContent(path: string): Promise<ArrayBuffer> {
		return await this.readFile(path);
	}

	async update(path: string, content: ArrayBuffer, previousUpdatedAt: number, newUpdatedAt: number): Promise<void> {
		const parentDir = path.substring(0, path.lastIndexOf('/'));
		if (parentDir && parentDir.length > 0) {
			await this.mkdirpInVault(parentDir);
		}

		const buffer = content;
		const { ctime, mtime } = await this.getFileStats(path);

		if (mtime !== 0 && mtime !== previousUpdatedAt) {
			console.log({ mtime, previousUpdatedAt, newUpdatedAt });
			throw new Error('File has been modified since last sync');
		}

		await this.writeFile(path, buffer, newUpdatedAt, ctime || newUpdatedAt);
	}

	async remove(path: string, previousUpdatedAt: number): Promise<void> {
		const { ctime, mtime } = await this.getFileStats(path);

		if (mtime !== 0 && mtime !== previousUpdatedAt) {
			throw new Error('File has been modified since last sync');
		}

		if (this.deleteToWhere === 'obsidian') {
			await this.vault.adapter.trashLocal(path);
		} else {
			if (!(await this.vault.adapter.trashSystem(path))) {
				await this.vault.adapter.trashLocal(path);
			}
		}
	}

	private async mkdirpInVault(path: string): Promise<void> {
		const pathParts = path.split('/').filter((part) => part.length > 0);
		let currentPath = '';

		for (const part of pathParts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			const exists = this.vault.getAbstractFileByPath(currentPath);
			if (!exists) {
				await this.vault.createFolder(currentPath);
			}
		}
	}

	private async walkInternalFiles(folder: string): Promise<FileMetadata[]> {
		const arr: FileMetadata[] = [];
		const excludePatterns = this.settings.settings.exclude_globs;

		const files = await this.plugin.app.vault.adapter.list(folder);

		for (const file of files.files) {
			const entry = await this.plugin.app.vault.adapter.stat(file);

			if (
				this.isFileExcluded(
					file,
					excludePatterns
						.split('\n')
						.flatMap((pattern) => pattern.trim().split(','))
						.flatMap((pattern) => pattern.trim()),
				)
			) {
				continue;
			}

			arr.push({
				path: file,
				size: entry?.size ?? 0,
				createdAt: new Date(entry?.ctime ?? 0).getTime(),
				updatedAt: new Date(entry?.mtime ?? 0).getTime(),
				deletedAt: new Date(entry?.mtime ?? 0).getTime(),
				deleted: false,
			});
		}

		for (const childFolder of files.folders) {
			arr.push(...(await this.walkInternalFiles(childFolder)));
		}

		return arr;
	}

	private async walk(): Promise<FileMetadata[]> {
		const files: FileMetadata[] = [];
		const localTAbstractFiles = this.vault.getAllLoadedFiles();
		const excludePatterns = this.settings.settings.exclude_globs;

		for (const entry of localTAbstractFiles) {
			if (entry.path === '/' || entry.path === '' || entry instanceof TFolder) {
				continue;
			}

			if (entry instanceof TFile) {
				let path = entry.path;
				if (path.startsWith('/')) {
					path = path.slice(1);
				}

				// Check if file should be excluded based on glob patterns
				if (
					this.isFileExcluded(
						path,
						excludePatterns
							.split('\n')
							.flatMap((pattern) => pattern.trim().split(','))
							.flatMap((pattern) => pattern.trim()),
					)
				) {
					continue;
				}

				files.push({
					path: path,
					size: entry.stat.size,
					createdAt: new Date(entry.stat.ctime).getTime(),
					updatedAt: new Date(entry.stat.mtime).getTime(),
					deletedAt: new Date(entry.stat.mtime).getTime(),
					deleted: false,
				});
			}
		}

		return files;
	}

	private async writeFile(path: string, content: ArrayBuffer, mtime: number, ctime: number): Promise<void> {
		await this.vault.adapter.writeBinary(path, content, {
			mtime: mtime,
			ctime: ctime,
		});
	}

	private async readFile(path: string): Promise<ArrayBuffer> {
		return await this.vault.adapter.readBinary(path);
	}

	private async getFileStats(path: string): Promise<{ mtime: number; ctime: number }> {
		const file = this.vault.getAbstractFileByPath(path);

		if (file && file instanceof TFile) {
			return { mtime: file.stat.mtime, ctime: file.stat.ctime };
		}

		return { mtime: 0, ctime: 0 };
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

	async prune(path: string): Promise<void> {
		await this.history.removeEntry(path);
	}
}
