export interface FileMetadata {
	path: string;
	size: number;
	createdAt: number;
	updatedAt: number;
	deletedAt: number;
	deleted: boolean;
}

export abstract class FileSystem {
	abstract getFiles(): Promise<FileMetadata[]>;
	abstract getFileContent(path: string): Promise<ArrayBuffer>;

	abstract remove(path: string, previousUpdatedAt: number): Promise<void>;
	abstract update(path: string, content: ArrayBuffer, previousUpdatedAt: number, newUpdatedAt: number): Promise<void>;
	abstract prune(path: string): Promise<void>;
}
