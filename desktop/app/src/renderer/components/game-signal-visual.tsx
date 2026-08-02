import { memo, type CSSProperties, useId } from 'react';

export type GameSignalMode = 'off' | 'waiting' | 'detected';

type SignalNode = {
  x: number;
  y: number;
  radius: number;
  depth: 'back' | 'front';
};

const nodes: SignalNode[] = [
  { x: 110, y: 19, radius: 2.5, depth: 'back' },
  { x: 70, y: 34, radius: 2.1, depth: 'back' },
  { x: 146, y: 36, radius: 2.2, depth: 'front' },
  { x: 47, y: 68, radius: 2.4, depth: 'front' },
  { x: 91, y: 62, radius: 1.9, depth: 'back' },
  { x: 131, y: 59, radius: 2.1, depth: 'front' },
  { x: 171, y: 72, radius: 2.4, depth: 'back' },
  { x: 62, y: 105, radius: 2.2, depth: 'back' },
  { x: 104, y: 93, radius: 2.1, depth: 'front' },
  { x: 151, y: 104, radius: 2.3, depth: 'front' },
  { x: 91, y: 132, radius: 2.2, depth: 'front' },
  { x: 132, y: 130, radius: 2.4, depth: 'back' },
];

const links: Array<[number, number]> = [
  [0, 1], [0, 2], [0, 4], [0, 5],
  [1, 3], [1, 4], [1, 7],
  [2, 5], [2, 6], [2, 9],
  [3, 4], [3, 7], [4, 5], [4, 8],
  [5, 6], [5, 8], [5, 9], [6, 9],
  [7, 8], [7, 10], [8, 9], [8, 10], [8, 11],
  [9, 11], [10, 11],
];

function GameSignalVisualComponent({ mode }: { mode: GameSignalMode }) {
  const gradientId = useId().replace(/:/g, '');
  const coreGradientId = `signal-core-${gradientId}`;
  const scanGradientId = `signal-scan-${gradientId}`;

  return (
    <div className="game-signal-visual" data-state={mode} aria-hidden="true">
      <span className="game-signal-visual__halo" />
      <svg viewBox="0 0 220 150" focusable="false">
        <defs>
          <radialGradient id={coreGradientId} cx="50%" cy="46%" r="54%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.98" />
            <stop offset="38%" stopColor="currentColor" stopOpacity="0.42" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={scanGradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="48%" stopColor="currentColor" stopOpacity="0.9" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g className="game-signal-visual__orbits">
          <ellipse cx="110" cy="76" rx="67" ry="48" />
          <ellipse cx="110" cy="76" rx="67" ry="24" transform="rotate(-20 110 76)" />
          <ellipse cx="110" cy="76" rx="29" ry="59" transform="rotate(21 110 76)" />
        </g>

        <g className="game-signal-visual__mesh">
          {links.map(([from, to]) => (
            <line
              key={`${from}-${to}`}
              x1={nodes[from].x}
              y1={nodes[from].y}
              x2={nodes[to].x}
              y2={nodes[to].y}
              data-depth={nodes[from].depth === 'front' || nodes[to].depth === 'front' ? 'front' : 'back'}
            />
          ))}
          {nodes.map((node, index) => (
            <circle
              key={`${node.x}-${node.y}`}
              className="game-signal-visual__node"
              cx={node.x}
              cy={node.y}
              r={node.radius}
              data-depth={node.depth}
              style={{ '--node-delay': `${index * -110}ms` } as CSSProperties}
            />
          ))}
        </g>

        <g className="game-signal-visual__core">
          <circle cx="110" cy="76" r="28" fill={`url(#${coreGradientId})`} />
          <circle className="game-signal-visual__core-ring" cx="110" cy="76" r="13" />
          <circle className="game-signal-visual__core-dot" cx="110" cy="76" r="4" />
        </g>

        <path
          className="game-signal-visual__scan"
          d="M34 77 C67 60 151 60 186 77 C151 94 67 94 34 77Z"
          fill="none"
          stroke={`url(#${scanGradientId})`}
        />
      </svg>
      <span className="game-signal-visual__floor" />
    </div>
  );
}

export const GameSignalVisual = memo(GameSignalVisualComponent);
