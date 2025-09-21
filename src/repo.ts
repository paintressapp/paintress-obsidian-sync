export class Repo {
	constructor(private host: string, private apiKey: string) {}

	private async getJSON<D extends object>(path: string, query: URLSearchParams | undefined = undefined) {
		const url = new URL(`${this.host}/api/v1/${path}`);

		if (query) {
			url.search = query.toString();
		}

		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: query ? JSON.stringify(query) : undefined,
		});

		return response.json() as Promise<D>;
	}

	private async postFormData<D extends object>(path: string, formData: FormData, headers: Record<string, string> = {}) {
		const url = new URL(`${this.host}/api/v1/${path}`);

		const response = await fetch(url, {
			method: 'POST',
			body: formData,
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				...headers,
			},
		});

		return response.json() as Promise<D>;
	}

	private async getRaw(path: string) {
		const url = new URL(`${this.host}/api/v1/${path}`);

		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
			},
		});

		return response.arrayBuffer();
	}

	async validateConfig() {
		try {
			return this.getJSON<{ success: boolean; message: string }>('ping');
		} catch (error) {
			return { success: false, message: 'Failed to validate config' };
		}
	}

	async getSummary() {
		const response = await this.getJSON<{
			files: {
				file_id: string;
				file_size: number;
				file_path: string;
				deleted: boolean;
				updated_at: number;
				deleted_at: number;
				created_at: number;
				s3_hash: string;
			}[];
		}>('fs/summary');

		return response.files;
	}

	async updateFile(opt: {
		filePath: string;
		fileName: string;
		isDeleted: boolean;
		file?: ArrayBuffer;
		previousUpdatedAt: number;
		newUpdatedAt?: number;
	}) {
		const formData = new FormData();

		if (opt.file) {
			formData.append('file', new File([opt.file], opt.fileName));
		}

		formData.set('filePath', opt.filePath);
		formData.set('fileName', opt.fileName);
		formData.set('isDeleted', opt.isDeleted.toString());
		formData.set('previousUpdatedAt', opt.previousUpdatedAt.toString());

		if (opt.newUpdatedAt) {
			formData.set('updatedAt', opt.newUpdatedAt.toString());
		}

		const response = await this.postFormData<{ success: boolean; message: string }>('fs', formData);

		return response;
	}

	async getFile(fileId: string) {
		const response = await this.getRaw(`fs/file/${fileId}`);

		return response;
	}
}
