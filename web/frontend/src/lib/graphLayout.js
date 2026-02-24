// @ts-nocheck
export function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

export const DISTINCT_PALETTE = [
	'#6366f1', '#22c55e', '#ef4444', '#3b82f6', '#f59e0b',
	'#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
	'#84cc16', '#e11d48', '#a855f7', '#0ea5e9', '#10b981',
	'#d946ef', '#eab308', '#64748b', '#f43f5e', '#2dd4bf',
];

export function truncateLabel(label, maxLen = 24) {
	if (!label || label.length <= maxLen) return label || '';
	const seps = ['.', '/', ':'];
	for (let i = maxLen - 1; i >= maxLen - 10; i--) {
		if (seps.includes(label[i])) return label.slice(0, i + 1) + '…';
	}
	return label.slice(0, maxLen - 1) + '…';
}

export function resolveCollisions(positions, sizes, minDist = 60, maxIter = 50) {
	const ids = [...positions.keys()];
	const n = ids.length;
	if (n < 2) return positions;
	for (let iter = 0; iter < maxIter; iter++) {
		let moved = false;
		for (let i = 0; i < n; i++) {
			const a = positions.get(ids[i]);
			const ra = (sizes?.get(ids[i]) ?? 10) + minDist / 2;
			for (let j = i + 1; j < n; j++) {
				const b = positions.get(ids[j]);
				const rb = (sizes?.get(ids[j]) ?? 10) + minDist / 2;
				const dx = b.x - a.x, dy = b.y - a.y;
				const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
				const needed = ra + rb;
				if (dist < needed) {
					const push = (needed - dist) / 2 + 0.5;
					const nx = dx / dist, ny = dy / dist;
					a.x -= nx * push; a.y -= ny * push;
					b.x += nx * push; b.y += ny * push;
					moved = true;
				}
			}
		}
		if (!moved) break;
	}
	return positions;
}

export function normalizeNodeSizes(rawEntries, minSize = 1, maxSize = 10) {
	if (!Array.isArray(rawEntries) || rawEntries.length === 0) return new Map();
	const values = rawEntries.map((e) => Math.max(0, Number(e.raw) || 0));
	const min = Math.min(...values), max = Math.max(...values);
	const result = new Map();
	for (const entry of rawEntries) {
		const raw = Math.max(0, Number(entry.raw) || 0);
		const size = max === min
			? (minSize + maxSize) / 2
			: minSize + ((raw - min) / (max - min)) * (maxSize - minSize);
		result.set(entry.id, Number(clamp(size, minSize, maxSize).toFixed(3)));
	}
	return result;
}

export function buildRadialAnchors(scoredEntries, radius = 120) {
	const anchors = new Map();
	if (!Array.isArray(scoredEntries) || scoredEntries.length === 0) return anchors;
	const sorted = [...scoredEntries].sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
	const golden = Math.PI * (3 - Math.sqrt(5));
	const maxIdx = Math.max(sorted.length - 1, 1);
	for (let i = 0; i < sorted.length; i++) {
		const r = Math.pow(i / maxIdx, 0.75) * radius;
		const angle = i * golden;
		anchors.set(sorted[i].id, {
			x: Number((Math.cos(angle) * r).toFixed(4)),
			y: Number((Math.sin(angle) * r).toFixed(4)),
		});
	}
	return anchors;
}

function parseHex(hex) {
	if (typeof hex !== 'string') return null;
	const h = hex.trim().replace('#', '');
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
	return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function blendEdgeColor(srcColor, tgtColor, alpha = 0.62) {
	const s = parseHex(srcColor), t = parseHex(tgtColor);
	if (!s || !t) return `rgba(99,102,241,${clamp(alpha, 0.2, 1)})`;
	return `rgba(${(s.r + t.r) >> 1},${(s.g + t.g) >> 1},${(s.b + t.b) >> 1},${clamp(alpha, 0.2, 1)})`;
}

export function computeFocusNodes(selectedId, edges) {
	const focused = new Set();
	if (!selectedId) return focused;
	focused.add(selectedId);
	for (const e of edges || []) {
		if (e?.source === selectedId) focused.add(e.target);
		if (e?.target === selectedId) focused.add(e.source);
	}
	return focused;
}

function hexToHsl(hex) {
	const c = parseHex(hex);
	if (!c) return { h: 0, s: 0, l: 50 };
	const r = c.r / 255, g = c.g / 255, b = c.b / 255;
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
	let h = 0, s = 0;
	const l = (mx + mn) / 2;
	if (mx !== mn) {
		const d = mx - mn;
		s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
		if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
		else if (mx === g) h = ((b - r) / d + 2) / 6;
		else h = ((r - g) / d + 4) / 6;
	}
	return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h, s, l) {
	s /= 100; l /= 100;
	const k = (n) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
	return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function muteColor(hex, factor = 0.45) {
	const hsl = hexToHsl(hex);
	hsl.s = Math.round(Math.max(15, hsl.s * (1 - factor * 0.6)));
	hsl.l = Math.round(Math.min(78, hsl.l + factor * 15));
	return hslToHex(hsl.h, hsl.s, hsl.l);
}

export function assignHubColors(nodes, edges, palette, hubCount = 5) {
	const colors = new Map(), legend = new Map();
	if (!Array.isArray(nodes) || nodes.length === 0) return { colors, legend };

	const pal = palette || DISTINCT_PALETTE;
	const edgeList = edges || [];

	// Weighted degree
	const wDeg = new Map();
	for (const n of nodes) wDeg.set(n.id, 0);
	for (const e of edgeList) {
		const w = e.weight ?? 1;
		if (wDeg.has(e.source)) wDeg.set(e.source, wDeg.get(e.source) + w);
		if (wDeg.has(e.target)) wDeg.set(e.target, wDeg.get(e.target) + w);
	}

	// Top hubs by weighted degree
	const sorted = [...nodes].sort((a, b) => (wDeg.get(b.id) ?? 0) - (wDeg.get(a.id) ?? 0));
	const hubs = sorted.slice(0, Math.min(hubCount, pal.length, nodes.length));
	const hubIds = new Set(hubs.map((h) => h.id));
	const hubColor = new Map();
	for (let i = 0; i < hubs.length; i++) {
		hubColor.set(hubs[i].id, pal[i % pal.length]);
		colors.set(hubs[i].id, pal[i % pal.length]);
		const label = hubs[i].name || hubs[i].id;
		legend.set(label.split('/').pop() || label, pal[i % pal.length]);
	}

	// Non-hub nodes: colour by closest hub
	const hubAffinity = new Map();
	for (const e of edgeList) {
		for (const [from, to] of [[e.source, e.target], [e.target, e.source]]) {
			if (!hubIds.has(to) || hubIds.has(from)) continue;
			if (!hubAffinity.has(from)) hubAffinity.set(from, new Map());
			const m = hubAffinity.get(from);
			m.set(to, (m.get(to) ?? 0) + (e.weight ?? 1));
		}
	}

	const NEUTRAL = '#5a5f7a';
	for (const n of nodes) {
		if (colors.has(n.id)) continue;
		const aff = hubAffinity.get(n.id);
		if (!aff || aff.size === 0) { colors.set(n.id, NEUTRAL); continue; }
		let bestHub = null, bestW = -1;
		for (const [hub, w] of aff) { if (w > bestW) { bestW = w; bestHub = hub; } }
		colors.set(n.id, bestHub && hubColor.has(bestHub) ? muteColor(hubColor.get(bestHub), 0.35) : NEUTRAL);
	}

	return { colors, legend };
}
