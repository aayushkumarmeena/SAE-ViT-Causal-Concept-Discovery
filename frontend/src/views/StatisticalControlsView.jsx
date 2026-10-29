import React, { useState, useEffect } from 'react';
import { getRandomControls, getHypotheses, getDoseResponse } from '../api';
import { ShieldCheck, CheckCircle2, XCircle, HelpCircle, AlertCircle, BarChart2, TrendingUp, Sparkles } from 'lucide-react';

export default function StatisticalControlsView({ expName, runId }) {
  const [rcData, setRcData] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [hypotheses, setHypotheses] = useState(null);
  const [doseData, setDoseData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getRandomControls(expName, runId).catch(() => null),
      getHypotheses(expName).catch(() => null),
    ]).then(([rc, h]) => {
      setRcData(rc);
      if (rc && rc.available_features && rc.available_features.length > 0) {
        const initFeat = rc.selected_feature || rc.available_features[0];
        setSelectedFeature(initFeat);
        getDoseResponse(expName, runId, initFeat).then(dr => setDoseData(dr)).catch(() => null);
      }
      setHypotheses(h?.hypotheses || null);
      setLoading(false);
    });
  }, [expName, runId]);

  const handleFeatureChange = (fid) => {
    setSelectedFeature(fid);
    getRandomControls(expName, runId, fid).then(res => setRcData(res));
    getDoseResponse(expName, runId, fid).then(dr => setDoseData(dr)).catch(() => null);
  };

  const getVerdictBadge = (verdict) => {
    const v = (verdict || '').toLowerCase();
    if (v.includes('supported') && !v.includes('not supported') && !v.includes('partially')) {
      return (
        <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="h-3.5 w-3.5" /> Supported
        </span>
      );
    }
    if (v.includes('partially')) {
      return (
        <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
          <HelpCircle className="h-3.5 w-3.5" /> Partially Supported
        </span>
      );
    }
    if (v.includes('not supported')) {
      return (
        <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
          <XCircle className="h-3.5 w-3.5" /> Not Supported
        </span>
      );
    }
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 border border-slate-700">
        {verdict || 'Not Tested'}
      </span>
    );
  };

  // Render SVG Dose Response Curve
  const renderDoseChart = () => {
    if (!doseData || !doseData.has_data || !doseData.multipliers) return null;

    const mults = doseData.multipliers;
    const means = doseData.mean_logit;
    const rmeans = doseData.random_mean_curve || [];

    const minVal = Math.min(...means, ...(rmeans.length ? rmeans : []));
    const maxVal = Math.max(...means, ...(rmeans.length ? rmeans : []));
    const span = maxVal - minVal || 0.001;

    const width = 600;
    const height = 200;
    const pad = 40;

    const getX = (idx) => pad + (idx / (mults.length - 1)) * (width - 2 * pad);
    const getY = (val) => height - pad - ((val - minVal) / span) * (height - 2 * pad);

    // Build polyline points
    const points = means.map((m, i) => `${getX(i)},${getY(m)}`).join(' ');
    const randPoints = rmeans.map((m, i) => `${getX(i)},${getY(m)}`).join(' ');

    return (
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white font-mono">
              Dose-Response Monotonicity Curve (Feature #{doseData.feature_id})
            </span>
            {doseData.fallback_used && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                Evaluated Representative
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono">
            <span className="text-cyan-400">● Candidate Feature</span>
            <span className="text-slate-500">┄ Random Null Baseline</span>
          </div>
        </div>

        <div className="relative overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48 select-none">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((ratio, i) => {
              const y = pad + ratio * (height - 2 * pad);
              return (
                <line
                  key={i}
                  x1={pad}
                  y1={y}
                  x2={width - pad}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="3,3"
                />
              );
            })}

            {/* Random Controls Null Baseline Curve */}
            {rmeans.length > 0 && (
              <polyline
                fill="none"
                stroke="#64748b"
                strokeWidth="2"
                strokeDasharray="4,4"
                points={randPoints}
              />
            )}

            {/* Candidate Feature Curve */}
            <polyline
              fill="none"
              stroke="#38a9f6"
              strokeWidth="2.5"
              points={points}
            />

            {/* Candidate points */}
            {means.map((m, i) => (
              <g key={i}>
                <circle cx={getX(i)} cy={getY(m)} r="4" fill="#38a9f6" />
                <text
                  x={getX(i)}
                  y={height - 12}
                  fill="#94a3b8"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {mults[i]}x
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-850 text-xs font-mono">
          <div className="bg-slate-900/60 p-2 rounded-lg">
            <span className="text-[10px] text-slate-500 block">Spearman Rank (ρ)</span>
            <span className="font-bold text-cyan-300 font-mono">
              {doseData.spearman_rho !== undefined ? doseData.spearman_rho.toFixed(3) : 'N/A'}
            </span>
          </div>
          <div className="bg-slate-900/60 p-2 rounded-lg">
            <span className="text-[10px] text-slate-500 block">Monotone Trend</span>
            <span className="font-bold text-emerald-400">
              {doseData.monotone_increasing ? 'Increasing ↑' : doseData.monotone_decreasing ? 'Decreasing ↓' : 'Non-linear'}
            </span>
          </div>
          <div className="bg-slate-900/60 p-2 rounded-lg">
            <span className="text-[10px] text-slate-500 block">Baseline (x0 Ablate)</span>
            <span className="text-rose-400 font-mono">
              {means[0]?.toFixed(4)}
            </span>
          </div>
          <div className="bg-slate-900/60 p-2 rounded-lg">
            <span className="text-[10px] text-slate-500 block">Max Dose (x5.0 Amplify)</span>
            <span className="text-cyan-300 font-mono">
              {means[means.length - 1]?.toFixed(4)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Statistical Hypothesis & Dose-Response Validation</h2>
            <p className="text-xs text-slate-400">
              Rigorous empirical controls against frequency-matched random feature baselines & paired non-parametric tests.
            </p>
          </div>
        </div>
      </div>

      {/* Scientific Hypotheses H1-H6 Grid */}
      {hypotheses && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            Formal Research Hypotheses (selftest / full)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { id: 'H1', title: 'H1: Interpretability Advantage', desc: 'SAE features exhibit higher purity & spatial concentration than individual ViT neurons.' },
              { id: 'H2', title: 'H2: Depth Hierarchy', desc: 'Higher ViT blocks encode increasingly abstract, class-specific concepts compared to lower layers.' },
              { id: 'H3', title: 'H3: Causal Specificity (Ablation)', desc: 'Ablating candidate causal features drops target class logit significantly more than random controls.' },
              { id: 'H4', title: 'H4: Causal Steering (Amplification)', desc: 'Amplifying concepts monotonically increases target logits beyond frequency-matched null controls.' },
              { id: 'H5', title: 'H5: Spatial Localization', desc: 'Local patch interventions produce higher per-patch causal effect than global blanket interventions.' },
              { id: 'H6', title: 'H6: Feature Interaction', desc: 'Distinct concept pairs exhibit measurable sub-additive (redundancy) or super-additive (synergy) interactions.' },
            ].map(h => {
              const res = hypotheses[h.id];
              return (
                <div key={h.id} className="glass-panel rounded-xl p-4 flex flex-col justify-between space-y-3 border border-slate-800">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold font-mono text-cyan-400">{h.id}</span>
                      {getVerdictBadge(res?.verdict)}
                    </div>
                    <h4 className="text-xs font-semibold text-slate-200">{h.title}</h4>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{h.desc}</p>
                  </div>
                  {res?.details && (
                    <div className="pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-300 space-y-1">
                      {res.details.purity && (
                        <div>Purity p: <span className="text-brand-300">{res.details.purity.p?.toExponential(2)}</span></div>
                      )}
                      {res.details.spatial_conc10 && (
                        <div>SCS p: <span className="text-cyan-300">{res.details.spatial_conc10.p?.toExponential(2)}</span></div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Random Controls & Dose Response Section */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Random Controls & Monotonic Dose-Response</h3>
            <p className="text-xs text-slate-400">
              Candidate feature effect vs distribution of 30 frequency-matched control features.
            </p>
          </div>

          {rcData?.available_features && rcData.available_features.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Select Feature:</label>
              <select
                value={selectedFeature || ''}
                onChange={e => handleFeatureChange(parseInt(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-cyan-300 font-mono focus:outline-none"
              >
                {rcData.available_features.map(f => (
                  <option key={f} value={f}>
                    Feature #{f}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 9-Point Dose Response Curve */}
        {renderDoseChart()}

        {/* Statistical Tables */}
        {rcData?.ablation && Object.keys(rcData.ablation).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Ablation Statistical Box */}
            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                <span>Ablation Condition</span>
                <span className="text-[10px] text-cyan-400 font-mono">
                  {rcData.ablation.p_empirical < 0.05 ? 'Statistically Separated' : 'Null Effect'}
                </span>
              </h4>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500">Candidate Mean Effect</span>
                  <p className="text-sm font-mono font-bold text-rose-400">
                    {rcData.ablation.cand_mean?.toFixed(4)}
                  </p>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500">Random Controls Mean</span>
                  <p className="text-sm font-mono font-bold text-slate-300">
                    {rcData.ablation.rand_mean?.toFixed(4)}
                  </p>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500">Empirical p-value</span>
                  <p className="text-sm font-mono font-bold text-cyan-300">
                    {rcData.ablation.p_empirical?.toFixed(4)}
                  </p>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500">Wilcoxon p (Paired)</span>
                  <p className="text-sm font-mono font-bold text-cyan-300">
                    {rcData.ablation.paired_p_wilcoxon?.toExponential(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Amplification Statistical Box */}
            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                <span>Amplification Condition</span>
                <span className="text-[10px] text-cyan-400 font-mono">
                  {rcData.amplification?.p_empirical < 0.05 ? 'Statistically Separated' : 'Null Effect'}
                </span>
              </h4>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500">Candidate Mean Effect</span>
                  <p className="text-sm font-mono font-bold text-emerald-400">
                    {rcData.amplification?.cand_mean?.toFixed(4) || 'N/A'}
                  </p>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500">Random Controls Mean</span>
                  <p className="text-sm font-mono font-bold text-slate-300">
                    {rcData.amplification?.rand_mean?.toFixed(4) || 'N/A'}
                  </p>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500">Empirical p-value</span>
                  <p className="text-sm font-mono font-bold text-cyan-300">
                    {rcData.amplification?.p_empirical?.toFixed(4) || 'N/A'}
                  </p>
                </div>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500">Paired Effect Size (dz)</span>
                  <p className="text-sm font-mono font-bold text-cyan-300">
                    {rcData.amplification?.paired_dz?.toFixed(2) || 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-slate-400 bg-slate-900/40 rounded-xl">
            No random controls generated yet for this run. Run causal evaluation (`evaluate.py`) to compute controls.
          </div>
        )}
      </div>
    </div>
  );
}
