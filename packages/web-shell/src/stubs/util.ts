/**
 * Stub for Node.js util module.
 */

export function promisify(fn: (...args: any[]) => any): (...args: any[]) => Promise<any> {
	return (...args: any[]) => {
		return new Promise((resolve, reject) => {
			fn(...args, (err: any, result: any) => {
				if (err) reject(err);
				else resolve(result);
			});
		});
	};
}

export function inspect(obj: any): string {
	return JSON.stringify(obj, null, 2);
}

export default { promisify, inspect };
