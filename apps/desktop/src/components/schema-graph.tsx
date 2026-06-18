import { useMemo, useCallback, useEffect } from 'react';
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
import dagre from 'dagre';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { openTab } from '@/store';
import { Loader2, Table2, LayoutGrid } from 'lucide-react';

type CompletionsData = {
  tables: Array<{
    name: string;
    schema?: string;
    columns: Array<{
      name: string;
      type: string;
      primaryKey: boolean;
      foreignKey?: { table: string; column: string; schema?: string };
    }>;
  }>;
};

function useCompletionsSchema(connectionId: string | null) {
  return useQuery({
    queryKey: ['autocomplete', connectionId],
    queryFn: () => api.request<CompletionsData>('GET', `/sql/${connectionId}/autocomplete`),
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
  });
}

function TableNode({ data }: NodeProps) {
  return (
    <div className="min-w-48 bg-popover border-border rounded-lg shadow-xs border">
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="flex items-center px-3 py-1.5 bg-muted/30 border-b border-border rounded-t-lg gap-1.5">
        <Table2 className="text-muted-foreground size-3" />
        <span className="text-xs font-semibold">{data.label as string}</span>
      </div>
      <div className="px-0 py-0">
        {(
          data.columns as Array<{
            name: string;
            type: string;
            primaryKey: boolean;
            foreignKey?: { table: string; column: string; schema?: string };
          }>
        ).map((col) => (
          <div
            key={col.name}
            className="flex items-center px-3 py-1 text-xs border-b border-border/40 gap-2 last:border-b-0"
          >
            {col.primaryKey ? (
              <span className="bg-primary rounded-full shrink-0 size-1.5" title="PK" />
            ) : col.foreignKey ? (
              <span className="bg-muted-foreground rounded-full shrink-0 size-1.5" title="FK" />
            ) : (
              <span className="bg-transparent rounded-full shrink-0 size-1.5" />
            )}
            <span className="text-foreground/90 font-mono truncate" title={col.name}>
              {col.name}
            </span>
            <span className="ml-auto text-muted-foreground/60 shrink-0">{col.type}</span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  );
}

const nodeTypes = { table: TableNode };

function MiniMapNode({
  x,
  y,
  width,
  height,
  id,
  selected,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  id: string;
  selected?: boolean;
}) {
  const shortLabel = id.length > 12 ? id.slice(0, 10) + '…' : id;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        width={width}
        height={height}
        rx={4}
        ry={4}
        fill="var(--popover)"
        stroke={selected ? 'var(--primary)' : 'var(--border)'}
        strokeWidth={selected ? 2 : 1}
      />
      <text
        x={width / 2}
        y={height / 2 + 4}
        textAnchor="middle"
        fontSize={10}
        fill="var(--foreground)"
        style={{ fontFamily: 'inherit', pointerEvents: 'none' }}
      >
        {shortLabel}
      </text>
    </g>
  );
}

function buildGraph(data: CompletionsData) {
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

  const tableByQualified = new Map(data.tables.map((t) => [t.schema ? `${t.schema}.${t.name}` : t.name, t]));

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
        label: `${col.name}`,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { stroke: 'var(--primary)', strokeWidth: 1.5, opacity: 0.7 },
        labelStyle: { fontSize: 10, fill: 'var(--muted-foreground)' },
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
      data: { label, columns: table.columns, tableName: table.name, tableSchema: table.schema },
    });
  }

  return { nodes, edges };
}

type SchemaGraphProps = {
  connectionId: string;
};

function SchemaGraphInner({ connectionId }: SchemaGraphProps) {
  const { data: completions, isLoading } = useCompletionsSchema(connectionId);
  const { fitView } = useReactFlow();
  const layouted = useMemo(() => {
    if (!completions) return { nodes: [], edges: [] };
    return buildGraph(completions);
  }, [completions]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
  }, [layouted, setNodes, setEdges]);

  const handleAutoArrange = useCallback(() => {
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  }, [layouted, setNodes, setEdges, fitView]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      openTab({
        id: `${connectionId}:${node.id}`,
        type: 'table',
        title: node.id,
        connectionId,
      });
    },
    [connectionId],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="text-muted-foreground animate-spin size-5" />
      </div>
    );
  }

  if (!completions || completions.tables.length === 0) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No tables found</div>;
  }

  return (
    <div className="relative h-full w-full">
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
        <Background gap={20} size={1} color="var(--border)" />
        <Controls
          showInteractive={true}
          className="!bg-popover !border !border-border [&>button>svg]:!fill-foreground [&>button]:!bg-popover [&>button]:!border [&>button]:!border-border [&>svg]:!fill-foreground [&>button]:hover:!bg-muted"
          style={{ '--xy-controls-button-color': 'var(--foreground)' } as React.CSSProperties}
        >
          <button onClick={handleAutoArrange} className="react-flow__controls-button" title="Auto Arrange">
            <LayoutGrid className="size-4" />
          </button>
        </Controls>
        <MiniMap
          nodeComponent={MiniMapNode}
          nodeColor={(node) => {
            return node.selected ? 'var(--primary)' : 'var(--muted-foreground)';
          }}
          maskColor="rgba(0,0,0,0.4)"
          maskStrokeColor="var(--border)"
          className="!border !border-border !rounded-lg [&>svg]:!rounded-lg [&_.react-flow__minimap-node]:!fill-primary/20 [&_.react-flow__minimap-node]:!stroke-primary/40"
          style={{ backgroundColor: 'var(--popover)' }}
        />
      </ReactFlow>
    </div>
  );
}

export function SchemaGraph(props: SchemaGraphProps) {
  return (
    <ReactFlowProvider>
      <SchemaGraphInner {...props} />
    </ReactFlowProvider>
  );
}
