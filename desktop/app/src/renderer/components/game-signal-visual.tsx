import { memo, useId } from 'react';
import type { CSSProperties } from 'react';

export type GameSignalMode = 'off' | 'waiting' | 'detected';
type ActiveGameSignalMode = Exclude<GameSignalMode, 'off'>;

type Filament = {
  d: string;
  surge?: boolean;
};

type SignalNode = {
  x: number;
  y: number;
  radius: number;
  hot?: boolean;
};

const backFilaments: Filament[] = [
  { d: 'M75 84 C90 42 160 34 187 73' },
  { d: 'M82 53 C111 78 150 120 177 107' },
  { d: 'M74 105 C109 119 153 44 188 59', surge: true },
  { d: 'M102 26 C117 59 147 97 164 134' },
  { d: 'M72 75 C107 71 157 89 192 87', surge: true },
  { d: 'M91 125 C116 89 145 61 178 39' },
];

const middleFilaments: Filament[] = [
  { d: 'M80 43 C98 76 145 105 181 118' },
  { d: 'M71 93 C101 53 155 54 191 98' },
  { d: 'M95 26 C122 83 141 105 162 136' },
  { d: 'M75 111 C105 104 145 46 180 51', surge: true },
  { d: 'M84 64 C109 113 156 119 184 85' },
  { d: 'M108 22 C110 63 151 88 187 74', surge: true },
  { d: 'M77 82 C111 95 151 72 183 44' },
  { d: 'M99 132 C118 104 139 43 160 28', surge: true },
];

const frontFilaments: Filament[] = [
  { d: 'M75 65 C103 79 151 91 185 113' },
  { d: 'M88 122 C108 81 152 56 184 61' },
  { d: 'M102 32 C119 68 142 96 164 127' },
  { d: 'M72 98 C106 88 148 55 190 81' },
  { d: 'M89 47 C118 115 148 122 180 99', surge: true },
  { d: 'M77 112 C108 104 148 87 189 49', surge: true },
];

const nodes: SignalNode[] = [
  { x: 128, y: 23, radius: 1.6 },
  { x: 96, y: 30, radius: 1.8 },
  { x: 159, y: 33, radius: 2.2, hot: true },
  { x: 75, y: 63, radius: 1.7 },
  { x: 187, y: 58, radius: 1.5 },
  { x: 111, y: 68, radius: 1.3 },
  { x: 150, y: 77, radius: 2.1, hot: true },
  { x: 70, y: 98, radius: 2.3, hot: true },
  { x: 96, y: 90, radius: 1.3 },
  { x: 126, y: 105, radius: 1.5 },
  { x: 189, y: 95, radius: 1.8 },
  { x: 91, y: 127, radius: 1.6 },
  { x: 125, y: 137, radius: 1.3 },
  { x: 165, y: 126, radius: 2.4, hot: true },
];

const particles = [
  [104, 20, 0.7], [145, 21, 0.55], [178, 41, 0.75], [68, 49, 0.55],
  [197, 77, 0.6], [62, 82, 0.75], [74, 118, 0.55], [111, 143, 0.65],
  [148, 141, 0.55], [184, 119, 0.75], [116, 48, 0.5], [173, 83, 0.45],
  [84, 88, 0.45], [143, 112, 0.5], [102, 115, 0.4], [158, 57, 0.45],
] as const;

function renderFilaments(filaments: Filament[], phase: number) {
  return filaments.map((filament, index) => {
    const delay = -((index * 1.47 + phase * 2.15) % 9.6);
    return (
      <path
        key={filament.d}
        d={filament.d}
        data-energy={filament.surge ? 'surge' : 'base'}
        pathLength="1"
        style={{ '--signal-line-delay': `${delay}s` } as CSSProperties}
      />
    );
  });
}

