/**
 * Global test setup
 */

import { vi } from "vitest";

// Mock window.moment for VaultOperations
const momentMock = vi.fn((date?: string | Date) => {
	const d = date ? new Date(date) : new Date();
	return {
		format: (format: string) => {
			// Simple mock format implementation
			if (format === "YYYY-MM-DD") {
				return d.toISOString().split("T")[0];
			}
			if (format === "YYYY-[W]WW") {
				// Simple week number format
				const week = Math.ceil(
					(d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) /
						(7 * 24 * 60 * 60 * 1000),
				);
				return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
			}
			if (format === "YYYY-MM") {
				return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
			}
			if (format === "YYYY-[Q]Q") {
				const quarter = Math.ceil((d.getMonth() + 1) / 3);
				return `${d.getFullYear()}-Q${quarter}`;
			}
			if (format === "YYYY") {
				return String(d.getFullYear());
			}
			return d.toISOString();
		},
		toDate: () => d,
		valueOf: () => d.getTime(),
	};
});

global.window = {
	moment: momentMock,
} as any;
