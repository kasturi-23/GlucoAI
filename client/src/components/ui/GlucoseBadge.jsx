export default function GlucoseBadge({ value }) {
  if (value === null || value === undefined) return null;
  if (value < 70)  return <span className="badge-danger">Low {Math.round(value)}</span>;
  if (value <= 140) return <span className="badge-safe">Normal {Math.round(value)}</span>;
  if (value <= 180) return <span className="badge-warn">Elevated {Math.round(value)}</span>;
  return <span className="badge-danger">High {Math.round(value)}</span>;
}

export function glucoseColor(value) {
  if (!value) return 'text-gray-400';
  if (value < 70)   return 'text-glucose-danger';
  if (value <= 140) return 'text-glucose-safe';
  if (value <= 180) return 'text-glucose-warning';
  return 'text-glucose-danger';
}

export function glucoseDotColor(value) {
  if (!value) return '#9ca3af';
  if (value < 70)   return '#ef4444';
  if (value <= 140) return '#22c55e';
  if (value <= 180) return '#f59e0b';
  return '#ef4444';
}
