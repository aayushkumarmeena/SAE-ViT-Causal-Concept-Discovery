import React, { useState, useEffect } from 'react';
import { getComparisons } from '../api';
import { GitCompare, Layers } from 'lucide-react';

export default function ComparisonsView({ expName }) {
  const [comparisons, setComparisons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getComparisons(expName)
      .then(res => setComparisons(res.rows || []))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [expName]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <GitCompare className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Architectural & Layer Benchmarks</h2>
            <p className="text-xs text-slate-400">
              Cross-run comparisons: reconstruction fidelity (MSE), sparsity (L0), interpretability metrics, and causal efficacy across ViT depths and SAE variants.
            </p>
          </div>
        </div>
      </div>

      {/* Comparisons Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-sans font-medium">
                <th className="py-3 px-4">Run Tag</th>
                <th className="py-3 px-4">Layer</th>
                <th className="py-3 px-4">SAE Type</th>
                <th className="py-3 px-4">Width</th>
                <th className="py-3 px-4">MSE</th>
                <th className="py-3 px-4">Exp Var</th>
                <th className="py-3 px-4">L0</th>
                <th className="py-3 px-4">Dead %</th>
                <th className="py-3 px-4">Median Purity</th>
                <th className="py-3 px-4">Causal Drop</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 font-sans">
                    Loading comparison benchmarks...
                  </td>
                </tr>
              ) : comparisons.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 font-sans">
                    No comparison data available yet. Run the pipeline with <code className="text-cyan-400">--sweep</code> to benchmark multiple layers or widths.
                  </td>
                </tr>
              ) : (
                comparisons.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-semibold text-white">{row.run_tag}</td>
                    <td className="py-3 px-4 text-cyan-300">L{row.layer}</td>
                    <td className="py-3 px-4 uppercase text-slate-300">{row.sae_type}</td>
                    <td className="py-3 px-4 text-slate-300">{row.width}</td>
                    <td className="py-3 px-4 text-slate-200">
                      {row.mse !== undefined && row.mse !== null ? Number(row.mse).toFixed(4) : '-'}
                    </td>
                    <td className="py-3 px-4 text-emerald-400">
                      {row.explained_variance !== undefined && row.explained_variance !== null
                        ? `${(Number(row.explained_variance) * 100).toFixed(1)}%`
                        : '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {row.l0 !== undefined && row.l0 !== null ? Number(row.l0).toFixed(1) : '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {row.dead_pct_eval !== undefined && row.dead_pct_eval !== null
                        ? `${Number(row.dead_pct_eval).toFixed(1)}%`
                        : '-'}
                    </td>
                    <td className="py-3 px-4 text-brand-300">
                      {row.median_purity !== undefined && row.median_purity !== null
                        ? Number(row.median_purity).toFixed(2)
                        : '-'}
                    </td>
                    <td className="py-3 px-4 text-rose-400">
                      {row.mean_ablation_logit_effect !== undefined && row.mean_ablation_logit_effect !== null
                        ? Number(row.mean_ablation_logit_effect).toFixed(4)
                        : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
