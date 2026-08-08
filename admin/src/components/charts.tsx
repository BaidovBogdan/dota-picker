import { useId, useMemo, useRef, useState } from 'react';
import { ChartTooltip } from './ui';
import { formatCount, formatPercent, formatShortDate } from '../lib/format';
import type { DailyMetric } from '../types';

type SeriesKey = 'analyses' | 'activeUsers' | 'failed';

type TooltipPosition = {
  edge: 'start' | 'middle' | 'end';
  left: string;
  top: string;
};

const activitySeries: Array<{ key: SeriesKey; label: string; forms: readonly [string, string, string]; color: string }> = [
  { key: 'analyses', label: 'Проверки', forms: ['проверка', 'проверки', 'проверок'], color: '#625bf6' },
  { key: 'activeUsers', label: 'Пользователи', forms: ['пользователь', 'пользователя', 'пользователей'], color: '#138a65' },
  { key: 'failed', label: 'Ошибки', forms: ['ошибка', 'ошибки', 'ошибок'], color: '#d84a52' },
];

function uniqueIndexes(values: number[]) {
  return [...new Set(values)];
}

export function ActivityChart({ metrics }: { metrics: DailyMetric[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = useId().replaceAll(':', '');
  const [visible, setVisible] = useState<Set<SeriesKey>>(() => new Set(activitySeries.map(({ key }) => key)));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const width = 900;
  const height = 290;
  const padding = { top: 20, right: 18, bottom: 38, left: 46 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const visibleSeries = activitySeries.filter(({ key }) => visible.has(key));
  const rawMaximum = Math.max(1, ...metrics.flatMap((metric) => activitySeries
    .filter(({ key }) => visible.has(key))
    .map(({ key }) => metric[key])));
  const maximum = Math.max(4, Math.ceil(rawMaximum / 4) * 4);
  const points = metrics.map((metric, index) => ({
    ...metric,
    x: padding.left + (index / Math.max(1, metrics.length - 1)) * innerWidth,
  }));
  const yFor = (value: number) => padding.top + innerHeight - (value / maximum) * innerHeight;
  const pathFor = (key: SeriesKey) => points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${yFor(point[key])}`)
    .join(' ');
  const analysesPath = pathFor('analyses');
  const areaPath = `${analysesPath} L ${points.at(-1)?.x ?? 0} ${padding.top + innerHeight} L ${points[0]?.x ?? 0} ${padding.top + innerHeight} Z`;
  const ticks = Array.from({ length: 5 }, (_, index) => (maximum / 4) * index).reverse();
  const xTickIndexes = metrics.length <= 7
    ? metrics.map((_, index) => index)
    : uniqueIndexes([0, Math.floor((metrics.length - 1) / 3), Math.floor(((metrics.length - 1) * 2) / 3), metrics.length - 1]);
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeDescription = activePoint
    ? `${formatShortDate(activePoint.date)}: ${visibleSeries.map((series) => formatCount(activePoint[series.key], series.forms)).join(', ')}`
    : 'Используйте стрелки влево и вправо, чтобы изучить дни.';
  const primarySeries = visibleSeries[0];

  const showKeyboardPoint = (index: number) => {
    const point = points[index];
    if (!point) return;
    setActiveIndex(index);
    setTooltipPosition({
      edge: index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle',
      left: `${(point.x / width) * 100}%`,
      top: `${(Math.min(...visibleSeries.map((series) => yFor(point[series.key]))) / height) * 100}%`,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !points.length) return;
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const viewBoxX = (pointerX / bounds.width) * width;
    const normalizedX = Math.min(1, Math.max(0, (viewBoxX - padding.left) / innerWidth));
    const nearestIndex = Math.round(normalizedX * (points.length - 1));
    const edge = pointerX < 110 ? 'start' : pointerX > bounds.width - 110 ? 'end' : 'middle';
    setActiveIndex(nearestIndex);
    setTooltipPosition({
      edge,
      left: edge === 'start' ? '10px' : edge === 'end' ? `${bounds.width - 10}px` : `${pointerX}px`,
      top: `${Math.max(82, Math.min(bounds.height - 8, pointerY))}px`,
    });
  };

  const toggleSeries = (key: SeriesKey) => {
    setVisible((current) => {
      if (current.has(key) && current.size === 1) return current;
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!metrics.length) return <div className="chart-empty" role="status">За выбранный период нет данных для графика.</div>;

  return (
    <div className="activity-chart activity-chart--interactive">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        tabIndex={0}
        aria-label={`Динамика продукта. ${activeDescription}`}
        onFocus={() => showKeyboardPoint(activeIndex ?? metrics.length - 1)}
        onBlur={() => {
          setActiveIndex(null);
          setTooltipPosition(null);
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          if (event.key === 'Home') showKeyboardPoint(0);
          else if (event.key === 'End') showKeyboardPoint(metrics.length - 1);
          else showKeyboardPoint(Math.min(metrics.length - 1, Math.max(0, (activeIndex ?? metrics.length - 1) + (event.key === 'ArrowRight' ? 1 : -1))));
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          if (document.activeElement === svgRef.current) showKeyboardPoint(activeIndex ?? metrics.length - 1);
          else {
            setActiveIndex(null);
            setTooltipPosition(null);
          }
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#625bf6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#625bf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chart-grid" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" className="chart-label">{Math.round(tick)}</text>
            </g>
          );
        })}
        {visible.has('analyses') ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
        {activitySeries.map((series) => visible.has(series.key) ? (
          <path
            d={pathFor(series.key)}
            className={`chart-line chart-line--${series.key}`}
            key={series.key}
          />
        ) : null)}
        <rect x={0} y={0} width={width} height={height} className="chart-hit" />
        {activePoint ? <line x1={activePoint.x} x2={activePoint.x} y1={padding.top} y2={padding.top + innerHeight} className="chart-guide" /> : null}
        {activePoint ? activitySeries.map((series) => visible.has(series.key) ? (
          <circle
            key={series.key}
            cx={activePoint.x}
            cy={yFor(activePoint[series.key])}
            r="5"
            className={`chart-dot chart-dot--${series.key} is-active`}
          />
        ) : null) : null}
        {xTickIndexes.map((index) => (
          <text
            key={metrics[index].date}
            x={points[index].x}
            y={height - 8}
            textAnchor={index === 0 ? 'start' : index === metrics.length - 1 ? 'end' : 'middle'}
            className="chart-label"
          >
            {formatShortDate(metrics[index].date)}
          </text>
        ))}
      </svg>
      {activePoint && tooltipPosition ? (
        <ChartTooltip
          title={formatShortDate(activePoint.date)}
          value={formatCount(activePoint[primarySeries.key], primarySeries.forms)}
          detail={visibleSeries.slice(1).map((series) => formatCount(activePoint[series.key], series.forms)).join(' · ')}
          className={`chart-tooltip--point is-visible ${tooltipPosition.edge === 'middle' ? '' : `is-${tooltipPosition.edge}`}`}
          style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
        />
      ) : null}
      <div className="chart-series-controls" aria-label="Показатели графика">
        {activitySeries.map((series) => (
          <button
            type="button"
            aria-pressed={visible.has(series.key)}
            onClick={() => toggleSeries(series.key)}
            style={{ '--series-color': series.color } as React.CSSProperties}
            key={series.key}
          >
            <i />
            {series.label}
          </button>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">{activeDescription}</span>
    </div>
  );
}

type Rating = 1 | 2 | 3 | 4 | 5;

export function RatingDistributionChart({
  distribution,
  total,
  selectedRating,
  onSelect,
}: {
  distribution: Record<Rating, number>;
  total: number;
  selectedRating: Rating | null;
  onSelect: (rating: Rating | null) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeRating, setActiveRating] = useState<Rating | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const ratings = useMemo(() => [5, 4, 3, 2, 1] as const, []);

  const showForFocus = (rating: Rating, index: number) => {
    setActiveRating(rating);
    setTooltipPosition({ edge: 'middle', left: '58%', top: `${30 + index * 34}px` });
  };

  if (!total) return <div className="chart-empty chart-empty--compact" role="status">Оценок пока нет.</div>;

  return (
    <div className="rating-chart" ref={rootRef}>
      {ratings.map((rating, index) => {
        const count = distribution[rating];
        const share = total ? (count / total) * 100 : 0;
        return (
          <button
            type="button"
            className={selectedRating === rating ? 'is-selected' : ''}
            aria-label={`${rating} звёзд: ${count} отзывов, ${formatPercent(share, 1)}. ${selectedRating === rating ? 'Снять фильтр' : 'Отфильтровать таблицу'}`}
            aria-pressed={selectedRating === rating}
            onClick={() => onSelect(selectedRating === rating ? null : rating)}
            onFocus={() => showForFocus(rating, index)}
            onBlur={() => {
              setActiveRating(null);
              setTooltipPosition(null);
            }}
            onPointerMove={(event) => {
              const bounds = rootRef.current?.getBoundingClientRect();
              if (!bounds) return;
              const pointerX = event.clientX - bounds.left;
              const pointerY = event.clientY - bounds.top;
              const edge = pointerX < 100 ? 'start' : pointerX > bounds.width - 100 ? 'end' : 'middle';
              setActiveRating(rating);
              setTooltipPosition({
                edge,
                left: edge === 'start' ? '8px' : edge === 'end' ? `${bounds.width - 8}px` : `${pointerX}px`,
                top: `${Math.max(70, pointerY)}px`,
              });
            }}
            onPointerLeave={(event) => {
              if (document.activeElement === event.currentTarget) showForFocus(rating, index);
              else {
                setActiveRating(null);
                setTooltipPosition(null);
              }
            }}
            key={rating}
          >
            <span>{rating}</span>
            <i><b style={{ width: `${share}%` }} /></i>
            <strong>{count}</strong>
          </button>
        );
      })}
      {activeRating && tooltipPosition ? (
        <ChartTooltip
          title={`${activeRating} ${activeRating === 1 ? 'звезда' : activeRating < 5 ? 'звезды' : 'звёзд'}`}
          value={formatCount(distribution[activeRating], ['отзыв', 'отзыва', 'отзывов'])}
          detail={`${formatPercent(total ? (distribution[activeRating] / total) * 100 : 0, 1)} выборки · нажмите для фильтра`}
          className={`chart-tooltip--point is-visible ${tooltipPosition.edge === 'middle' ? '' : `is-${tooltipPosition.edge}`}`}
          style={{ left: tooltipPosition.left, top: tooltipPosition.top }}
        />
      ) : null}
    </div>
  );
}
