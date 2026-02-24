package main

type GraphResponse struct {
	Nodes []NodeDTO `json:"nodes"`
	Edges []EdgeDTO `json:"edges"`
}

type NodeDTO struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Name    string `json:"name"`
	File    string `json:"file,omitempty"`
	Line    int    `json:"line,omitempty"`
	Package string `json:"package,omitempty"`
}

type EdgeDTO struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Kind   string `json:"kind"`
	Weight int    `json:"weight,omitempty"`
}

type PackageInfo struct {
	Package     string `json:"package"`
	Files       int    `json:"files"`
	Functions   int    `json:"functions"`
	Types       int    `json:"types"`
	LOC         int    `json:"loc"`
	Complexity  int    `json:"complexity"`
	Module      string `json:"module,omitempty"`
	Description string `json:"description,omitempty"`
}

type ModuleInfo struct {
	Name       string `json:"name"`
	Packages   int    `json:"packages"`
	Functions  int    `json:"functions"`
	LOC        int    `json:"loc"`
	Complexity int    `json:"complexity"`
}

type DBStats struct {
	Nodes     int      `json:"nodes"`
	Edges     int      `json:"edges"`
	Packages  int      `json:"packages"`
	Functions int      `json:"functions"`
	Files     int      `json:"files"`
	Modules   []string `json:"modules"`
}

type FunctionInfo struct {
	Name string `json:"name"`
	File string `json:"file,omitempty"`
	Line int    `json:"line,omitempty"`
}
