import React, { useState } from 'react';
import MetricCard from '../components/MetricCard';
import { Activity, AlertTriangle, CheckCircle, Database, Eye, FileCode, Layers, Zap } from 'lucide-react';

export default function OverviewView({ runDetails, loading }) {
  const [activePlot, setActivePlot] = useState(null);
  const [showConfig, setShowConfig] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-500 mx-auto"></div>
          <p className="text-sm text-slate-400">Loading run metrics and configuration...</p>
        </div>
      </div>
    );
  }

  if (!runDetails) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center text-slate-400">
        No active run found. Please select an experiment from the navbar.
      </div>
    );
  }

  const { config, metrics, warnings, plots, layer_summary } = runDetails;
  const saeCfg = config?.sae || {};
  const modelCfg = config?.model || {};
  const dataCfg = config?.data || {};

  return (
    <div className="space-y-6">
      {/* Top Banner: Run Header */}
      <div className="glass-panel rounded-2xl p-6 bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-brand-950/40 border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-brand-500/20 text-brand-300 border border-brand-500/30">
                Layer {config.layer}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase">
                {saeCfg.sae_type || 'Top-K'} SAE
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {saeCfg.width} Features {saeCfg.k ? `(k=${saeCfg.k})` : ''}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white mt-2 tracking-tight">
              Mechanistic Overview: {runDetails.exp_name}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Backbone: <span className="text-slate-200 font-medium">{modelCfg.name}</span> | Dataset:{' '}
              <span className="text-slate-200 font-medium">{dataCfg.dataset}</span> ({dataCfg.num_images} images)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium transition"
            >
              <FileCode className="h-4 w-4 text-brand-400" />
              {showConfig ? 'Hide Config' : 'View Config'}
            </button>
          </div>
        </div>

        {/* Collapsible Config Drawer */}
        {showConfig && (
          <div className="mt-4 pt-4 border-t border-slate-800">
            <pre className="bg-slate-950 p-4 rounded-xl text-xs font-mono text-cyan-300 overflow-x-auto max-h-64 border border-slate-800">
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Reconstruction MSE"
          value={metrics?.mse !== undefined ? metrics.mse.toFixed(4) : 'N/A'}
          subtitle="Lower = higher ViT fidelity"
          delta={metrics?.mse ? 'Loss' : null}
          deltaType="neutral"
          icon={Activity}
        />
        <MetricCard
          title="Explained Variance"
          value={metrics?.explained_variance !== undefined ? `${(metrics.explained_variance * 100).toFixed(1)}%` : 'N/A'}
          subtitle="Proportion of activation energy"
          delta={metrics?.explained_variance > 0.6 ? 'High Quality' : 'Moderate'}
          deltaType={metrics?.explained_variance > 0.6 ? 'positive' : 'neutral'}
          icon={Zap}
        />
        <MetricCard
          title="Sparsity (L0 Norm)"
          value={metrics?.l0 !== undefined ? metrics.l0.toFixed(1) : (saeCfg.k || 'N/A')}
          subtitle="Average active features/patch"
          delta={saeCfg.k ? `Target: ${saeCfg.k}` : null}
          deltaType="neutral"
          icon={Layers}
        />
        <MetricCard
          title="Dead Features"
          value={metrics?.dead_pct_eval !== undefined ? `${metrics.dead_pct_eval.toFixed(1)}%` : '0.0%'}
          subtitle="Zero-activation on validation set"
          delta={metrics?.dead_pct_eval > 20 ? 'High' : 'Healthy'}
          deltaType={metrics?.dead_pct_eval > 20 ? 'negative' : 'positive'}
          icon={Database}
        />
      </div>

      {/* Warnings & Diagnostics */}
      {warnings && warnings.length > 0 ? (
        <div className="glass-panel rounded-xl p-4 border-l-4 border-amber-500 bg-amber-500/5">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm mb-2">
            <AlertTriangle className="h-4 w-4" />
            Automatic Quality Diagnostics ({warnings.length})
          </div>
          <ul className="space-y-1 text-xs text-amber-200/90 list-disc list-inside">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="glass-panel rounded-xl p-3.5 border-l-4 border-emerald-500 bg-emerald-500/5 flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          <span>All automated health checks passed. No anomalies or dead dictionary collapse detected.</span>
        </div>
      )}

      {/* Plots and Visualizations Section */}
      {plots && plots.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Eye className="h-4 w-4 text-brand-400" />
              Generated Analytical Visualizations ({plots.length})
            </h3>
            <span className="text-xs text-slate-400">Click any plot to enlarge</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plots.map((plot, i) => (
              <div
                key={i}
                onClick={() => setActivePlot(plot)}
                className="glass-panel glass-panel-hover rounded-xl p-3 cursor-pointer group"
              >
                <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 border border-slate-800">
                  <img
                    src={plot.url}
                    alt={plot.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
                <p className="text-xs font-mono text-slate-300 mt-2 truncate font-medium">
                  {plot.name.replace('.png', '').replace(/_/g, ' ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plot Modal */}
      {activePlot && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setActivePlot(null)}
        >
          <div
            className="glass-panel rounded-2xl max-w-4xl w-full p-4 max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-sm font-semibold text-white font-mono">{activePlot.name}</h4>
              <button
                onClick={() => setActivePlot(null)}
                className="text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 text-xs"
              >
                Close (ESC)
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
              <img src={activePlot.url} alt={activePlot.name} className="max-h-[70vh] object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
