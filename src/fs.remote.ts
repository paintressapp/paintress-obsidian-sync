import { FileMetadata, FileSystem } from './fs';
import { Repo } from './repo';
import { SettingsController } from './settings-controller';

export class RemoteFileSystem extends FileSystem {
	private files: (FileMetadata & { fileId: string })[] = [];

	constructor(private repo: Repo, private settings: SettingsController) {
		super();
	}

	async getFiles(): Promise<FileMetadata[]> {
		const arr = await this.repo.getSummary();

		this.files = arr.map((file) => ({
			fileId: file.file_id,
			path: file.file_path,
			size: file.file_size,
			createdAt: file.created_at,
			updatedAt: file.updated_at,
			deletedAt: file.deleted_at,
			deleted: file.deleted,
		}));

		return this.files;
	}

	getFileContent(path: string): Promise<ArrayBuffer> {
		const file = this.files.find((file) => file.path === path);

		if (!file) {
			throw new Error('File not found');
		}

		return this.repo.getFile(file.fileId);
	}

	async update(path: string, content: ArrayBuffer, previousUpdatedAt: number, newUpdatedAt: number): Promise<void> {
		console.log('[RemoteFileSystem] update: ', { path, previousUpdatedAt, newUpdatedAt });
		await this.repo.updateFile({ filePath: path, fileName: path, previousUpdatedAt, file: content, isDeleted: false, newUpdatedAt });
	}

	async remove(path: string, previousUpdatedAt: number): Promise<void> {
		await this.repo.updateFile({ filePath: path, fileName: path, previousUpdatedAt, isDeleted: true });
	}

	prune(): Promise<void> {
		throw new Error('Pruning is not supported for remote file system');
	}
}
