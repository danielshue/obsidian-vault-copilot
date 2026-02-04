import { describe, it, expect, beforeEach, vi } from "vitest";
import { SecretStorage, getOpenAIApiKey, getAzureOpenAIApiKey } from "../../utils/secretStorage";
import { Plugin } from "obsidian";

describe("SecretStorage", () => {
	let mockPlugin: Plugin;
	let secretStorage: SecretStorage;
	let mockData: Record<string, unknown>;

	beforeEach(() => {
		mockData = {};

		mockPlugin = {
			loadData: vi.fn(async () => mockData),
			saveData: vi.fn(async (data: unknown) => {
				mockData = data as Record<string, unknown>;
			}),
		} as unknown as Plugin;

		secretStorage = new SecretStorage(mockPlugin);
	});

	describe("initialize", () => {
		it("should load existing secrets from plugin data", async () => {
			mockData = {
				secrets: {
					secret_test_key: "test_value",
				},
			};

			await secretStorage.initialize();

			const value = await secretStorage.getApiKey("test_key");
			expect(value).toBe("test_value");
		});

		it("should handle missing secrets data", async () => {
			mockData = {};

			await secretStorage.initialize();

			const value = await secretStorage.getApiKey("test_key");
			expect(value).toBeNull();
		});
	});

	describe("setApiKey", () => {
		it("should store an API key", async () => {
			await secretStorage.initialize();
			await secretStorage.setApiKey("my_key", "my_value");

			expect(mockPlugin.saveData).toHaveBeenCalled();
			const savedData = mockData as { secrets: Record<string, string> };
			expect(savedData.secrets.secret_my_key).toBe("my_value");
		});

		it("should overwrite existing key", async () => {
			await secretStorage.initialize();
			await secretStorage.setApiKey("my_key", "old_value");
			await secretStorage.setApiKey("my_key", "new_value");

			const value = await secretStorage.getApiKey("my_key");
			expect(value).toBe("new_value");
		});
	});

	describe("getApiKey", () => {
		it("should retrieve stored API key", async () => {
			await secretStorage.initialize();
			await secretStorage.setApiKey("my_key", "my_value");

			const value = await secretStorage.getApiKey("my_key");
			expect(value).toBe("my_value");
		});

		it("should return null if key not found", async () => {
			await secretStorage.initialize();

			const value = await secretStorage.getApiKey("nonexistent");
			expect(value).toBeNull();
		});
	});

	describe("deleteApiKey", () => {
		it("should delete an API key", async () => {
			await secretStorage.initialize();
			await secretStorage.setApiKey("my_key", "my_value");

			await secretStorage.deleteApiKey("my_key");

			const value = await secretStorage.getApiKey("my_key");
			expect(value).toBeNull();
		});
	});

	describe("hasStoredKey", () => {
		it("should return true if key exists in storage", async () => {
			await secretStorage.initialize();
			await secretStorage.setApiKey("my_key", "my_value");

			expect(secretStorage.hasStoredKey("my_key")).toBe(true);
		});

		it("should return false if key does not exist", async () => {
			await secretStorage.initialize();

			expect(secretStorage.hasStoredKey("nonexistent")).toBe(false);
		});
	});

	describe("migrateFromPlainText", () => {
		it("should migrate plain text value to storage", async () => {
			await secretStorage.initialize();
			await secretStorage.migrateFromPlainText("migrated_key", "plain_value");

			const value = await secretStorage.getApiKey("migrated_key");
			expect(value).toBe("plain_value");
		});

		it("should trim whitespace during migration", async () => {
			await secretStorage.initialize();
			await secretStorage.migrateFromPlainText("migrated_key", "  plain_value  ");

			const value = await secretStorage.getApiKey("migrated_key");
			expect(value).toBe("plain_value");
		});

		it("should not store empty values", async () => {
			await secretStorage.initialize();
			await secretStorage.migrateFromPlainText("migrated_key", "");

			expect(secretStorage.hasStoredKey("migrated_key")).toBe(false);
		});
	});
});

describe("Helper Functions", () => {
	let mockPlugin: Plugin;
	let secretStorage: SecretStorage;
	let mockData: Record<string, unknown>;

	beforeEach(() => {
		mockData = {};

		mockPlugin = {
			loadData: vi.fn(async () => mockData),
			saveData: vi.fn(async (data: unknown) => {
				mockData = data as Record<string, unknown>;
			}),
		} as unknown as Plugin;

		secretStorage = new SecretStorage(mockPlugin);
	});

	describe("getOpenAIApiKey", () => {
		it("should prioritize config key", async () => {
			await secretStorage.initialize();
			await secretStorage.setApiKey("openai_api_key", "stored_key");

			const key = await getOpenAIApiKey(secretStorage, "config_key");
			expect(key).toBe("config_key");
		});

		it("should use stored key if config is empty", async () => {
			await secretStorage.initialize();
			await secretStorage.setApiKey("openai_api_key", "stored_key");

			const key = await getOpenAIApiKey(secretStorage, "");
			expect(key).toBe("stored_key");
		});

		it("should return undefined if no key found", async () => {
			await secretStorage.initialize();

			const key = await getOpenAIApiKey(secretStorage);
			expect(key).toBeUndefined();
		});
	});

	describe("getAzureOpenAIApiKey", () => {
		it("should prioritize config key", async () => {
			await secretStorage.initialize();
			await secretStorage.setApiKey("azure_openai_api_key", "stored_key");

			const key = await getAzureOpenAIApiKey(secretStorage, "config_key");
			expect(key).toBe("config_key");
		});

		it("should use stored key if config is empty", async () => {
			await secretStorage.initialize();
			await secretStorage.setApiKey("azure_openai_api_key", "stored_key");

			const key = await getAzureOpenAIApiKey(secretStorage, "");
			expect(key).toBe("stored_key");
		});

		it("should return undefined if no key found", async () => {
			await secretStorage.initialize();

			const key = await getAzureOpenAIApiKey(secretStorage);
			expect(key).toBeUndefined();
		});
	});
});
