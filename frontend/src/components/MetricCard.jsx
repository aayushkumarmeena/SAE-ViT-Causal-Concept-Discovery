import React from 'react';

export default function MetricCard({ title, value, subtitle, delta, deltaType = 'neutral', icon: Icon }) {
  const deltaColor =
    deltaType === 'positive'
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : deltaType === 'negative'
      ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
      : 'text-slate-400 bg-slate-800 border-slate-700';

  return (
    <div className="glass-panel glass-panel-hover rounded-xl p-4 sm:p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
        <span>{title}</span>
        {Icon && <Icon className="h-4 w-4 text-brand-400 opacity-80" />}
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-xl sm:text-2xl font-bold tracking-tight text-white font-mono">{value}</span>
        {delta && (
          <span className={`text-xs px-2 py-0.5 rounded-md border font-mono font-medium ${deltaColor}`}>
            {delta}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-slate-400 mt-2 truncate">{subtitle}</p>}
    </div>
  );
}
