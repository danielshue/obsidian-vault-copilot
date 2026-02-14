/**
 * Stub for Node.js child_process module.
 * These functions are never called in the browser because supportsLocalProcesses() returns false.
 */

export class ChildProcess {
	pid = 0;
	stdin: any = null;
	stdout: any = null;
	stderr: any = null;
	kill() {}
	on() { return this; }
}

export function spawn(): ChildProcess {
	throw new Error("child_process.spawn is not available in the browser");
}

export function exec(): ChildProcess {
	throw new Error("child_process.exec is not available in the browser");
}

export function execFile(): ChildProcess {
	throw new Error("child_process.execFile is not available in the browser");
}
