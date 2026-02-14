/**
 * VaultAdapter (FileSystemAdapter) backed by the browser File System Access API.
 *
 * Provides the `vault.adapter` interface: read/write/exists/getBasePath
 * for path-based operations. Also exported as `FileSystemAdapter` for
 * instanceof checks in existing plugin code.
 */

export class VaultAdapter {
	private _rootHandle: FileSystemDirectoryHandle;
	/** Public basePath matching Obsidian's FileSystemAdapter.basePath. */
	basePath: string;

	constructor(rootHandle: FileSystemDirectoryHandle) {
		this._rootHandle = rootHandle;
		this.basePath = rootHandle.name;
	}

	/** Returns the root directory name (no absolute path in browser). */
	getBasePath(): string {
		return this.basePath;
	}

	/**
	 * Navigate to a directory handle for the given path segments.
	 * Creates intermediate directories if `create` is true.
	 */
	async _getDirHandle(
		segments: string[],
		create = false,
	): Promise<FileSystemDirectoryHandle> {
		let handle = this._rootHandle;
		for (const seg of segments) {
			handle = await handle.getDirectoryHandle(seg, { create });
		}
		return handle;
	}

	/** Get a file handle by vault-relative path. */
	async _getFileHandle(
		path: string,
		create = false,
	): Promise<FileSystemFileHandle> {
		const parts = path.split("/").filter(Boolean);
		const fileName = parts.pop();
		if (!fileName) throw new Error(`Invalid path: ${path}`);
		const dirHandle = await this._getDirHandle(parts, create);
		return dirHandle.getFileHandle(fileName, { create });
	}

	/** Read file contents as text. */
	async read(path: string): Promise<string> {
		const handle = await this._getFileHandle(path);
		const file = await handle.getFile();
		return file.text();
	}

	/** Write text content to a file (creates if needed). */
	async write(path: string, content: string): Promise<void> {
		const handle = await this._getFileHandle(path, true);
		const writable = await handle.createWritable();
		await writable.write(content);
		await writable.close();
	}

	/** Check whether a file or directory exists at the given path. */
	async exists(path: string): Promise<boolean> {
		const parts = path.split("/").filter(Boolean);
		if (parts.length === 0) return true; // root always exists
		try {
			// Try as file first
			const fileName = parts[parts.length - 1]!;
			const dirParts = parts.slice(0, -1);
			const dirHandle = await this._getDirHandle(dirParts);
			try {
				await dirHandle.getFileHandle(fileName);
				return true;
			} catch {
				// Try as directory
				await dirHandle.getDirectoryHandle(fileName);
				return true;
			}
		} catch {
			return false;
		}
	}

	/** Remove a file or directory entry. */
	async remove(path: string, recursive = false): Promise<void> {
		const parts = path.split("/").filter(Boolean);
		const name = parts.pop();
		if (!name) throw new Error(`Cannot remove root`);
		const parentHandle = await this._getDirHandle(parts);
		await parentHandle.removeEntry(name, { recursive });
	}

	/** Create a directory (and parents) at the given path. */
	async mkdir(path: string): Promise<void> {
		const parts = path.split("/").filter(Boolean);
		await this._getDirHandle(parts, true);
	}

	/** List entries in a directory. Returns {name, kind} pairs. */
	async list(
		path: string,
	): Promise<Array<{ name: string; kind: "file" | "directory" }>> {
		const parts = path.split("/").filter(Boolean);
		const handle = await this._getDirHandle(parts);
		const entries: Array<{ name: string; kind: "file" | "directory" }> = [];
		for await (const [name, entryHandle] of (handle as any).entries()) {
			entries.push({ name, kind: entryHandle.kind });
		}
		return entries;
	}

	/** Get the root directory handle. */
	getRootHandle(): FileSystemDirectoryHandle {
		return this._rootHandle;
	}
}

/**
 * Alias so that `instanceof FileSystemAdapter` checks in the plugin
 * code resolve to this class.
 */
export { VaultAdapter as FileSystemAdapter };
