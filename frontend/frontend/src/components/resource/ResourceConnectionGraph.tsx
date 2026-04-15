import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ResourceConnectionNodeType = 'incoming' | 'outgoing' | 'shared';
export type ResourceConnectionEdgeType = 'incoming' | 'outgoing' | 'shared';

export interface ResourceConnectionNode {
  id: string;
  label: string;
  type: ResourceConnectionNodeType;
}

export interface ResourceConnectionEdge {
  id: string;
  source: string;
  target: string;
  type: ResourceConnectionEdgeType;
}

interface ResourceConnectionGraphProps {
  nodes: ResourceConnectionNode[];
  edges: ResourceConnectionEdge[];
  className?: string;
  emptyMessage?: string;
}

interface HighlightedState {
  nodes: Set<string>;
  edges: Set<string>;
}

const VIEWBOX_WIDTH = 960;
const VIEWBOX_HEIGHT = 520;
const CENTER_X = VIEWBOX_WIDTH / 2;
const CENTER_Y = VIEWBOX_HEIGHT / 2;
const ORBIT_RADIUS = 190;

const buildUnifiedHighlights = (
  selectedNodeId: string,
  edges: ResourceConnectionEdge[],
): HighlightedState => {
  const incomingEdges = edges.filter(
    (edge) => edge.type === 'incoming' && (edge.source === selectedNodeId || edge.target === selectedNodeId),
  );
  const outgoingEdges = edges.filter(
    (edge) => edge.type === 'outgoing' && (edge.source === selectedNodeId || edge.target === selectedNodeId),
  );
  const sharedEdges = edges.filter(
    (edge) => edge.type === 'shared' && (edge.source === selectedNodeId || edge.target === selectedNodeId),
  );

  // Keep a single merged state so incoming/outgoing/shared highlights appear together.
  const mergedEdges = [...incomingEdges, ...outgoingEdges, ...sharedEdges];
  const highlightedNodeIds = new Set<string>([selectedNodeId]);

  mergedEdges.forEach((edge) => {
    highlightedNodeIds.add(edge.source);
    highlightedNodeIds.add(edge.target);
  });

  return {
    nodes: highlightedNodeIds,
    edges: new Set<string>(mergedEdges.map((edge) => edge.id)),
  };
};

const truncateLabel = (label: string): string => {
  const trimmed = label.trim();
  if (trimmed.length <= 22) return trimmed;
  return `${trimmed.slice(0, 22)}...`;
};

const ResourceConnectionGraph = ({
  nodes,
  edges,
  className,
  emptyMessage = 'Not enough relationship data to render the resource graph yet.',
}: ResourceConnectionGraphProps) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodes[0]?.id ?? null);
  const [highlightedState, setHighlightedState] = useState<HighlightedState>({
    nodes: new Set<string>(),
    edges: new Set<string>(),
  });

  useEffect(() => {
    if (nodes.length === 0) {
      setSelectedNodeId(null);
      setHighlightedState({ nodes: new Set<string>(), edges: new Set<string>() });
      return;
    }

    setSelectedNodeId((previous) => {
      if (previous && nodes.some((node) => node.id === previous)) {
        return previous;
      }
      return nodes[0].id;
    });
  }, [nodes]);

  useEffect(() => {
    if (!selectedNodeId) {
      setHighlightedState({ nodes: new Set<string>(), edges: new Set<string>() });
      return;
    }

    setHighlightedState(buildUnifiedHighlights(selectedNodeId, edges));
  }, [selectedNodeId, edges]);

  const nodeById = useMemo(() => {
    return new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  const positionedNodes = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();

    if (nodes.length === 0 || !selectedNodeId) {
      return positions;
    }

    positions.set(selectedNodeId, { x: CENTER_X, y: CENTER_Y });

    const orbitNodes = nodes.filter((node) => node.id !== selectedNodeId);
    const orbitCount = orbitNodes.length;

    orbitNodes.forEach((node, index) => {
      const angle = (index / Math.max(orbitCount, 1)) * Math.PI * 2 - Math.PI / 2;
      const x = CENTER_X + ORBIT_RADIUS * Math.cos(angle);
      const y = CENTER_Y + ORBIT_RADIUS * Math.sin(angle);
      positions.set(node.id, { x, y });
    });

    return positions;
  }, [nodes, selectedNodeId]);

  if (nodes.length === 0) {
    return (
      <div className={cn('rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Unified Highlight</Badge>
        <Badge variant="outline" className="border-amber-300 text-amber-700">Incoming Edges</Badge>
        <Badge variant="outline" className="border-blue-300 text-blue-700">Outgoing Edges</Badge>
        <Badge variant="outline" className="border-emerald-300 text-emerald-700">Shared Edges</Badge>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/90">
        <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="h-[360px] w-full">
          {edges.map((edge) => {
            const source = positionedNodes.get(edge.source);
            const target = positionedNodes.get(edge.target);

            if (!source || !target) {
              return null;
            }

            const isHighlighted = highlightedState.edges.has(edge.id);

            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                className={cn(
                  'transition-all duration-200',
                  edge.type === 'incoming' && 'stroke-amber-500',
                  edge.type === 'outgoing' && 'stroke-blue-500',
                  edge.type === 'shared' && 'stroke-emerald-500',
                  isHighlighted ? 'opacity-100 stroke-[3px]' : 'opacity-20 stroke-[2px]',
                )}
              />
            );
          })}

          {Array.from(positionedNodes.entries()).map(([nodeId, position]) => {
            const node = nodeById.get(nodeId);
            if (!node) return null;

            const isSelected = nodeId === selectedNodeId;
            const isHighlighted = highlightedState.nodes.has(nodeId);

            return (
              <g key={nodeId}>
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={isSelected ? 34 : 28}
                  className={cn(
                    'cursor-pointer transition-all duration-200',
                    node.type === 'incoming' && (isHighlighted ? 'fill-amber-400' : 'fill-amber-200'),
                    node.type === 'outgoing' && (isHighlighted ? 'fill-blue-400' : 'fill-blue-200'),
                    node.type === 'shared' && (isHighlighted ? 'fill-emerald-400' : 'fill-emerald-200'),
                    isSelected ? 'stroke-primary stroke-[4px]' : isHighlighted ? 'stroke-primary/70 stroke-[3px]' : 'stroke-border stroke-2',
                  )}
                  onClick={() => setSelectedNodeId(nodeId)}
                >
                  <title>{node.label}</title>
                </circle>
                <text
                  x={position.x}
                  y={position.y + 5}
                  textAnchor="middle"
                  className="pointer-events-none fill-foreground text-[11px] font-semibold"
                >
                  {node.type === 'incoming' ? 'IN' : node.type === 'outgoing' ? 'OUT' : 'SH'}
                </text>
                <text
                  x={position.x}
                  y={position.y + 48}
                  textAnchor="middle"
                  className="pointer-events-none fill-muted-foreground text-[11px]"
                >
                  {truncateLabel(node.label)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-xs text-muted-foreground">
        Click any incoming, outgoing, or shared resource node to highlight the selected node and all connected incoming, outgoing, and shared edges together.
      </p>
    </div>
  );
};

export default ResourceConnectionGraph;
