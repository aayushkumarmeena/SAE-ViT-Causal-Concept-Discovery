import React, { useState, useEffect } from 'react';
import { getFeatures, getFeatureDetail } from '../api';
import HeatmapViewer from '../components/HeatmapViewer';
import { Database, Search, Filter, ArrowUpDown, ChevronRight, X, ExternalLink, Sparkles, Layers } from 'lucide-react';

export default function FeatureExplorerView({ expName, runId, onSelectFeatureForStudio }) {
  const [features, setFeatures] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('purity');
  const [sortDesc, setSortDesc] = useState(true);
  const [aliveOnly, setAliveOnly] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  // Selected feature detail modal
  const [selectedFid, setSelectedFid] = useState(null);
  const [featureDetail, setFeatureDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchFeatures = () => {
    setLoading(true);
    getFeatures(expName, runId, {
      search: search || undefined,
      sort_by: sortBy,
      sort_desc: sortDesc,
      alive_only: aliveOnly,
      limit,
      offset,
    })
      .then(res => {
        setFeatures(res.features || []);
        setTotal(res.total || 0);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setOffset(0);
  }, [search, sortBy, sortDesc, aliveOnly, expName, runId]);

  useEffect(() => {
    fetchFeatures();
  }, [expName, runId, search, sortBy, sortDesc, aliveOnly, offset]);

  // Load feature detail
  const handleSelectFeature = (fid) => {
    setSelectedFid(fid);
    setDetailLoading(true);
    getFeatureDetail(expName, runId, fid)
      .then(res => setFeatureDetail(res))
      .catch(err => console.error(err))
      .finally(() => setDetailLoading(false));
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Header */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search concepts, classes, or feature ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-brand-500 focus:outline-none transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="purity">Purity (Class focus)</option>
                <option value="spatial_conc10">Spatial Conc (SCS)</option>
                <option value="freq">Activation Frequency</option>
                <option value="causal_rank">Causal Rank</option>
                <option value="feature_id">Feature ID</option>
              </select>
              <button
                onClick={() => setSortDesc(!sortDesc)}
                className="text-slate-400 hover:text-white font-mono font-bold ml-1"
                title="Toggle Sort Order"
              >
                {sortDesc ? 'DESC' : 'ASC'}
              </button>
            </div>

            {/* Alive only toggle */}
            <label className="flex items-center gap-2 cursor-pointer bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
              <input
                type="checkbox"
                checked={aliveOnly}
                onChange={e => setAliveOnly(e.target.checked)}
                className="accent-brand-500 rounded"
              />
              <span className="text-slate-300">Alive Only</span>
            </label>

            <span className="text-slate-500 font-mono text-[11px] ml-auto">
              Showing {features.length} of {total} features
            </span>
          </div>
        </div>
      </div>

      {/* Main Table Layout */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 font-medium">
                <th className="py-3 px-4">Feature ID</th>
                <th className="py-3 px-4">Discovered Concept / Class</th>
                <th className="py-3 px-4">Purity</th>
                <th className="py-3 px-4">Spatial Conc (SCS)</th>
                <th className="py-3 px-4">Frequency</th>
                <th className="py-3 px-4">Specificity</th>
                <th className="py-3 px-4">Causal Rank</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto mb-2"></div>
                    Loading discovered concepts...
                  </td>
                </tr>
              ) : features.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No matching features found. Try loosening search or filters.
                  </td>
                </tr>
              ) : (
                features.map(f => (
                  <tr
                    key={f.feature_id}
                    onClick={() => handleSelectFeature(f.feature_id)}
                    className="hover:bg-slate-800/40 cursor-pointer transition"
                  >
                    <td className="py-3 px-4 font-bold text-white">
                      #{f.feature_id}
                      {f.dead && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          DEAD
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-sans font-medium text-slate-200">
                      {f.clip_concept ? (
                        <span className="text-brand-300 font-semibold">{f.clip_concept}</span>
                      ) : (
                        <span>{f.top_class_name || 'N/A'}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {f.purity !== undefined ? `${(f.purity * 100).toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {f.spatial_conc10 !== undefined ? f.spatial_conc10.toFixed(2) : '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {f.freq !== undefined ? f.freq.toFixed(4) : '-'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-sans uppercase font-semibold ${
                          f.specificity === 'monosemantic'
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            : f.specificity === 'specific'
                            ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {f.specificity || 'standard'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {f.causal_rank !== undefined && f.causal_rank !== null ? (
                        <span className="text-amber-300 font-bold">#{f.causal_rank}</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <ChevronRight className="h-4 w-4 text-slate-500 inline group-hover:text-white" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-900/30">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span>
            Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit) || 1}
          </span>
          <button
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      {/* Feature Detail Modal / Drawer */}
      {selectedFid !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedFid(null)}
        >
          <div
            className="glass-panel rounded-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto space-y-6 bg-slate-900 border border-slate-700"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold font-mono text-cyan-400">Feature #{selectedFid}</span>
                {featureDetail?.summary?.dead && (
                  <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    Dead Feature
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedFid(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailLoading || !featureDetail ? (
              <div className="py-12 text-center text-slate-400">Loading feature profile...</div>
            ) : (
              <div className="space-y-6">
                {/* Concept Metrics Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-400">Top Class</span>
                    <p className="text-sm font-semibold text-white mt-1">
                      {featureDetail.summary.top_class_name || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-400">Class Purity</span>
                    <p className="text-sm font-mono font-semibold text-white mt-1">
                      {(featureDetail.summary.purity * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-400">Spatial Conc (SCS)</span>
                    <p className="text-sm font-mono font-semibold text-white mt-1">
                      {featureDetail.summary.spatial_conc10?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-400">Frequency</span>
                    <p className="text-sm font-mono font-semibold text-white mt-1">
                      {featureDetail.summary.freq?.toFixed(4) || '0.0000'}
                    </p>
                  </div>
                </div>

                {/* CLIP Semantics if present */}
                {featureDetail.summary.clip_concept && (
                  <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs">
                    <span className="text-brand-400 font-bold uppercase tracking-wider block mb-1">
                      CLIP Concept Alignment
                    </span>
                    <p className="text-sm font-medium text-white">
                      Aligned concept: <strong>{featureDetail.summary.clip_concept}</strong> (score:{' '}
                      {featureDetail.summary.clip_score?.toFixed(3)}, entropy:{' '}
                      {featureDetail.summary.clip_entropy?.toFixed(2)})
                    </p>
                    {featureDetail.summary.clip_top3 && (
                      <p className="text-slate-400 text-xs mt-1">
                        Top-3 Candidates: {featureDetail.summary.clip_top3}
                      </p>
                    )}
                  </div>
                )}

                {/* Heatmaps Viewer */}
                <HeatmapViewer
                  heatmaps={featureDetail.heatmaps}
                  title={`Feature #${selectedFid} Spatial Heatmaps`}
                />

                {/* Top Patches Gallery */}
                {featureDetail.top_patches && featureDetail.top_patches.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                      Strongest Activating Image Patches ({featureDetail.top_patches.length})
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {featureDetail.top_patches.map((p, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-[11px] font-mono"
                        >
                          <div className="text-slate-300 truncate font-sans font-medium">{p.class}</div>
                          <div className="text-brand-400 mt-1">Act: {p.activation?.toFixed(2)}</div>
                          <div className="text-slate-500 text-[10px]">Pos #{p.position}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action button */}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => {
                      if (onSelectFeatureForStudio) {
                        onSelectFeatureForStudio(selectedFid);
                      }
                      setSelectedFid(null);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md shadow-brand-500/20"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in Causal Steering Studio
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
