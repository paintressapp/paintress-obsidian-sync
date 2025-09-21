import { FileMetadata } from './fs';
import { reconcile } from 'reconcile-text';
import { ConflictResolutionStrategy, SettingsController } from './settings-controller';
import { minimatch } from 'minimatch';

export class ConflictResolver {
	constructor(private settings: SettingsController) {}

	getResolutionStrategy(hostFile: FileMetadata, remoteFile: FileMetadata): ConflictResolutionStrategy {
		const matchedStrategy = this.settings.settings.resolution_strategies
			.flatMap((obj) => {
				const globs = obj.glob.split(',').map((glob) => glob.trim());
				return globs.map((glob) => ({ ...obj, glob }));
			})
			.find((strategy) => minimatch(hostFile.path, strategy.glob));

		const defaultStrategy = matchedStrategy?.strategy || this.settings.settings.fallback_conflict_resolution_strategy;

		// assuming both host file and remote file have same path
		return this.isTextBasedFile(hostFile) ? 'resolve' : defaultStrategy;
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
