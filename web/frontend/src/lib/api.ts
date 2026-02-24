const BASE = '/api';

export interface NodeDTO {
    id: string;
    kind: string;
    name: string;
    file?: string;
    line?: number;
    package?: string;
}

export interface EdgeDTO {
    source: string;
    target: string;
    kind: string;
    weight?: number;
}

export interface GraphResponse {
    nodes: NodeDTO[];
    edges: EdgeDTO[];
}

export interface PackageInfo {
    package: string;
    files: number;
    functions: number;
    types: number;
    loc: number;
    complexity: number;
    module?: string;
    description?: string;
}

export interface ModuleInfo {
    name: string;
    packages: number;
    functions: number;
    loc: number;
    complexity: number;
}

export interface DBStats {
    nodes: number;
    edges: number;
    packages: number;
    functions: number;
    files: number;
    modules: string[];
}

export interface FunctionInfo {
    name: string;
    file?: string;
    line?: number;
}

async function fetchJSON<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
}

export const getPackages = () => fetchJSON<PackageInfo[]>('/packages');
export const getPackageGraph = () => fetchJSON<GraphResponse>('/packages/graph');
export const getStats = () => fetchJSON<DBStats>('/stats');
export const getModules = () => fetchJSON<ModuleInfo[]>('/modules');
export const getPackageFunctions = (pkg: string) =>
    fetchJSON<FunctionInfo[]>(`/packages/functions/${encodeURIComponent(pkg)}`);