function GameSignalVisualComponent({ mode }: { mode: ActiveGameSignalMode }) {
  const instanceId = useId().replace(/:/g, '');
  const maskId = `signal-volume-mask-${instanceId}`;
  const maskGradientId = `signal-volume-mask-gradient-${instanceId}`;
  const shellGradientId = `signal-volume-shell-${instanceId}`;
  const coreGradientId = `signal-volume-core-${instanceId}`;
  const coreGlowId = `signal-volume-glow-${instanceId}`;
  const nebulaGlowId = `signal-volume-nebula-${instanceId}`;

  return (
    <div className="game-signal-visual" data-state={mode} aria-hidden="true">
      <span className="game-signal-visual__viewport" />
      <svg viewBox="0 0 260 180" focusable="false">
        <defs>
          <radialGradient id={maskGradientId}>
            <stop offset="0%" stopColor="white" />
            <stop offset="78%" stopColor="white" />
            <stop offset="100%" stopColor="black" />
          </radialGradient>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="54" y="6" width="152" height="152">
            <circle cx="130" cy="82" r="72" fill={`url(#${maskGradientId})`} />
          </mask>
          <radialGradient id={shellGradientId} cx="39%" cy="32%" r="72%">
            <stop className="game-signal-visual__shell-light" offset="0%" />
            <stop className="game-signal-visual__shell-mid" offset="48%" />
            <stop className="game-signal-visual__shell-edge" offset="100%" />
          </radialGradient>
          <radialGradient id={coreGradientId} cx="48%" cy="46%" r="56%">
            <stop className="game-signal-visual__core-white" offset="0%" />
            <stop className="game-signal-visual__core-color" offset="38%" />
            <stop className="game-signal-visual__core-clear" offset="100%" />
          </radialGradient>
          <filter id={coreGlowId} x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id={nebulaGlowId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="11" />
          </filter>
        </defs>

        <g className="game-signal-visual__body">
          <g className="game-signal-visual__shell">
            <circle
              className="game-signal-visual__shell-volume"
              cx="130"
              cy="82"
              r="65"
              fill={`url(#${shellGradientId})`}
            />
            <ellipse
              className="game-signal-visual__shell-rim game-signal-visual__shell-rim--wide"
              cx="130"
              cy="82"
              rx="64"
              ry="44"
              transform="rotate(-13 130 82)"
            />
            <ellipse
              className="game-signal-visual__shell-rim game-signal-visual__shell-rim--tall"
              cx="130"
              cy="82"
              rx="38"
              ry="63"
              transform="rotate(24 130 82)"
            />
          </g>

          <g mask={`url(#${maskId})`}>
            <g className="game-signal-visual__nebula" filter={`url(#${nebulaGlowId})`}>
              <ellipse className="game-signal-visual__nebula-field" cx="117" cy="76" rx="38" ry="27" />
              <ellipse className="game-signal-visual__nebula-drift" cx="149" cy="91" rx="35" ry="25" />
              <ellipse className="game-signal-visual__nebula-hotspot" cx="132" cy="81" rx="25" ry="20" />
            </g>
            <g className="game-signal-visual__filaments game-signal-visual__filaments--back">
              {renderFilaments(backFilaments, 0)}
            </g>
            <g className="game-signal-visual__filaments game-signal-visual__filaments--middle">
              {renderFilaments(middleFilaments, 1)}
            </g>
            <g className="game-signal-visual__filaments game-signal-visual__filaments--front">
              {renderFilaments(frontFilaments, 2)}
            </g>
            <g className="game-signal-visual__nodes">
              {nodes.map((node, index) => (
                <circle
                  key={`${node.x}-${node.y}`}
                  className="game-signal-visual__node"
                  cx={node.x}
                  cy={node.y}
                  r={node.radius}
                  data-hot={node.hot ? 'true' : 'false'}
                  style={{
                    '--signal-node-duration': `${4.8 + (index % 5) * 0.62}s`,
                    '--signal-node-delay': `${-((index * 1.31) % 6.8)}s`,
                  } as CSSProperties}
                />
              ))}
            </g>
            <g className="game-signal-visual__particles">
              {particles.map(([x, y, radius], index) => {
                const directionX = index % 2 === 0 ? 1 : -1;
                const directionY = index % 3 === 0 ? -1 : 1;
                const duration = 5.6 + (index % 6) * 0.58;
                return (
                  <circle
                    key={`${x}-${y}`}
                    cx={x}
                    cy={y}
                    r={radius}
                    style={{
                      '--signal-particle-duration': `${duration}s`,
                      '--signal-particle-delay': `${-((index * 1.17) % duration)}s`,
                      '--signal-particle-x': `${directionX * (3 + (index % 4) * 0.8)}px`,
                      '--signal-particle-y': `${directionY * (2.2 + ((index * 3) % 4) * 0.65)}px`,
                    } as CSSProperties}
                  />
                );
              })}
            </g>
          </g>

          <g className="game-signal-visual__core">
            <circle
              className="game-signal-visual__core-glow"
              cx="130"
              cy="82"
              r="27"
              filter={`url(#${coreGlowId})`}
            />
            <circle
              className="game-signal-visual__core-field"
              cx="130"
              cy="82"
              r="22"
              fill={`url(#${coreGradientId})`}
            />
            <circle className="game-signal-visual__core-ring" cx="130" cy="82" r="12" />
            <circle className="game-signal-visual__core-dot" cx="130" cy="82" r="3.4" />
          </g>

          <path
            className="game-signal-visual__search-arc"
            d="M79 103 C100 129 162 128 186 92"
            pathLength="1"
          />

          <g className="game-signal-visual__lock">
            <ellipse cx="130" cy="82" rx="53" ry="25" transform="rotate(-14 130 82)" />
            <circle className="game-signal-visual__lock-pulse" cx="130" cy="82" r="27" />
          </g>
        </g>
      </svg>
    </div>
  );
}

export const GameSignalVisual = memo(GameSignalVisualComponent);
