import { FileMetadata } from './fs';
import { reconcile } from 'reconcile-text';

export class ConflictResolver {
	canResolve(hostFile: FileMetadata, remoteFile: FileMetadata): boolean {
		// assuming both host file and remote file have same path
		return this.isTextBasedFile(hostFile);
	}

	resolve(hostFile: FileMetadata, remoteFile: FileMetadata, hostFileContent: string, remoteFileContent: string) {
		const oldFile = hostFile.updatedAt < remoteFile.updatedAt ? hostFileContent : remoteFileContent;
		const newFile = hostFile.updatedAt < remoteFile.updatedAt ? remoteFileContent : hostFileContent;

		return reconcile(oldFile, oldFile, newFile).text;
	}

	private getExtension(file: FileMetadata) {
		return file.path.split('.').pop();
	}

	private isTextBasedFile(file: FileMetadata) {
		return [
			'md',
			'txt',
			'json',
			'yaml',
			'yml',
			'toml',
			'ini',
			'conf',
			'cfg',
			'config',
			'properties',
			'env',
			'ini',
			'conf',
			'cfg',
			'config',
			'properties',
			'env',
		].includes(this.getExtension(file) ?? '');
	}
}
