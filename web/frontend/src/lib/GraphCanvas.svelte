<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import Graph from "graphology";
    import Sigma from "sigma";
    import forceAtlas2, { inferSettings } from "graphology-layout-forceatlas2";
    import type { GraphResponse, NodeDTO } from "./api";
    import {
        normalizeNodeSizes,
        buildRadialAnchors,
        blendEdgeColor,
        computeFocusNodes,
        truncateLabel,
        resolveCollisions,
        assignHubColors,
    } from "./graphLayout.js";

    export let data: GraphResponse = { nodes: [], edges: [] };
    export let highlighted: Set<string> = new Set();
    export let selectedId: string | null = null;
    export let sizeFn: ((node: NodeDTO) => number) | null = null;

    const dispatch = createEventDispatcher<{
        nodeclick: NodeDTO;
        nodehover: NodeDTO | null;
        stageclick: void;
    }>();

    let container: HTMLDivElement;
    let sigma: Sigma | null = null;
    let graph: Graph | null = null;
    let clamping = false;

    function buildGraph(d: GraphResponse): Graph {
        const g = new Graph();
        const hubResult = assignHubColors(d.nodes, d.edges);
        const hubColors = hubResult.colors;
        const maxLabel =
            d.nodes.length > 60 ? 22 : d.nodes.length > 30 ? 26 : 32;

        for (const n of d.nodes) {
            if (g.hasNode(n.id)) continue;
            const color = hubColors.get(n.id) ?? "#8b8fa3";
            g.addNode(n.id, {
                label: truncateLabel(n.name, maxLabel),
                size: 4,
                color,
                origColor: color,
                x: 0,
                y: 0,
                kind: n.kind,
                file: n.file ?? "",
                line: n.line ?? 0,
                pkg: n.package ?? "",
                origName: n.name,
            });
        }

        for (const e of d.edges) {
            if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;
            const key = `${e.source}->${e.target}:${e.kind}`;
            if (g.hasEdge(key)) continue;
            const w = Math.max(1, e.weight ?? 1);
            g.addEdgeWithKey(key, e.source, e.target, {
                label: e.kind,
                type: "arrow",
                size: Math.min(2.5, 0.6 + Math.log2(w + 1) * 0.65),
                color: blendEdgeColor(
                    g.getNodeAttribute(e.source, "origColor"),
                    g.getNodeAttribute(e.target, "origColor"),
                    0.45,
                ),
                weight: w,
            });
        }

        const rawEntries = d.nodes.map((n) => {
            const raw = sizeFn
                ? Math.max(1, sizeFn(n))
                : Math.max(1, (g.hasNode(n.id) ? g.degree(n.id) : 0) + 1);
            return { id: n.id, raw: Math.log2(raw + 1) };
        });
        const sizes = normalizeNodeSizes(rawEntries, 12, 38);
        for (const n of d.nodes) {
            if (!g.hasNode(n.id)) continue;
            const s = sizes.get(n.id) ?? 4;
            g.setNodeAttribute(n.id, "size", s);
            g.setNodeAttribute(n.id, "baseSize", s);
        }

        const anchors = buildRadialAnchors(
            d.nodes.map((n) => ({
                id: n.id,
                score: g.hasNode(n.id) ? g.degree(n.id) + 1 : 1,
            })),
            350,
        );
        for (const [id, pos] of anchors) {
            if (g.hasNode(id)) {
                g.setNodeAttribute(id, "x", pos.x);
                g.setNodeAttribute(id, "y", pos.y);
            }
        }
        return g;
    }

    function applyLayout(g: Graph) {
        if (g.order < 2) return;
        const small = g.order < 20;
        const dense = g.size > g.order * 1.2;
        const inferred = inferSettings(g);
        forceAtlas2.assign(g, {
            iterations: small ? 300 : dense ? 500 : 400,
            settings: {
                ...inferred,
                scalingRatio:
                    (inferred.scalingRatio ?? 1) *
                    (small ? 24 : dense ? 20 : 16),
                gravity:
                    (inferred.gravity ?? 1) *
                    (small ? 0.06 : dense ? 0.03 : 0.04),
                barnesHutOptimize: g.order > 100,
                strongGravityMode: false,
                adjustSizes: true,
            },
        });

        const positions = new Map<string, { x: number; y: number }>();
        const sizes = new Map<string, number>();
        g.forEachNode((id, attrs) => {
            positions.set(id, { x: attrs.x, y: attrs.y });
            sizes.set(id, Number(attrs.size ?? 10));
        });
        resolveCollisions(positions, sizes, small ? 40 : 55, 60);

        // Center around origin
        let cx = 0,
            cy = 0,
            count = 0;
        for (const pos of positions.values()) {
            cx += pos.x;
            cy += pos.y;
            count++;
        }
        if (count > 0) {
            cx /= count;
            cy /= count;
            for (const pos of positions.values()) {
                pos.x -= cx;
                pos.y -= cy;
            }
        }
        for (const [id, pos] of positions) {
            g.setNodeAttribute(id, "x", pos.x);
            g.setNodeAttribute(id, "y", pos.y);
        }
    }

    function applyHighlights() {
        if (!graph || !sigma) return;
        const focus = computeFocusNodes(selectedId, data.edges);
        const hasHL = highlighted.size > 0;
        const hasFocus = focus.size > 0;

        graph.forEachNode((id, attrs) => {
            const base = attrs.origColor ?? "#8b8fa3";
            const bs = Number(attrs.baseSize ?? 4);
            if (hasHL) {
                graph!.setNodeAttribute(
                    id,
                    "color",
                    highlighted.has(id) ? base : "#2a2d3a",
                );
                graph!.setNodeAttribute(
                    id,
                    "size",
                    highlighted.has(id)
                        ? Math.min(60, bs + 5)
                        : Math.max(8, bs * 0.6),
                );
            } else if (hasFocus && selectedId) {
                const isSel = id === selectedId,
                    isFoc = focus.has(id);
                graph!.setNodeAttribute(
                    id,
                    "color",
                    isSel || isFoc ? base : "#1b1f2d",
                );
                graph!.setNodeAttribute(
                    id,
                    "size",
                    isSel
                        ? Math.min(65, bs + 8)
                        : isFoc
                          ? Math.min(55, bs + 3)
                          : Math.max(8, bs * 0.55),
                );
            } else {
                graph!.setNodeAttribute(id, "color", base);
                graph!.setNodeAttribute(id, "size", bs);
            }
            graph!.setNodeAttribute(id, "highlighted", id === selectedId);
        });

        graph.forEachEdge((edge, attrs, source, target) => {
            const sc = graph!.getNodeAttribute(source, "origColor");
            const tc = graph!.getNodeAttribute(target, "origColor");
            const bs = attrs.weight
                ? Math.min(3, 0.8 + Math.log2(attrs.weight + 1) * 0.9)
                : 1;
            if (hasHL) {
                const both = highlighted.has(source) && highlighted.has(target);
                graph!.setEdgeAttribute(
                    edge,
                    "color",
                    both ? blendEdgeColor(sc, tc, 0.95) : "rgba(26,29,39,0.35)",
                );
                graph!.setEdgeAttribute(
                    edge,
                    "size",
                    both ? Math.min(3.4, bs + 0.9) : 0.4,
                );
            } else if (hasFocus && selectedId) {
                const direct = source === selectedId || target === selectedId;
                const both = focus.has(source) && focus.has(target);
                graph!.setEdgeAttribute(
                    edge,
                    "color",
                    direct
                        ? blendEdgeColor(sc, tc, 0.95)
                        : both
                          ? blendEdgeColor(sc, tc, 0.62)
                          : "rgba(18,22,33,0.3)",
                );
                graph!.setEdgeAttribute(
                    edge,
                    "size",
                    direct
                        ? Math.min(3.5, bs + 1.1)
                        : both
                          ? Math.min(2.2, bs)
                          : 0.35,
                );
            } else {
                graph!.setEdgeAttribute(
                    edge,
                    "color",
                    blendEdgeColor(sc, tc, 0.48),
                );
                graph!.setEdgeAttribute(edge, "size", Math.min(2.0, bs));
            }
        });
        sigma.refresh();
    }

    function initSigma() {
        if (sigma) {
            sigma.kill();
            sigma = null;
        }
        graph = buildGraph(data);
        if (graph.order === 0) return;
        applyLayout(graph);

        sigma = new Sigma(graph, container, {
            allowInvalidContainer: true,
            renderLabels: true,
            labelRenderedSizeThreshold:
                data.nodes.length > 40 ? 14 : data.nodes.length > 25 ? 10 : 0,
            labelColor: { color: "#f0f2f8" },
            defaultEdgeType: "arrow",
            labelFont: "Inter, system-ui, sans-serif",
            labelSize:
                data.nodes.length < 20 ? 16 : data.nodes.length > 80 ? 12 : 14,
            labelWeight: "bold",
        });

        const nodeMap = new Map<string, NodeDTO>();
        for (const n of data.nodes) nodeMap.set(n.id, n);

        sigma.on("clickNode", ({ node }) => {
            selectedId = node;
            const dto = nodeMap.get(node);
            if (dto) dispatch("nodeclick", dto);
            applyHighlights();
        });
        sigma.on("enterNode", ({ node }) => {
            const dto = nodeMap.get(node);
            if (dto) dispatch("nodehover", dto);
        });
        sigma.on("leaveNode", () => dispatch("nodehover", null));
        sigma.on("clickStage", () => {
            selectedId = null;
            dispatch("stageclick");
            applyHighlights();
        });

        requestAnimationFrame(() =>
            sigma?.getCamera().animatedReset({ duration: 300 }),
        );

        sigma.getCamera().on("updated", (state) => {
            if (clamping) return;
            const { x, y, ratio } = state;
            const cx = Math.max(-2, Math.min(2, x));
            const cy = Math.max(-2, Math.min(2, y));
            const cr = Math.max(0.005, Math.min(6, ratio));
            if (cx !== x || cy !== y || cr !== ratio) {
                clamping = true;
                sigma!
                    .getCamera()
                    .setState({ x: cx, y: cy, ratio: cr, angle: state.angle });
                clamping = false;
            }
        });
        applyHighlights();
    }

    function zoomIn() {
        sigma?.getCamera().animatedZoom({ duration: 200 });
    }
    function zoomOut() {
        sigma?.getCamera().animatedUnzoom({ duration: 200 });
    }

    onMount(() => {
        if (data.nodes.length > 0) initSigma();
    });
    onDestroy(() => {
        if (sigma) {
            sigma.kill();
            sigma = null;
        }
    });

    $: if (container && data.nodes.length > 0) initSigma();
    $: if (sigma && (highlighted || selectedId !== undefined))
        applyHighlights();

    export function zoomToFit() {
        sigma?.getCamera().animatedReset({ duration: 300 });
    }

    export function focusNode(nodeId: string) {
        if (!sigma || !graph?.hasNode(nodeId)) return;
        const attrs = graph.getNodeAttributes(nodeId);
        sigma
            .getCamera()
            .animate(
                { x: attrs.x, y: attrs.y, ratio: 0.15 },
                { duration: 300 },
            );
        selectedId = nodeId;
        applyHighlights();
    }
