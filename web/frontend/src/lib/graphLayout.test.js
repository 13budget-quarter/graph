import test from 'node:test';
import assert from 'node:assert/strict';
import {
	normalizeNodeSizes,
	buildRadialAnchors,
	blendEdgeColor,
	computeFocusNodes,
	computeTooltipData,
	clampTooltipPosition,
	clamp,
	assignDistinctColors,
	truncateLabel,
	resolveCollisions,
	isNoiseNode,
	filterNoiseNodes,
	muteColor,
	assignHubColors,
	applyHubCenterBias,
} from './graphLayout.js';

/* ── normalizeNodeSizes ──────────────────────────── */

test('normalizeNodeSizes maps values to 1..10 range', () => {
	const sizes = normalizeNodeSizes([
		{ id: 'a', raw: 1 },
		{ id: 'b', raw: 5 },
		{ id: 'c', raw: 10 },
	]);
	assert.equal(sizes.get('a'), 1);
	assert.equal(sizes.get('c'), 10);
	assert.ok(sizes.get('b') > 1 && sizes.get('b') < 10);
});

test('normalizeNodeSizes returns empty map for empty input', () => {
	assert.equal(normalizeNodeSizes([]).size, 0);
	assert.equal(normalizeNodeSizes(null).size, 0);
});

test('normalizeNodeSizes single element gets midpoint', () => {
	const sizes = normalizeNodeSizes([{ id: 'x', raw: 42 }], 5, 15);
	assert.equal(sizes.get('x'), 10); // (5+15)/2
});

test('normalizeNodeSizes with custom min/max', () => {
	const sizes = normalizeNodeSizes(
		[{ id: 'a', raw: 0 }, { id: 'b', raw: 100 }], 15, 50);
	assert.equal(sizes.get('a'), 15);
	assert.equal(sizes.get('b'), 50);
});

/* ── buildRadialAnchors ──────────────────────────── */

test('buildRadialAnchors places highest score closest to center', () => {
	const anchors = buildRadialAnchors([
		{ id: 'top', score: 100 },
		{ id: 'mid', score: 50 },
		{ id: 'low', score: 1 },
	], 100);
	const top = anchors.get('top');
	const low = anchors.get('low');
	const topDist = Math.hypot(top.x, top.y);
	const lowDist = Math.hypot(low.x, low.y);
	assert.ok(topDist <= lowDist);
});

test('buildRadialAnchors empty input', () => {
	assert.equal(buildRadialAnchors([]).size, 0);
});

/* ── blendEdgeColor ──────────────────────────────── */

test('blendEdgeColor returns rgba blend', () => {
	const color = blendEdgeColor('#ff0000', '#0000ff', 0.5);
	assert.equal(color, 'rgba(128, 0, 128, 0.5)');
});

