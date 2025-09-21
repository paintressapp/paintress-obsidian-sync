import { Plugin } from 'obsidian';

export type FileHistory = {
	deletedAt: number;
};

type FileHistoryData = Record<string, FileHistory>;

export class LocalFileHistory {
	private filePath: string;
	private data: FileHistoryData = {};

	constructor(private plugin: Plugin) {
		this.filePath = '.obsidian/.paintress/file-history.json';

		this.plugin.app.vault.adapter.mkdir('.paintress');
		this.loadData();
	}

	private async loadData(): Promise<void> {
		try {
			const fileContent = await this.plugin.app.vault.adapter.read(this.filePath);
			this.data = JSON.parse(fileContent);
		} catch (error) {
			// File doesn't exist or is invalid, start with empty data
			this.data = {};
		}
	}

	private async saveData(): Promise<void> {
		try {
			const fileContent = JSON.stringify(this.data, null, 2);
			await this.plugin.app.vault.adapter.write(this.filePath, fileContent);
		} catch (error) {
			console.error('Failed to save file history:', error);
		}
	}

	async markFileAsDeleted(filePath: string, mtime: number, ctime: number): Promise<void> {
		this.data[filePath] = {
			deletedAt: Date.now(),
		};
		await this.saveData();
	}

	getAllDeletedFiles(): { path: string; deletedAt: number }[] {
		return Object.entries(this.data).map(([path, history]) => ({
			path,
			deletedAt: history.deletedAt,
		}));
	}

	async removeEntry(filePath: string): Promise<void> {
		delete this.data[filePath];
		await this.saveData();
	}
}