</script>

<div class="graph-canvas" bind:this={container}>
    {#if data.nodes.length === 0}
        <div class="empty">No graph data</div>
    {:else}
        <div class="badge">
            {data.nodes.length} nodes &middot; {data.edges.length} edges
        </div>
        <div class="controls">
            <button on:click={zoomIn} title="Zoom in">+</button>
            <button on:click={zoomOut} title="Zoom out">&minus;</button>
            <button on:click={zoomToFit} title="Fit all">&#x229E;</button>
        </div>
    {/if}
</div>

<style>
    .graph-canvas {
        width: 100%;
        height: 100%;
        position: relative;
        background: var(--bg);
        overflow: hidden;
    }
    .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-muted);
    }
    .badge {
        position: absolute;
        top: 8px;
        left: 8px;
        padding: 4px 10px;
        background: rgba(26, 29, 39, 0.85);
        border: 1px solid var(--border);
        border-radius: 999px;
        font-size: 11px;
        color: var(--text-muted);
        z-index: 10;
        pointer-events: none;
    }
    .controls {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        z-index: 10;
    }
    .controls button {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(26, 29, 39, 0.85);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text);
        font-size: 16px;
        line-height: 1;
    }
    .controls button:hover {
        background: var(--surface-hover);
        border-color: var(--accent);
        color: var(--accent);
    }
</style>