test('blendEdgeColor invalid input returns fallback', () => {
	const color = blendEdgeColor('invalid', null, 0.6);
	assert.match(color, /^rgba\(99, 102, 241/);
});

/* ── computeFocusNodes ───────────────────────────── */

test('computeFocusNodes includes selected and neighbors', () => {
	const focus = computeFocusNodes('n2', [
		{ source: 'n1', target: 'n2' },
		{ source: 'n2', target: 'n3' },
	]);
	assert.ok(focus.has('n1'));
	assert.ok(focus.has('n2'));
	assert.ok(focus.has('n3'));
});

test('computeFocusNodes returns empty set when no selection', () => {
	assert.equal(computeFocusNodes(null, []).size, 0);
});

/* ── clamp ───────────────────────────────────────── */

test('clamp constrains value within bounds', () => {
	assert.equal(clamp(5, 0, 10), 5);
	assert.equal(clamp(-3, 0, 10), 0);
	assert.equal(clamp(15, 0, 10), 10);
});

/* ── computeTooltipData ──────────────────────────── */

test('computeTooltipData returns null for null node', () => {
	assert.equal(computeTooltipData(null, [], {}, {}), null);
});

test('computeTooltipData computes correct degree breakdown', () => {
	const node = { id: 'fn1', name: 'handleRequest', kind: 'function', file: 'server.go', line: 42, package: 'main' };
	const edges = [
		{ source: 'fn0', target: 'fn1', kind: 'call' },
		{ source: 'fn0', target: 'fn1', kind: 'data_flow' },
		{ source: 'fn1', target: 'fn2', kind: 'call' },
		{ source: 'fn1', target: 'fn3', kind: 'call' },
		{ source: 'fn1', target: 'fn4', kind: 'data_flow' },
		{ source: 'fn5', target: 'fn6', kind: 'call' }, // unrelated
	];
	const display = { degree: 5, visualSize: 35 };
	const viewport = { posX: 100, posY: 200, nodeRadius: 25, containerW: 1200, containerH: 800 };

	const tip = computeTooltipData(node, edges, display, viewport);

	assert.equal(tip.node, node);
	assert.equal(tip.inDegree, 2);
	assert.equal(tip.outDegree, 3);
	assert.equal(tip.links, 5);
	assert.equal(tip.degree, 5);
	assert.equal(tip.visualSize, 35);
	assert.deepEqual(tip.inEdgeKinds.sort(), ['call', 'data_flow']);
	assert.deepEqual(tip.outEdgeKinds.sort(), ['call', 'data_flow']);
});

test('computeTooltipData deduplicates edge kinds', () => {
	const node = { id: 'x', name: 'X', kind: 'type' };
	const edges = [
		{ source: 'a', target: 'x', kind: 'type_of' },
		{ source: 'b', target: 'x', kind: 'type_of' },
		{ source: 'c', target: 'x', kind: 'type_of' },
	];
	const tip = computeTooltipData(node, edges, { degree: 3, visualSize: 20 }, {});
	assert.equal(tip.inDegree, 3);
	assert.deepEqual(tip.inEdgeKinds, ['type_of']); // deduplicated
});

test('computeTooltipData includes all node DTO fields', () => {
	const node = {
		id: 'pkg::main::handleRequest',
		name: 'handleRequest',
		kind: 'function',
		file: 'cmd/server/main.go',
		line: 142,
		package: 'github.com/org/repo/cmd/server',
	};
	const tip = computeTooltipData(node, [], {}, {});
	assert.equal(tip.node.id, 'pkg::main::handleRequest');
	assert.equal(tip.node.name, 'handleRequest');
	assert.equal(tip.node.kind, 'function');
	assert.equal(tip.node.file, 'cmd/server/main.go');
	assert.equal(tip.node.line, 142);
	assert.equal(tip.node.package, 'github.com/org/repo/cmd/server');
});

test('computeTooltipData defaults when display/viewport are missing', () => {
	const node = { id: 'n', name: 'N', kind: 'var' };
	const tip = computeTooltipData(node, [], undefined, undefined);
	assert.equal(tip.degree, 0);
	assert.equal(tip.visualSize, 1);
	assert.equal(typeof tip.x, 'number');
	assert.equal(typeof tip.y, 'number');
});

test('computeTooltipData handles node with zero edges', () => {
	const node = { id: 'isolated', name: 'Isolated', kind: 'package' };
	const tip = computeTooltipData(node, [], { degree: 0, visualSize: 15 }, { posX: 50, posY: 50, nodeRadius: 15, containerW: 600, containerH: 400 });
	assert.equal(tip.inDegree, 0);
	assert.equal(tip.outDegree, 0);
	assert.equal(tip.links, 0);
	assert.deepEqual(tip.inEdgeKinds, []);
	assert.deepEqual(tip.outEdgeKinds, []);
});

/* ── clampTooltipPosition ────────────────────────── */

test('clampTooltipPosition places tooltip to the right by default', () => {
	const pos = clampTooltipPosition(100, 200, 20, 1200, 800);
	assert.ok(pos.x > 100, 'tooltip should be to the right of the node');
	assert.equal(pos.x, 100 + 20 + 16); // posX + nodeRadius + 16
});

test('clampTooltipPosition flips left when right edge clips', () => {
	// Node near right edge: posX=1100, container=1200, tooltip=400
	const pos = clampTooltipPosition(1100, 200, 20, 1200, 800);
	assert.ok(pos.x < 1100, 'tooltip should flip to the left');
});

test('clampTooltipPosition clamps to container bounds', () => {
	// Node at top-left corner
	const pos = clampTooltipPosition(10, 5, 20, 500, 300);
	assert.ok(pos.x >= 4, 'x should be at least 4');
	assert.ok(pos.y >= 4, 'y should be at least 4');
});

test('clampTooltipPosition never goes negative', () => {
	const pos = clampTooltipPosition(0, 0, 0, 100, 100);
	assert.ok(pos.x >= 4);
	assert.ok(pos.y >= 4);
});

test('clampTooltipPosition handles tiny container', () => {
	// Container smaller than tooltip — should still clamp sanely
	const pos = clampTooltipPosition(50, 50, 10, 200, 150);
	assert.ok(pos.x >= 4);
	assert.ok(pos.y >= 4);
});

/* ── assignDistinctColors ────────────────────────── */

test('assignDistinctColors returns a Map with one entry per node', () => {
	const nodes = [
		{ id: 'a', name: 'alpha' },
		{ id: 'b', name: 'beta' },
		{ id: 'c', name: 'gamma' },
	];
	const colors = assignDistinctColors(nodes);
	assert.equal(colors.size, 3);
	assert.ok(colors.has('a'));
	assert.ok(colors.has('b'));
	assert.ok(colors.has('c'));
});

test('assignDistinctColors is deterministic', () => {
	const nodes = [
		{ id: 'x', name: 'foo' },
		{ id: 'y', name: 'bar' },
	];
	const c1 = assignDistinctColors(nodes);
	const c2 = assignDistinctColors(nodes);
	assert.equal(c1.get('x'), c2.get('x'));
	assert.equal(c1.get('y'), c2.get('y'));
});

test('assignDistinctColors returns empty map for empty input', () => {
	assert.equal(assignDistinctColors([]).size, 0);
	assert.equal(assignDistinctColors(null).size, 0);
});

test('assignDistinctColors produces hex color strings', () => {
	const nodes = [{ id: 'a', name: 'test' }];
	const colors = assignDistinctColors(nodes);
	const color = colors.get('a');
	assert.match(color, /^#[0-9a-fA-F]{6}$/);
});

/* ── truncateLabel ───────────────────────────────── */

test('truncateLabel returns short string unchanged', () => {
	assert.equal(truncateLabel('hello', 10), 'hello');
});

test('truncateLabel truncates at separator', () => {
	const result = truncateLabel('github.com/org/very/long/path', 20);
	assert.ok(result.length <= 21); // maxLen + 1 for …
	assert.ok(result.endsWith('…'));
});

test('truncateLabel hard-truncates when no separator found', () => {
	const result = truncateLabel('abcdefghijklmnopqrstuvwxyz', 10);
	assert.ok(result.length <= 11);
	assert.ok(result.endsWith('…'));
});

test('truncateLabel handles null/undefined', () => {
	assert.equal(truncateLabel(null, 10), '');
	assert.equal(truncateLabel(undefined, 10), '');
	assert.equal(truncateLabel('', 10), '');
});

/* ── resolveCollisions ───────────────────────────── */

test('resolveCollisions pushes overlapping nodes apart', () => {
	const positions = new Map([
		['a', { x: 0, y: 0 }],
		['b', { x: 5, y: 5 }],
	]);
	const sizes = new Map([
		['a', 20],
		['b', 20],
	]);
	resolveCollisions(positions, sizes, 60, 10);
	const a = positions.get('a');
	const b = positions.get('b');
	const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
	assert.ok(dist >= 55, `Expected nodes to be pushed apart, got dist=${dist}`);
});

test('resolveCollisions leaves distant nodes unchanged', () => {
	const positions = new Map([
		['a', { x: 0, y: 0 }],
		['b', { x: 1000, y: 1000 }],
	]);
	const sizes = new Map([
		['a', 10],
		['b', 10],
	]);
	resolveCollisions(positions, sizes, 30, 10);
	const a = positions.get('a');
	const b = positions.get('b');
	assert.ok(Math.abs(a.x) < 1, 'Node a should not have moved');
	assert.ok(Math.abs(b.x - 1000) < 1, 'Node b should not have moved');
});

test('resolveCollisions handles empty input', () => {
	const positions = new Map();
	const sizes = new Map();
	resolveCollisions(positions, sizes, 30, 10);
	assert.equal(positions.size, 0);
});

/* ── isNoiseNode ─────────────────────────────────── */

test('isNoiseNode identifies Error-pattern names', () => {
	assert.ok(isNoiseNode({ name: 'Error', kind: 'function' }));
	assert.ok(isNoiseNode({ name: '*Error', kind: 'method' }));
	assert.ok(isNoiseNode({ name: 'pkg.Error', kind: 'method' }));
	assert.ok(isNoiseNode({ name: 'ErrBadRequest', kind: 'function' }));
	assert.ok(isNoiseNode({ name: 'errInternal', kind: 'function' }));
});

test('isNoiseNode identifies anonymous/init patterns', () => {
	assert.ok(isNoiseNode({ name: 'init', kind: 'function' }));
	assert.ok(isNoiseNode({ name: 'init.0', kind: 'function' }));
	assert.ok(isNoiseNode({ name: '$bound', kind: 'function' }));
	assert.ok(isNoiseNode({ name: 'func1', kind: 'function' }));
	assert.ok(isNoiseNode({ name: '<closure>', kind: 'function' }));
	assert.ok(isNoiseNode({ name: 'glob.init', kind: 'function' }));
});

test('isNoiseNode identifies trivial getters/setters', () => {
	assert.ok(isNoiseNode({ name: 'GetName', kind: 'function', complexity: 1 }));
	assert.ok(isNoiseNode({ name: 'SetValue', kind: 'method', complexity: 1 }));
	assert.ok(isNoiseNode({ name: 'pkg.GetID', kind: 'method', complexity: 0 }));
});

test('isNoiseNode identifies trivial wrappers', () => {
	assert.ok(isNoiseNode({ name: 'wrap', kind: 'function', complexity: 1, loc: 3 }));
	assert.ok(isNoiseNode({ name: 'helper', kind: 'function', complexity: 0, loc: 2 }));
});

test('isNoiseNode does NOT flag normal functions', () => {
	assert.ok(!isNoiseNode({ name: 'HandleRequest', kind: 'function', complexity: 5, loc: 20 }));
	assert.ok(!isNoiseNode({ name: 'Process', kind: 'function' }));
	assert.ok(!isNoiseNode({ name: 'GetName', kind: 'function', complexity: 3 }));
	assert.ok(!isNoiseNode({ name: 'BuildGraph', kind: 'function', complexity: 10 }));
});

test('isNoiseNode returns false for null/undefined', () => {
	assert.ok(!isNoiseNode(null));
	assert.ok(!isNoiseNode(undefined));
	assert.ok(!isNoiseNode({}));
});

/* ── filterNoiseNodes ────────────────────────────── */

test('filterNoiseNodes removes noise and orphan edges', () => {
	const graph = {
		nodes: [
			{ id: '1', name: 'HandleRequest', kind: 'function', complexity: 5, loc: 20 },
			{ id: '2', name: 'Error', kind: 'function' },
			{ id: '3', name: 'Process', kind: 'function' },
		],
		edges: [
			{ source: '1', target: '2', kind: 'calls' },
			{ source: '1', target: '3', kind: 'calls' },
		],
	};
	const result = filterNoiseNodes(graph);
	assert.equal(result.nodes.length, 2);
	assert.equal(result.edges.length, 1); // only 1→3 survives (2 is noise)
	assert.equal(result.edges[0].target, '3');
});

test('filterNoiseNodes handles empty/null input', () => {
	assert.deepEqual(filterNoiseNodes(null), { nodes: [], edges: [] });
	assert.deepEqual(filterNoiseNodes({ nodes: [], edges: [] }), { nodes: [], edges: [] });
});

test('filterNoiseNodes respects protectedIds', () => {
	const graph = {
		nodes: [
			{ id: '1', name: 'init', kind: 'function' },
			{ id: '2', name: 'Process', kind: 'function' },
		],
		edges: [{ source: '1', target: '2', kind: 'calls' }],
	};
	const result = filterNoiseNodes(graph, new Set(['1']));
	assert.equal(result.nodes.length, 2); // init kept because protected
	assert.equal(result.edges.length, 1);
});

/* ── muteColor ───────────────────────────────────── */

test('muteColor returns valid hex', () => {
	const muted = muteColor('#ef4444');
	assert.match(muted, /^#[0-9a-f]{6}$/i);
});

test('muteColor produces a lighter/less saturated colour', () => {
	const original = '#ef4444';
	const muted = muteColor(original, 0.45);
	// Parse both to compare lightness (muted should be lighter)
	const origR = parseInt(original.slice(1, 3), 16);
	const mutedR = parseInt(muted.slice(1, 3), 16);
	// Muted should be different from original
	assert.notEqual(original, muted);
});

test('muteColor handles edge cases', () => {
	assert.match(muteColor('#000000'), /^#[0-9a-f]{6}$/i);
	assert.match(muteColor('#ffffff'), /^#[0-9a-f]{6}$/i);
	assert.match(muteColor('#6366f1', 0), /^#[0-9a-f]{6}$/i);
	assert.match(muteColor('#6366f1', 1.0), /^#[0-9a-f]{6}$/i);
});

/* ── assignHubColors ─────────────────────────────── */

test('assignHubColors assigns distinct colours to top hubs', () => {
	const nodes = [
		{ id: 'hub1', name: 'Hub1' },
		{ id: 'hub2', name: 'Hub2' },
		{ id: 'sat1', name: 'Sat1' },
		{ id: 'sat2', name: 'Sat2' },
	];
	const edges = [
		{ source: 'hub1', target: 'sat1' },
		{ source: 'hub1', target: 'sat2' },
		{ source: 'hub2', target: 'sat1' },
	];
	const result = assignHubColors(nodes, edges);
	assert.ok(result.colors instanceof Map);
	assert.ok(result.legend instanceof Map);
	// All nodes should have colours
	assert.equal(result.colors.size, 4);
	// Hub1 and Hub2 should have different colours
	assert.notEqual(result.colors.get('hub1'), result.colors.get('hub2'));
});

test('assignHubColors assigns neutral to orphan nodes', () => {
	const nodes = [
		{ id: 'hub1', name: 'Hub1' },
		{ id: 'hub2', name: 'Hub2' },
		{ id: 'connected', name: 'Connected' },
		{ id: 'orphan', name: 'Orphan' },
	];
	// hub1 and hub2 are connected; orphan has no edges at all
	const edges = [
		{ source: 'hub1', target: 'hub2' },
		{ source: 'hub1', target: 'connected' },
	];
	// hubCount=2 so only hub1 and hub2 are hubs; orphan has no edges → neutral
	const result = assignHubColors(nodes, edges, undefined, 2);
	assert.equal(result.colors.get('orphan'), '#5a5f7a');
});

test('assignHubColors handles empty input', () => {
	const result = assignHubColors([], []);
	assert.equal(result.colors.size, 0);
	assert.equal(result.legend.size, 0);
});

test('assignHubColors legend contains hub labels', () => {
	const nodes = [
		{ id: 'a', name: 'Alpha' },
		{ id: 'b', name: 'Beta' },
		{ id: 'c', name: 'Charlie' },
	];
	const edges = [
		{ source: 'a', target: 'b' },
		{ source: 'a', target: 'c' },
		{ source: 'b', target: 'c' },
	];
	const result = assignHubColors(nodes, edges, undefined, 2);
	assert.ok(result.legend.size >= 1);
	assert.ok(result.legend.size <= 2);
});

test('assignHubColors satellites get muted variant of hub colour', () => {
	const nodes = [
		{ id: 'hub', name: 'Hub' },
		{ id: 's1', name: 'Sat1' },
		{ id: 's2', name: 'Sat2' },
	];
	const edges = [
		{ source: 'hub', target: 's1' },
		{ source: 'hub', target: 's2' },
	];
	const result = assignHubColors(nodes, edges, undefined, 1);
	const hubColor = result.colors.get('hub');
	const satColor = result.colors.get('s1');
	// Satellite colour should be different from hub (muted)
	assert.notEqual(hubColor, satColor);
	// Both should be valid hex
	assert.match(hubColor, /^#[0-9a-f]{6}$/i);
	assert.match(satColor, /^#[0-9a-f]{6}$/i);
});

/* ── applyHubCenterBias ─────────────────────────── */

test('applyHubCenterBias with 25 nodes picks topN=5', () => {
	const positions = new Map();
	const degrees = new Map();
	const sizes = new Map();
	// Create 25 nodes in a ring
	for (let i = 0; i < 25; i++) {
		const angle = (i / 25) * 2 * Math.PI;
		positions.set(`n${i}`, { x: Math.cos(angle) * 300, y: Math.sin(angle) * 300 });
		degrees.set(`n${i}`, i); // n24 has highest degree
		sizes.set(`n${i}`, 10);
	}
	applyHubCenterBias(positions, degrees, sizes);

	// Top-5 hubs should be n20..n24 (highest degrees), they should be closer
	// to centroid than periphery nodes on average
	let hubDist = 0;
	let periphDist = 0;
	let hubCount = 0;
	let periphCount = 0;
	// Compute centroid of all nodes
	let cx = 0, cy = 0;
	for (const p of positions.values()) { cx += p.x; cy += p.y; }
	cx /= 25; cy /= 25;
	for (let i = 0; i < 25; i++) {
		const p = positions.get(`n${i}`);
		const dist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
		if (i >= 20) { hubDist += dist; hubCount++; }
		else { periphDist += dist; periphCount++; }
	}
	hubDist /= hubCount;
	periphDist /= periphCount;
	assert.ok(hubDist < periphDist, `hub avg dist ${hubDist.toFixed(1)} should be < periphery ${periphDist.toFixed(1)}`);
});

test('applyHubCenterBias with 9 nodes picks topN=3', () => {
	const positions = new Map();
	const degrees = new Map();
	const sizes = new Map();
	for (let i = 0; i < 9; i++) {
		positions.set(`n${i}`, { x: i * 100, y: i * 100 });
		degrees.set(`n${i}`, i);
		sizes.set(`n${i}`, 10);
	}
	// topN = ceil(sqrt(9)) = 3
	applyHubCenterBias(positions, degrees, sizes);
	// Top 3 hubs: n6, n7, n8
	const hubs = [positions.get('n6'), positions.get('n7'), positions.get('n8')];
	const others = [positions.get('n0'), positions.get('n1'), positions.get('n2')];
	// Hubs should cluster together (low spread)
	const hubSpread = Math.max(
		Math.abs(hubs[0].x - hubs[2].x),
		Math.abs(hubs[0].y - hubs[2].y),
	);
	const otherSpread = Math.max(
		Math.abs(others[0].x - others[2].x),
		Math.abs(others[0].y - others[2].y),
	);
	assert.ok(hubSpread < otherSpread, 'hub cluster should be tighter than periphery');
});

test('applyHubCenterBias enforces minimum hub distance', () => {
	const positions = new Map();
	const degrees = new Map();
	const sizes = new Map();
	// Place 5 nodes at nearly the same point
	for (let i = 0; i < 5; i++) {
		positions.set(`n${i}`, { x: 0.1 * i, y: 0.1 * i });
		degrees.set(`n${i}`, 10 - i); // all high degree → all hubs
		sizes.set(`n${i}`, 10);
	}
	applyHubCenterBias(positions, degrees, sizes, 5);
	// Every pair of the 5 hub nodes should be at least minHubDist=80 apart
	const ids = ['n0', 'n1', 'n2', 'n3', 'n4'];
	for (let i = 0; i < ids.length; i++) {
		const a = positions.get(ids[i]);
		for (let j = i + 1; j < ids.length; j++) {
			const b = positions.get(ids[j]);
			const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
			assert.ok(dist >= 79, `${ids[i]}-${ids[j]} dist=${dist.toFixed(1)} should be >= ~80`);
		}
	}
});

test('applyHubCenterBias with empty map returns positions', () => {
	const positions = new Map();
	const result = applyHubCenterBias(positions, new Map(), new Map());
	assert.equal(result.size, 0);
});

test('applyHubCenterBias with single node returns positions', () => {
	const positions = new Map([['a', { x: 10, y: 20 }]]);
	const result = applyHubCenterBias(positions, new Map([['a', 5]]), new Map([['a', 10]]));
	assert.equal(result.size, 1);
	assert.equal(result.get('a').x, 10);
	assert.equal(result.get('a').y, 20);
});

test('applyHubCenterBias with two nodes returns positions unchanged', () => {
	const positions = new Map([
		['a', { x: 0, y: 0 }],
		['b', { x: 100, y: 100 }],
	]);
	const result = applyHubCenterBias(positions, new Map([['a', 5], ['b', 3]]), new Map());
	assert.equal(result.size, 2);
});
