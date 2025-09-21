import { Repo } from 'src/repo';

type ConnectionChangeCallback = (isConnected: boolean) => void;

export class ConnectionMonitor {
	private isConnected: boolean;
	private listeners: ConnectionChangeCallback[];

	constructor(private repo: Repo) {
		this.isConnected = true;
		this.listeners = [];
	}

	async startMonitoring(interval: number = 20000): Promise<void> {
		setInterval(async () => {
			const wasConnected = this.isConnected;
			this.isConnected = (await this.repo.validateConfig())?.success ?? false;

			if (wasConnected !== this.isConnected) {
				this.notifyListeners();
			}
		}, interval);
	}

	onConnectionChange(callback: ConnectionChangeCallback): void {
		this.listeners.push(callback);
	}

	private notifyListeners(): void {
		this.listeners.forEach((callback) => callback(this.isConnected));
	}
}
