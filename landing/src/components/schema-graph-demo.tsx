'use client';

import { useMemo, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { Table2 } from 'lucide-react';
import { SAMPLE_SCHEMA, type SampleSchema, type SampleColumn } from '@/lib/sample-schema';

// TableNode renders a single table card with its column list.
// PK columns get a primary-colored dot, FK columns get a muted dot,
// and plain columns get no dot — matching the desktop app's schema-graph.
function TableNode({ data }: NodeProps) {
  const columns = data.columns as SampleColumn[];
  return (
    <div className="min-w-48 bg-white dark:bg-surface-strong border border-slate-200 dark:border-[#27273a] rounded-lg shadow-md">
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />
      <div className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-[#12121a] border-b border-slate-200 dark:border-[#27273a] rounded-t-lg gap-1.5">
        <Table2 className="text-slate-500 dark:text-slate-400 size-3" />
        <span className="text-xs font-semibold text-ink">{data.label as string}</span>
      </div>
      <div>
        {columns.map((col) => (
          <div
            key={col.name}
            className="flex items-center px-3 py-1 text-xs border-b border-slate-100 dark:border-[#27273a]/40 gap-2 last:border-b-0"
          >
            {col.primaryKey ? (
              <span className="bg-amber-500 rounded-full shrink-0 size-1.5" title="PK" />
            ) : col.foreignKey ? (
              <span className="bg-rose-400 rounded-full shrink-0 size-1.5" title="FK" />
            ) : (
              <span className="bg-transparent rounded-full shrink-0 size-1.5" />
            )}
            <span className="text-ink/90 font-mono truncate" title={col.name}>
              {col.name}
            </span>
            <span className="ml-auto text-slate-400 dark:text-slate-500 shrink-0">{col.type}</span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  );
}

const nodeTypes = { table: TableNode };

// Build ReactFlow nodes and edges from the sample schema using a dagre
// left-to-right layout. This mirrors the desktop app's buildGraph() so
// the demo looks identical to the real ER diagram feature.
function buildGraph(data: SampleSchema): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (!data.tables.length) return { nodes, edges };

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 120 });

  for (const table of data.tables) {
    const label = table.schema ? `${table.schema}.${table.name}` : table.name;
    const colCount = table.columns.length;
    const height = Math.max(80, colCount * 28 + 40);
    g.setNode(label, { width: 220, height });
  }

  const tableByQualified = new Map(data.tables.map((t) => [t.schema ? `${t.schema}.${t.name}` : t.name, t] as const));

  for (const table of data.tables) {
    const sourceLabel = table.schema ? `${table.schema}.${table.name}` : table.name;
    for (const col of table.columns) {
      if (!col.foreignKey) continue;
      const qualifiedTarget =
        tableByQualified.get(col.foreignKey.table) ??
        (col.foreignKey.schema ? tableByQualified.get(`${col.foreignKey.schema}.${col.foreignKey.table}`) : undefined);
      if (!qualifiedTarget) continue;
      const targetId = qualifiedTarget.schema
        ? `${qualifiedTarget.schema}.${qualifiedTarget.name}`
        : qualifiedTarget.name;
      g.setEdge(sourceLabel, targetId);
      edges.push({
        id: `${sourceLabel}-${col.name}->${targetId}`,
        source: sourceLabel,
        target: targetId,
        label: col.name,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { stroke: '#f59e0b', strokeWidth: 1.5, opacity: 0.7 },
        labelStyle: { fontSize: 10, fill: '#71717a' },
      });
    }
  }

  dagre.layout(g);

  for (const table of data.tables) {
    const label = table.schema ? `${table.schema}.${table.name}` : table.name;
    const node = g.node(label);
    nodes.push({
      id: label,
      type: 'table',
      position: { x: node.x - node.width / 2, y: node.y - node.height / 2 },
      data: { label, columns: table.columns },
    });
  }

  return { nodes, edges };
}

function SchemaGraphDemoInner() {
  const { fitView } = useReactFlow();
  const layouted = useMemo(() => buildGraph(SAMPLE_SCHEMA), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Populate nodes/edges once the dagre layout is computed.
  // fitView is called after a short delay so ReactFlow measures the canvas.
  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    const timer = setTimeout(() => fitView({ padding: 0.2 }), 100);
    return () => clearTimeout(timer);
  }, [layouted, setNodes, setEdges, fitView]);

  return (
    <div className="relative h-[420px] w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-[#27273a] bg-white dark:bg-[#0a0a0f]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        // Read-only: visitors can drag nodes to rearrange but cannot
        // create new edges or connect tables. This is a demo, not the app.
        nodesConnectable={false}
        edgesFocusable={false}
      >
        <Background gap={20} size={1} color="#e4e4e7" className="dark:[&>*]:fill-[#27273a]" />
        <Controls
          showInteractive={false}
          className="!bg-white dark:!bg-surface-strong !border !border-slate-200 dark:!border-[#27273a] [&>button]:!bg-white dark:[&>button]:!bg-surface-strong [&>button]:!border-slate-200 dark:[&>button]:!border-[#27273a] [&>button>svg]:!fill-ink [&>button]:hover:!bg-slate-100 dark:[&>button]:hover:!bg-[#12121a]"
        />
        <MiniMap
          className="!bg-white dark:!bg-surface-strong !border !border-slate-200 dark:!border-[#27273a] !rounded-lg"
          nodeColor={() => '#f59e0b33'}
          nodeStrokeColor={() => '#f59e0b'}
          maskColor="rgba(0,0,0,0.2)"
        />
      </ReactFlow>
    </div>
  );
}

export function SchemaGraphDemo() {
  // ReactFlowProvider is required for the useReactFlow hook to work.
  return (
    <ReactFlowProvider>
      <SchemaGraphDemoInner />
    </ReactFlowProvider>
  );
}
