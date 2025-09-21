import { SettingsController } from './settings-controller';

export class PasswordCrypto {
	private readonly algorithm: string = 'AES-GCM';
	private readonly keyLength: number = 256;
	private readonly ivLength: number = 12; // 96 bits for GCM
	private readonly saltLength: number = 16; // 128 bits
	private readonly iterations: number = 100000; // PBKDF2 iterations

	constructor() {}

	// Generate a random salt
	generateSalt(): Uint8Array {
		return crypto.getRandomValues(new Uint8Array(this.saltLength));
	}

	// Generate a random initialization vector
	generateIV(): Uint8Array {
		return crypto.getRandomValues(new Uint8Array(this.ivLength));
	}

	// Derive a key from password using PBKDF2
	async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
		const encoder = new TextEncoder();
		const passwordBuffer = encoder.encode(password);

		// Import password as key material
		const keyMaterial = await crypto.subtle.importKey('raw', passwordBuffer, { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']);

		// Derive the actual encryption key
		return crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: salt.buffer as ArrayBuffer,
				iterations: this.iterations,
				hash: 'SHA-256',
			},
			keyMaterial,
			{
				name: this.algorithm,
				length: this.keyLength,
			},
			false,
			['encrypt', 'decrypt'],
		);
	}

	// Encrypt a buffer with a password
	async encryptBuffer(buffer: ArrayBuffer, password: string): Promise<ArrayBuffer> {
		const salt = this.generateSalt();
		const iv = this.generateIV();
		const key = await this.deriveKey(password, salt);

		// Encrypt the buffer
		const encryptedData = await crypto.subtle.encrypt(
			{
				name: this.algorithm,
				iv: iv.buffer as ArrayBuffer,
			},
			key,
			buffer,
		);

		// Combine salt, iv, and encrypted data into a single buffer
		const result = new Uint8Array(this.saltLength + this.ivLength + encryptedData.byteLength);

		result.set(salt, 0);
		result.set(iv, this.saltLength);
		result.set(new Uint8Array(encryptedData), this.saltLength + this.ivLength);

		return result.buffer;
	}

	// Decrypt a buffer with a password
	async decryptBuffer(encryptedBuffer: ArrayBuffer, password: string): Promise<ArrayBuffer> {
		const data = new Uint8Array(encryptedBuffer);

		// Extract salt, iv, and encrypted data
		const salt = data.slice(0, this.saltLength);
		const iv = data.slice(this.saltLength, this.saltLength + this.ivLength);
		const encryptedData = data.slice(this.saltLength + this.ivLength);

		// Derive the same key using the extracted salt
		const key = await this.deriveKey(password, salt);

		// Decrypt the data
		const decryptedData = await crypto.subtle.decrypt(
			{
				name: this.algorithm,
				iv: iv.buffer as ArrayBuffer,
			},
			key,
			encryptedData,
		);

		return decryptedData;
	}

	// Helper method to convert string to buffer
	stringToBuffer(str: string): ArrayBuffer {
		const encoder = new TextEncoder();
		return encoder.encode(str).buffer;
	}

	// Helper method to convert buffer to string
	bufferToString(buffer: ArrayBuffer): string {
		const decoder = new TextDecoder();
		return decoder.decode(buffer);
	}

	// Helper method to convert buffer to base64 string (for storage/transmission)
	bufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
		return btoa(binary);
	}

	// Helper method to convert base64 string back to buffer
	base64ToBuffer(base64: string): ArrayBuffer {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}
}

export class Crypto {
	private passwordCrypto: PasswordCrypto;

	constructor(private settingsController: SettingsController) {
		this.passwordCrypto = new PasswordCrypto();
	}

	private getEncryptionKey(): string {
		const key = this.settingsController.settings.encryption_key;

		return key || '';
	}

	async encrypt(data: ArrayBuffer): Promise<ArrayBuffer> {
		const password = this.getEncryptionKey();

		if (!password) {
			return data;
		}

		const encryptedBuffer = await this.passwordCrypto.encryptBuffer(data, password);
		return encryptedBuffer;
	}

	async decrypt(encryptedData: ArrayBuffer): Promise<ArrayBuffer> {
		const password = this.getEncryptionKey();

		if (!password) {
			return encryptedData;
		}

		const decryptedBuffer = await this.passwordCrypto.decryptBuffer(encryptedData, password);
		return decryptedBuffer;
	}

	async stringToBuffer(str: string): Promise<ArrayBuffer> {
		return this.passwordCrypto.stringToBuffer(str);
	}

	async bufferToString(buffer: ArrayBuffer): Promise<string> {
		return this.passwordCrypto.bufferToString(buffer);
	}
}
