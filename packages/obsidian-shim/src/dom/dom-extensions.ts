/**
 * DOM prototype extensions that replicate Obsidian's augmented HTMLElement API.
 *
 * Obsidian adds convenience methods like createDiv, createEl, createSpan,
 * empty, addClass, removeClass, and setText to HTMLElement.prototype.
 * This module installs those same methods so existing plugin code works
 * unchanged in the web shim environment.
 *
 * Call {@link initDomExtensions} once at startup before any plugin code runs.
 */

export interface DomElementInfo {
	cls?: string | string[];
	text?: string;
	attr?: Record<string, string>;
	title?: string;
	placeholder?: string;
	type?: string;
	value?: string;
	href?: string;
	prepend?: boolean;
	parent?: HTMLElement;
}

function applyOptions(el: HTMLElement, options?: DomElementInfo | string): void {
	if (!options) return;
	if (typeof options === "string") {
		el.className = options;
		return;
	}
	if (options.cls) {
		if (Array.isArray(options.cls)) {
			el.classList.add(...options.cls);
		} else {
			el.className = options.cls;
		}
	}
	if (options.text) {
		el.textContent = options.text;
	}
	if (options.title) {
		el.setAttribute("title", options.title);
	}
	if (options.attr) {
		for (const [key, val] of Object.entries(options.attr)) {
			el.setAttribute(key, val);
		}
	}
	if (options.placeholder && el instanceof HTMLInputElement) {
		el.placeholder = options.placeholder;
	}
	if (options.type && el instanceof HTMLInputElement) {
		el.type = options.type;
	}
	if (options.value) {
		if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
			el.value = options.value;
		}
	}
	if (options.href && el instanceof HTMLAnchorElement) {
		el.href = options.href;
	}
}

/**
 * Install Obsidian-compatible DOM helper methods on HTMLElement.prototype.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function initDomExtensions(): void {
	if ((HTMLElement.prototype as any).__shimInstalled) return;
	(HTMLElement.prototype as any).__shimInstalled = true;

	HTMLElement.prototype.createDiv = function (
		this: HTMLElement,
		options?: DomElementInfo | string,
	): HTMLDivElement {
		const div = document.createElement("div");
		applyOptions(div, options);
		if (options && typeof options === "object" && options.prepend) {
			this.prepend(div);
		} else {
			this.appendChild(div);
		}
		return div;
	};

	HTMLElement.prototype.createSpan = function (
		this: HTMLElement,
		options?: DomElementInfo | string,
	): HTMLSpanElement {
		const span = document.createElement("span");
		applyOptions(span, options);
		if (options && typeof options === "object" && options.prepend) {
			this.prepend(span);
		} else {
			this.appendChild(span);
		}
		return span;
	};

	HTMLElement.prototype.createEl = function (
		this: HTMLElement,
		tag: string,
		options?: DomElementInfo | string,
	): HTMLElement {
		const el = document.createElement(tag);
		applyOptions(el, options);
		if (options && typeof options === "object" && options.prepend) {
			this.prepend(el);
		} else {
			this.appendChild(el);
		}
		return el;
	};

	HTMLElement.prototype.empty = function (this: HTMLElement): void {
		while (this.firstChild) {
			this.removeChild(this.firstChild);
		}
	};

	HTMLElement.prototype.addClass = function (
		this: HTMLElement,
		...cls: string[]
	): void {
		this.classList.add(...cls);
	};

	HTMLElement.prototype.removeClass = function (
		this: HTMLElement,
		...cls: string[]
	): void {
		this.classList.remove(...cls);
	};

	HTMLElement.prototype.setText = function (
		this: HTMLElement,
		text: string,
	): void {
		this.textContent = text;
	};

	HTMLElement.prototype.toggleClass = function (
		this: HTMLElement,
		cls: string,
		force?: boolean,
	): void {
		this.classList.toggle(cls, force);
	};

	// setAttr — Obsidian's setAttribute shorthand
	(HTMLElement.prototype as any).setAttr = function (
		this: HTMLElement,
		name: string,
		value: string,
	): void {
		this.setAttribute(name, value);
	};

	// HTMLInputElement.trigger — dispatches a synthetic event
	(HTMLInputElement.prototype as any).trigger = function (
		this: HTMLInputElement,
		eventType: string,
	): void {
		this.dispatchEvent(new Event(eventType, { bubbles: true }));
	};
}

// Augment the HTMLElement interface so TypeScript knows about the new methods
declare global {
	interface HTMLElement {
		createDiv(options?: DomElementInfo | string): HTMLDivElement;
		createSpan(options?: DomElementInfo | string): HTMLSpanElement;
		createEl(tag: string, options?: DomElementInfo | string): HTMLElement;
		empty(): void;
		addClass(...cls: string[]): void;
		removeClass(...cls: string[]): void;
		setText(text: string): void;
		toggleClass(cls: string, force?: boolean): void;
		setAttr(name: string, value: string): void;
	}
	interface HTMLInputElement {
		trigger(eventType: string): void;
	}
}
