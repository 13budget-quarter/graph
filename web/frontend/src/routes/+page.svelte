<script lang="ts">
    import { onMount } from "svelte";
    import { afterNavigate } from "$app/navigation";
    import {
        getPackages,
        getPackageGraph,
        getModules,
        getStats,
        getPackageFunctions,
        type PackageInfo,
        type GraphResponse,
        type NodeDTO,
        type ModuleInfo,
        type DBStats,
        type FunctionInfo,
    } from "$lib/api";
    import GraphCanvas from "$lib/GraphCanvas.svelte";

    const MAX_NODES = 18;
    const MAX_EDGES = 30;

    type Level = "overview" | "package";

    let level: Level = "overview";
    let stats: DBStats | null = null;
    let modules: ModuleInfo[] = [];
    let allPackages: PackageInfo[] = [];
    let fullGraph: GraphResponse = { nodes: [], edges: [] };
    let overviewGraph: GraphResponse = { nodes: [], edges: [] };
    let activeModule = "";
    let selectedPkg = "";
    let pkgGraph: GraphResponse = { nodes: [], edges: [] };
    let loadingPkg = false;
    let loading = true;
    let error = "";
    let fromPopState = false;
    let graphCanvas: GraphCanvas;
    let selectedNode: NodeDTO | null = null;
    let selectedId = "";
    let hoveredNode: NodeDTO | null = null;
    let sidebarFunctions: FunctionInfo[] = [];
    let loadingFunctions = false;

    function moduleOf(pkg: string): string {
        for (const m of modules) {
            if (
                pkg.startsWith(m.name) ||
                pkg.includes(m.name.split("/").pop() ?? "")
            )
                return m.name;
        }
        return "other";
    }

    function capGraph(
        g: GraphResponse,
        maxN: number,
        maxE: number,
    ): GraphResponse {
        if (g.nodes.length <= maxN && g.edges.length <= maxE) return g;
        const deg = new Map<string, number>();
        for (const n of g.nodes) deg.set(n.id, 0);
        for (const e of g.edges) {
            deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
            deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
        }
        const kept = new Set(
            [...g.nodes]
                .sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0))
                .slice(0, maxN)
                .map((n) => n.id),
        );
        return {
            nodes: g.nodes.filter((n) => kept.has(n.id)),
            edges: g.edges
                .filter((e) => kept.has(e.source) && kept.has(e.target))
                .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))
                .slice(0, maxE),
        };
    }

    function buildOverviewGraph() {
        const sorted = [...allPackages].sort(
            (a, b) => b.functions - a.functions,
        );
        const topPkgs = new Set(
            sorted
                .filter(
                    (p) =>
                        !activeModule ||
                        moduleOf(p.package) === activeModule ||
                        p.module === activeModule,
                )
                .slice(0, MAX_NODES)
                .map((p) => p.package),
        );
        const nodes: NodeDTO[] = allPackages
            .filter((p) => topPkgs.has(p.package))
            .map((p) => ({
                id: p.package,
                kind: "package",
                name: p.package.split("/").pop() ?? p.package,
                package: p.package,
            }));
        const edges = fullGraph.edges.filter(
            (e) => topPkgs.has(e.source) && topPkgs.has(e.target),
        );
        overviewGraph = capGraph({ nodes, edges }, MAX_NODES, MAX_EDGES);
    }

    function pushURL(params: Record<string, string>) {
        if (fromPopState) return;
        const url = new URL(window.location.href);
        url.search = "";
        for (const [k, v] of Object.entries(params)) {
            if (v) url.searchParams.set(k, v);
        }
        window.history.pushState({}, "", url.toString());
    }

    function goOverview() {
        level = "overview";
        selectedPkg = "";
        selectedNode = null;
        selectedId = "";
        hoveredNode = null;
        pkgGraph = { nodes: [], edges: [] };
        buildOverviewGraph();
        pushURL({});
    }

    async function goToPackage(pkg: string) {
        level = "package";
        selectedPkg = pkg;
        pushURL({ pkg });
        loadingPkg = true;
        try {
            const neighbors = new Set<string>([pkg]);
            for (const e of fullGraph.edges) {
                if (e.source === pkg) neighbors.add(e.target);
                if (e.target === pkg) neighbors.add(e.source);
            }
            const nodes: NodeDTO[] = [];
            const known = new Set<string>();
            for (const p of allPackages) {
                if (!neighbors.has(p.package)) continue;
                const short = p.package.split("/").pop() ?? p.package;
                nodes.push({
                    id: p.package,
                    kind: "package",
                    name: p.package === pkg ? short + " ◉" : short,
                    package: p.package,
                });
                known.add(p.package);
            }
            for (const id of neighbors) {
                if (known.has(id)) continue;
                nodes.push({
                    id,
                    kind: "package",
                    name: id.split("/").pop() ?? id,
                    package: id,
                });
            }
            const edges = fullGraph.edges.filter(
                (e) => neighbors.has(e.source) && neighbors.has(e.target),
            );
            pkgGraph = capGraph({ nodes, edges }, 20, 35);
        } catch {
            pkgGraph = { nodes: [], edges: [] };
        } finally {
            loadingPkg = false;
        }
    }

    function handleNodeClick(e: CustomEvent<NodeDTO>) {
        selectedNode = e.detail;
        selectedId = e.detail.id;
    }
    function handleNodeHover(e: CustomEvent<NodeDTO | null>) {
        hoveredNode = e.detail;
    }
    function handleStageClick() {
        selectedNode = null;
        selectedId = "";
    }

    async function goDeep() {
        if (!selectedNode || selectedNode.kind !== "package") return;
        const pkg = selectedNode.package ?? selectedNode.id;
        selectedNode = null;
        selectedId = "";
        hoveredNode = null;
        await goToPackage(pkg);
    }

    $: sidebarNode = hoveredNode ?? selectedNode;

    $: sidebarEdges = (() => {
        if (!sidebarNode)
            return {
                incoming: [] as { name: string; kind: string }[],
                outgoing: [] as { name: string; kind: string }[],
            };
        const g = level === "overview" ? overviewGraph : pkgGraph;
        const incoming: { name: string; kind: string }[] = [];
        const outgoing: { name: string; kind: string }[] = [];
        for (const e of g.edges) {
            if (e.target === sidebarNode.id)
                incoming.push({
                    name:
                        g.nodes.find((n) => n.id === e.source)?.name ??
                        e.source.split("/").pop() ??
                        e.source,
                    kind: e.kind,
                });
            if (e.source === sidebarNode.id)
                outgoing.push({
                    name:
                        g.nodes.find((n) => n.id === e.target)?.name ??
                        e.target.split("/").pop() ??
                        e.target,
                    kind: e.kind,
                });
        }
        return { incoming, outgoing };
    })();

    $: sidebarPkgInfo = sidebarNode
        ? (allPackages.find((p) => p.package === sidebarNode!.id) ?? null)
        : null;
    $: isDeepest =
        sidebarNode?.kind === "package" &&
        level === "package" &&
        selectedPkg === sidebarNode.id;

    $: if (isDeepest && sidebarNode) {
        loadingFunctions = true;
        getPackageFunctions(sidebarNode.id)
            .then((fns) => (sidebarFunctions = fns))
            .catch(() => (sidebarFunctions = []))
            .finally(() => (loadingFunctions = false));
    } else {
        sidebarFunctions = [];
    }

    function selectModule(mod: string) {
        activeModule = activeModule === mod ? "" : mod;
        buildOverviewGraph();
    }

    function applyURLParams() {
        const pkg = new URL(window.location.href).searchParams.get("pkg");
        fromPopState = true;
        if (pkg) goToPackage(pkg);
        else goOverview();
        fromPopState = false;
    }

    afterNavigate(() => {
        if (!loading) applyURLParams();
    });

    function sizeFn(node: NodeDTO): number {
        return allPackages.find((p) => p.package === node.id)?.functions ?? 1;
    }

    onMount(async () => {
        try {
            const [s, mods, pkgs, graph] = await Promise.all([
                getStats(),
                getModules(),
                getPackages(),
                getPackageGraph(),
            ]);
            stats = s;
            modules = mods.sort((a, b) => b.loc - a.loc);
            allPackages = pkgs;
            fullGraph = graph;
            buildOverviewGraph();
            const urlPkg = new URL(window.location.href).searchParams.get(
                "pkg",
            );
            if (urlPkg) {
                fromPopState = true;
                await goToPackage(urlPkg);
                fromPopState = false;
            }
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    });
</script>

<div class="explorer">
    <div class="toolbar">
        <nav class="bc">
            <button
                class="bc-link"
                class:active={level === "overview"}
                on:click={goOverview}>Packages</button
            >
            {#if level === "package"}
                <span class="bc-sep">/</span>
                <span class="bc-cur">{selectedPkg.split("/").pop()}</span>
            {/if}
        </nav>
        {#if stats}
            <div class="pills">
                <span class="pill">{stats.nodes} nodes</span>
                <span class="pill">{stats.packages} pkgs</span>
                <span class="pill">{stats.functions} funcs</span>
            </div>
        {/if}
    </div>

    {#if loading}
        <div class="center">Loading...</div>
    {:else if error}
        <div class="center" style="color:#ef4444">{error}</div>
    {:else}
        {#if level === "overview"}
            <div class="mod-filter">
                <button
                    class="mod-pill"
                    class:active={activeModule === ""}
                    on:click={() => selectModule("")}>All</button
                >
                {#each modules as mod}
                    <button
                        class="mod-pill"
                        class:active={activeModule === mod.name}
                        on:click={() => selectModule(mod.name)}
                    >
                        {mod.name.split("/").pop()}
                        <span class="mod-n">{mod.packages}</span>
                    </button>
                {/each}
            </div>
        {/if}

        <div class="content">
            <div class="graph-area">
                <div class="graph-wrap">
                    {#if level === "overview"}
                        <GraphCanvas
                            bind:this={graphCanvas}
                            data={overviewGraph}
                            {sizeFn}
                            on:nodeclick={handleNodeClick}
                            on:nodehover={handleNodeHover}
                            on:stageclick={handleStageClick}
                        />
                    {:else if loadingPkg}
                        <div class="center">Loading...</div>
                    {:else}
                        <GraphCanvas
                            bind:this={graphCanvas}
                            data={pkgGraph}
                            {sizeFn}
                            on:nodeclick={handleNodeClick}
                            on:nodehover={handleNodeHover}
                            on:stageclick={handleStageClick}
                        />
                    {/if}
                </div>
            </div>

            <aside class="sidebar" class:has-node={!!sidebarNode}>
                {#if sidebarNode}
                    <div class="sb-hdr">
                        <h3 class="sb-name">{sidebarNode.name}</h3>
                        <span class="sb-badge">{sidebarNode.kind}</span>
                    </div>
                    {#if sidebarNode.package}<div class="sb-row">
                            <span class="sb-lbl">Package</span><span
                                class="sb-val mono">{sidebarNode.package}</span
                            >
                        </div>{/if}
                    {#if sidebarPkgInfo?.description}<div class="sb-desc">
                            {sidebarPkgInfo.description}
                        </div>{/if}
                    {#if sidebarPkgInfo}
                        <div class="sb-title">Metrics</div>
                        <div class="sb-metrics">
                            <div class="sb-m">
                                <span class="sb-mv"
                                    >{sidebarPkgInfo.functions}</span
                                ><span class="sb-ml">Funcs</span>
                            </div>
                            <div class="sb-m">
                                <span class="sb-mv">{sidebarPkgInfo.types}</span
                                ><span class="sb-ml">Types</span>
                            </div>
                            <div class="sb-m">
                                <span class="sb-mv">{sidebarPkgInfo.loc}</span
                                ><span class="sb-ml">LOC</span>
                            </div>
                        </div>
                    {/if}
                    {#if sidebarEdges.incoming.length > 0}
                        <div class="sb-title">
                            Incoming ({sidebarEdges.incoming.length})
                        </div>
                        <div class="sb-edges">
                            {#each sidebarEdges.incoming.slice(0, 12) as e}<div
                                    class="sb-edge"
                                >
                                    <span class="dir-in">←</span>
                                    {e.name} <span class="ek">{e.kind}</span>
                                </div>{/each}
                        </div>
                    {/if}
                    {#if sidebarEdges.outgoing.length > 0}
                        <div class="sb-title">
                            Outgoing ({sidebarEdges.outgoing.length})
                        </div>
                        <div class="sb-edges">
                            {#each sidebarEdges.outgoing.slice(0, 12) as e}<div
                                    class="sb-edge"
                                >
                                    <span class="dir-out">→</span>
                                    {e.name} <span class="ek">{e.kind}</span>
                                </div>{/each}
                        </div>
                    {/if}
                    {#if sidebarNode.kind === "package" && selectedNode?.id === sidebarNode.id && !(level === "package" && selectedPkg === sidebarNode.id)}
                        <button class="go-deep" on:click={goDeep}
                            >Go Deep →</button
                        >
                    {/if}
                    {#if isDeepest}
                        <div class="sb-title">
                            Functions ({sidebarFunctions.length})
                        </div>
                        {#if loadingFunctions}<div class="sb-muted">
                                Loading…
                            </div>
                        {:else if sidebarFunctions.length > 0}
                            <div class="sb-fns">
                                {#each sidebarFunctions as fn}<div
                                        class="sb-fn"
                                    >
                                        <span class="fn-name">{fn.name}</span
                                        >{#if fn.file}<span class="fn-file"
                                                >{fn.file
                                                    .split("/")
                                                    .pop()}:{fn.line}</span
                                            >{/if}
                                    </div>{/each}
                            </div>
                        {:else}<div class="sb-muted">No functions</div>{/if}
                    {/if}
                {:else}
                    <div class="sb-empty">Hover or click a node</div>
                {/if}
            </aside>
        </div>
    {/if}
</div>

<style>
    .explorer {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
    }
    .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        min-height: 36px;
    }
    .bc {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
    }
    .bc-sep {
        color: var(--text-muted);
        opacity: 0.5;
    }
    .bc-link {
        background: none;
        border: none;
        color: var(--accent);
        cursor: pointer;
        font-size: 13px;
        padding: 2px 4px;
        border-radius: 3px;
    }
    .bc-link.active {
        color: var(--text);
        font-weight: 600;
        cursor: default;
    }
    .bc-cur {
        color: var(--text);
        font-weight: 600;
    }
    .pills {
        display: flex;
        gap: 6px;
    }
    .pill {
        padding: 2px 8px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 999px;
        font-size: 10px;
        color: var(--text-muted);
    }
    .mod-filter {
        display: flex;
        gap: 4px;
        padding: 6px 12px;
        flex-wrap: wrap;
        border-bottom: 1px solid var(--border);
    }
    .mod-pill {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 999px;
        font-size: 11px;
        color: var(--text-muted);
        cursor: pointer;
    }
    .mod-pill:hover,
    .mod-pill.active {
        background: var(--accent-dim);
        border-color: var(--accent);
        color: var(--text);
    }
    .mod-n {
        font-size: 10px;
        opacity: 0.6;
    }
    .content {
        flex: 1;
        display: flex;
        overflow: hidden;
        min-height: 0;
    }
    .graph-area {
        flex: 1;
        min-height: 200px;
        position: relative;
    }
    .graph-wrap {
        width: 100%;
        height: 100%;
        position: absolute;
        inset: 0;
    }
    .center {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-muted);
    }

    .sidebar {
        width: 300px;
        flex-shrink: 0;
        border-left: 1px solid var(--border);
        background: var(--surface);
        overflow-y: auto;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .sidebar:not(.has-node) {
        opacity: 0.5;
    }
    .sb-hdr {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .sb-name {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        color: #fff;
        word-break: break-word;
    }
    .sb-badge {
        align-self: flex-start;
        background: var(--accent-dim);
        color: var(--accent);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
    }
    .sb-row {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .sb-lbl {
        font-size: 10px;
        color: #94a3b8;
        text-transform: uppercase;
        font-weight: 600;
    }
    .sb-val {
        font-size: 12px;
        color: #e2e8f0;
        word-break: break-all;
    }
    .sb-val.mono {
        font-family: var(--font-mono);
        font-size: 11px;
    }
    .sb-desc {
        font-size: 12px;
        color: #cbd5e1;
        line-height: 1.5;
        padding: 6px 8px;
        background: rgba(99, 102, 241, 0.08);
        border-radius: 6px;
        border-left: 3px solid rgba(99, 102, 241, 0.4);
    }
    .sb-title {
        font-size: 10px;
        font-weight: 700;
        color: #a5b4fc;
        text-transform: uppercase;
        margin-top: 4px;
        padding-top: 6px;
        border-top: 1px solid rgba(99, 102, 241, 0.2);
    }
    .sb-metrics {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
    }
    .sb-m {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
    }
    .sb-mv {
        font-size: 16px;
        font-weight: 700;
        color: #fff;
    }
    .sb-ml {
        font-size: 9px;
        color: #94a3b8;
        text-transform: uppercase;
    }
    .sb-edges {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .sb-edge {
        font-size: 11px;
        color: #e2e8f0;
        display: flex;
        gap: 4px;
        align-items: center;
    }
    .dir-in {
        color: #34d399;
    }
    .dir-out {
        color: #f472b6;
    }
    .ek {
        color: #64748b;
        font-size: 9px;
        text-transform: uppercase;
        margin-left: auto;
    }
    .go-deep {
        margin-top: auto;
        padding: 10px;
        background: var(--accent);
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
    }
    .go-deep:hover {
        background: #4f46e5;
    }
    .sb-fns {
        max-height: 300px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
    }
    .sb-fn {
        display: flex;
        justify-content: space-between;
        gap: 4px;
        padding: 2px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    .fn-name {
        font-family: var(--font-mono);
        font-size: 11px;
        color: #e2e8f0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .fn-file {
        font-size: 10px;
        color: #64748b;
        flex-shrink: 0;
    }
    .sb-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        color: var(--text-muted);
        font-size: 13px;
    }
    .sb-muted {
        font-size: 11px;
        color: #64748b;
        text-align: center;
    }
</style>
