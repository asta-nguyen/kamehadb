import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { openTab } from "@/store";
import { Loader2, Table2 } from "lucide-react";

type CompletionsData = {
  tables: Array<{
    name: string;
    schema?: string;
    columns: Array<{
      name: string;
      type: string;
      primaryKey: boolean;
      foreignKey?: { table: string; column: string };
    }>;
  }>;
};

function useCompletionsSchema(connectionId: string | null) {
  return useQuery({
    queryKey: ["completions", connectionId],
    queryFn: () =>
      api.request<CompletionsData>("GET", `/sql/${connectionId}/completions`),
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
  });
}

function TableNode({ data }: NodeProps) {
  return (
    <div className="rounded-lg border border-border bg-popover shadow-sm min-w-[180px]">
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/30 rounded-t-lg">
        <Table2 className="size-3 text-muted-foreground" />
        <span className="text-xs font-semibold">{data.label as string}</span>
      </div>
      <div className="px-0 py-0">
        {(data.columns as Array<{ name: string; type: string; primaryKey: boolean; foreignKey?: { table: string; column: string } }>).map((col) => (
          <div
            key={col.name}
            className="flex items-center gap-2 px-3 py-1 text-[11px] border-b border-border/40 last:border-b-0"
          >
            {col.primaryKey ? (
              <span className="size-1.5 rounded-full bg-amber-500 shrink-0" title="PK" />
            ) : col.foreignKey ? (
              <span className="size-1.5 rounded-full bg-sky-500 shrink-0" title="FK" />
            ) : (
              <span className="size-1.5 rounded-full bg-transparent shrink-0" />
            )}
            <span className="font-mono text-foreground/90 truncate">{col.name}</span>
            <span className="ml-auto text-muted-foreground/60 shrink-0">{col.type}</span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  );
}

const nodeTypes = { table: TableNode };

function buildGraph(data: CompletionsData) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (!data.tables.length) return { nodes, edges };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 80, ranksep: 120 });

  for (const table of data.tables) {
    const label = table.schema ? `${table.schema}.${table.name}` : table.name;
    const colCount = table.columns.length;
    const height = Math.max(80, colCount * 28 + 40);
    g.setNode(label, { width: 220, height });
  }

  for (const table of data.tables) {
    const sourceLabel = table.schema ? `${table.schema}.${table.name}` : table.name;
    for (const col of table.columns) {
      if (col.foreignKey) {
        const targetLabel = col.foreignKey.table.includes(".")
          ? col.foreignKey.table
          : col.foreignKey.table;
        const qualifiedTarget = data.tables.find(
          (t) => t.name === targetLabel || `${t.schema}.${t.name}` === targetLabel
        );
        if (!qualifiedTarget) continue;
        const targetId = qualifiedTarget.schema
          ? `${qualifiedTarget.schema}.${qualifiedTarget.name}`
          : qualifiedTarget.name;
        g.setEdge(sourceLabel, targetId);
        edges.push({
          id: `${sourceLabel}-${col.name}->${targetId}`,
          source: sourceLabel,
          target: targetId,
          label: `${col.name}`,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
          style: { stroke: "#60a5fa", strokeWidth: 1.5 },
          labelStyle: { fontSize: 10, fill: "#94a3b8" },
        });
      }
    }
  }

  dagre.layout(g);

  for (const table of data.tables) {
    const label = table.schema ? `${table.schema}.${table.name}` : table.name;
    const node = g.node(label);
    nodes.push({
      id: label,
      type: "table",
      position: { x: node.x - node.width / 2, y: node.y - node.height / 2 },
      data: { label, columns: table.columns, tableName: table.name, tableSchema: table.schema },
    });
  }

  return { nodes, edges };
}

type SchemaGraphProps = {
  connectionId: string;
};

export function SchemaGraph({ connectionId }: SchemaGraphProps) {
  const { data: completions, isLoading } = useCompletionsSchema(connectionId);

  const layouted = useMemo(() => {
    if (!completions) return { nodes: [], edges: [] };
    return buildGraph(completions);
  }, [completions]);

  const [nodes, , onNodesChange] = useNodesState(layouted.nodes);
  const [edges, , onEdgesChange] = useEdgesState(layouted.edges);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      openTab({
        id: `${connectionId}:${node.id}`,
        type: "table",
        title: node.id,
        connectionId,
      });
    },
    [connectionId],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!completions || completions.tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No tables found
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.3}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} color="#1e293b" />
      <Controls className="!bg-popover !border-border" />
      <MiniMap
        nodeColor="#334155"
        maskColor="rgba(0,0,0,0.3)"
        className="!border-border"
      />
    </ReactFlow>
  );
}
