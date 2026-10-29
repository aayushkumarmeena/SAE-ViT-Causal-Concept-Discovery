import React, { useState, useEffect } from 'react';
import { runInteraction, getCircuitGraph } from '../api';
import { Layers, Play, RefreshCw, AlertCircle, Share2, Network, Sparkles, Filter, Info, ArrowRight } from 'lucide-react';

export default function InteractionsView({ expName, runId }) {
  const [featureA, setFeatureA] = useState(0);
  const [featureB, setFeatureB] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Circuit graph state
  const [graphData, setGraphData] = useState(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterCausalOnly, setFilterCausalOnly] = useState(false);
  const [nodeCountLimit, setNodeCountLimit] = useState(20);

  useEffect(() => {
    loadGraph();
  }, [expName, runId, nodeCountLimit]);

  const loadGraph = async () => {
    setLoadingGraph(true);
    try {
      const data = await getCircuitGraph(expName, runId, nodeCountLimit);
      setGraphData(data);
      if (data.nodes && data.nodes.length >= 2) {
        setFeatureA(data.nodes[0].id);
        setFeatureB(data.nodes[1].id);
      }
    } catch (e) {
      console.warn("Could not load circuit graph:", e);
    } finally {
      setLoadingGraph(false);
    }
  };

  const handleCompute = async (overrideA = null, overrideB = null) => {
    const a = overrideA !== null ? overrideA : featureA;
    const b = overrideB !== null ? overrideB : featureB;
    if (a === b) {
      setError('Please select two distinct features for pairwise interaction analysis.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await runInteraction(expName, runId, {
        feature_a: parseInt(a),
        feature_b: parseInt(b),
      });
      setResult(res);
    } catch (err) {
      setError(`Failed to compute interaction: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const selectNodeForPair = (nodeId) => {
    if (featureA === nodeId) {
      // already A
      return;
    }
    if (featureB === nodeId) {
      // flip or do nothing
      return;
    }
    // Set Feature B if Feature A is already chosen
    setFeatureB(nodeId);
  };

  // Layout nodes in SVG in a circular or multi-column layout
  const filteredNodes = graphData?.nodes?.filter(n => {
    if (filterCausalOnly) return n.causal_rank !== null && n.causal_rank !== undefined;
    return true;
  }) || [];

  const svgWidth = 640;
  const svgHeight = 440;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;
  const radius = 160;

  // Compute node coordinates in a ring
  const nodeCoords = {};
  filteredNodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / (filteredNodes.length || 1) - Math.PI / 2;
    nodeCoords[node.id] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      node,
    };
  });

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Network className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Concept Circuit Graph & Interaction Lab</h2>
              <p className="text-xs text-slate-400">
                Explore feature co-activation subgraphs, decoder geometry, and non-linear interactions ($I = \Delta z_{AB} - (\Delta z_A + \Delta z_B)$).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadGraph}
              disabled={loadingGraph}
              className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingGraph ? 'animate-spin' : ''}`} />
              Refresh Graph
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="glass-panel rounded-xl p-4 border-l-4 border-rose-500 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Interactive Circuit Network Graph + Interaction Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Circuit Graph */}
        <div className="lg:col-span-7 glass-panel rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-white">Circuit Connectivity Graph</h3>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterCausalOnly}
                    onChange={e => setFilterCausalOnly(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-purple-500 focus:ring-0"
                  />
                  <span>Causal Only</span>
                </label>
                <select
                  value={nodeCountLimit}
                  onChange={e => setNodeCountLimit(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2 py-1 text-slate-300 focus:outline-none"
                >
                  <option value={12}>12 Nodes</option>
                  <option value={20}>20 Nodes</option>
                  <option value={32}>32 Nodes</option>
                </select>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mb-4">
              Click any node in the circuit to set it as <strong>Feature A</strong> or <strong>Feature B</strong>. Nodes with gold rings are validated causal features. Red links indicate redundant representations; cyan links indicate synergistic pairings.
            </p>

            {/* SVG Visualizer */}
            <div className="relative bg-slate-950/80 rounded-xl border border-slate-800/80 p-2 flex items-center justify-center overflow-hidden">
              {loadingGraph ? (
                <div className="h-[440px] flex items-center justify-center text-xs text-slate-500 gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-purple-400" />
                  Generating circuit topology...
                </div>
              ) : filteredNodes.length === 0 ? (
                <div className="h-[440px] flex items-center justify-center text-xs text-slate-500">
                  No features found matching criteria.
                </div>
              ) : (
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-[440px] select-none">
                  {/* Background grid markings */}
                  <circle cx={centerX} cy={centerY} r={radius} fill="none" stroke="#1e293b" strokeDasharray="4 4" strokeWidth="1" />
                  <circle cx={centerX} cy={centerY} r={radius * 0.5} fill="none" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="0.8" />

                  {/* Links / Edges */}
                  {graphData?.links?.map((link, idx) => {
                    const src = nodeCoords[link.source];
                    const dst = nodeCoords[link.target];
                    if (!src || !dst) return null;
                    const isRedundant = link.type === 'redundant';
                    const strokeColor = isRedundant ? '#f43f5e' : '#06b6d4';
                    return (
                      <line
                        key={`edge-${idx}`}
                        x1={src.x}
                        y1={src.y}
                        x2={dst.x}
                        y2={dst.y}
                        stroke={strokeColor}
                        strokeWidth={Math.min(3.5, Math.max(1, (link.value || 0.1) * 6))}
                        strokeOpacity={0.65}
                      />
                    );
                  })}

                  {/* Active pair connection line */}
                  {nodeCoords[featureA] && nodeCoords[featureB] && (
                    <line
                      x1={nodeCoords[featureA].x}
                      y1={nodeCoords[featureA].y}
                      x2={nodeCoords[featureB].x}
                      y2={nodeCoords[featureB].y}
                      stroke="#a855f7"
                      strokeWidth={3}
                      strokeDasharray="6 4"
                      className="animate-pulse"
                    />
                  )}

                  {/* Nodes */}
                  {filteredNodes.map((n) => {
                    const pos = nodeCoords[n.id];
                    if (!pos) return null;
                    const isA = n.id === featureA;
                    const isB = n.id === featureB;
                    const isCausal = n.causal_rank !== null && n.causal_rank !== undefined;
                    const isSelected = selectedNode?.id === n.id;

                    let fill = '#334155';
                    if (isA) fill = '#8b5cf6';
                    else if (isB) fill = '#06b6d4';
                    else if (isCausal) fill = '#d97706';

                    return (
                      <g
                        key={`node-${n.id}`}
                        className="cursor-pointer transition-transform"
                        onClick={() => {
                          setSelectedNode(n);
                          if (featureA !== n.id && featureB !== n.id) {
                            setFeatureB(n.id);
                          }
                        }}
                      >
                        {/* Glow for active nodes */}
                        {(isA || isB) && (
                          <circle cx={pos.x} cy={pos.y} r={22} fill={isA ? '#8b5cf6' : '#06b6d4'} opacity={0.25} className="animate-ping" />
                        )}

                        {/* Node body */}
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={isA || isB ? 16 : isCausal ? 14 : 11}
                          fill={fill}
                          stroke={isSelected ? '#ffffff' : isCausal ? '#fbbf24' : '#64748b'}
                          strokeWidth={isSelected ? 3 : isCausal ? 2.5 : 1.5}
                        />

                        {/* Text badge */}
                        <text
                          x={pos.x}
                          y={pos.y + 4}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize={isA || isB ? "10px" : "9px"}
                          fontWeight="bold"
                          className="pointer-events-none font-mono"
                        >
                          {n.id}
                        </text>

                        {/* Label tag */}
                        <text
                          x={pos.x}
                          y={pos.y + (pos.y > centerY ? 24 : -18)}
                          textAnchor="middle"
                          fill={isA ? '#c084fc' : isB ? '#67e8f9' : '#94a3b8'}
                          fontSize="9px"
                          className="pointer-events-none"
                        >
                          {n.label.length > 14 ? n.label.substring(0, 12) + '...' : n.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
          </div>

          {/* Node detail inspection pill */}
          <div className="mt-4 p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            {selectedNode ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white">Feature #{selectedNode.id}</span>
                  <span className="text-slate-400">({selectedNode.class || 'unlabeled'})</span>
                  {selectedNode.causal_rank && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                      Causal Rank #{selectedNode.causal_rank}
                    </span>
                  )}
                  <span className="text-slate-500">Purity: {(selectedNode.purity * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFeatureA(selectedNode.id)}
                    className="px-2 py-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 rounded text-[11px] font-medium transition"
                  >
                    Set as Feature A
                  </button>
                  <button
                    onClick={() => setFeatureB(selectedNode.id)}
                    className="px-2 py-1 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 rounded text-[11px] font-medium transition"
                  >
                    Set as Feature B
                  </button>
                </div>
              </>
            ) : (
              <span className="text-slate-500 text-[11px] flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Select any node above to inspect purity, causal rank, or assign it directly to the pairwise tester.
              </span>
            )}
          </div>
        </div>

        {/* Right Column: Pairwise Interaction Analyzer */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-400" />
              Pairwise Causal Interaction Test
            </h3>
            <p className="text-xs text-slate-400">
              Measures whether co-ablating both features yields super-additive damage ($I &gt; 0$, synergistic) or sub-additive overlap ($I &lt; 0$, redundant).
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-purple-950/20 border border-purple-500/30 rounded-xl">
                <label className="text-[11px] text-purple-300 font-medium mb-1 block">Feature A ID</label>
                <input
                  type="number"
                  min="0"
                  value={featureA}
                  onChange={e => setFeatureA(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-900 border border-purple-500/40 rounded-lg px-3 py-1.5 text-sm text-purple-200 font-mono font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>
              <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl">
                <label className="text-[11px] text-cyan-300 font-medium mb-1 block">Feature B ID</label>
                <input
                  type="number"
                  min="0"
                  value={featureB}
                  onChange={e => setFeatureB(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-900 border border-cyan-500/40 rounded-lg px-3 py-1.5 text-sm text-cyan-200 font-mono font-bold focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={() => handleCompute()}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Computing Joint Causal Ablation...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  Analyze Joint Interaction ($A + B$)
                </>
              )}
            </button>
          </div>

          {/* Results Box */}
          {result && (
            <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-white">
                  Interaction: #{result.feature_a} &amp; #{result.feature_b}
                </h3>
                {result.interaction?.category && (
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full uppercase border ${
                      result.interaction.category === 'synergistic'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                        : result.interaction.category === 'redundant'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                    }`}
                  >
                    {result.interaction.category}
                  </span>
                )}
              </div>

              {!result.can_compute ? (
                <p className="text-xs text-amber-300 bg-amber-500/10 p-4 rounded-xl border border-amber-500/20">
                  {result.message}
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-500">Co-active Images</span>
                      <p className="text-base font-mono font-bold text-white mt-0.5">{result.num_coactive}</p>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-500">Interaction Metric $I$</span>
                      <p
                        className={`text-base font-mono font-bold mt-0.5 ${
                          (result.interaction?.interaction_score || 0) > 0 ? 'text-cyan-400' : 'text-rose-400'
                        }`}
                      >
                        {result.interaction?.interaction_score ? result.interaction.interaction_score.toFixed(4) : '0.0000'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400">$\Delta z_A$</span>
                      <p className="text-xs font-mono font-bold text-rose-300 mt-1">
                        {result.mean_effect_a?.toFixed(4)}
                      </p>
                    </div>
                    <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400">$\Delta z_B$</span>
                      <p className="text-xs font-mono font-bold text-rose-300 mt-1">
                        {result.mean_effect_b?.toFixed(4)}
                      </p>
                    </div>
                    <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400">$\Delta z_{AB}$</span>
                      <p className="text-xs font-mono font-bold text-purple-300 mt-1">
                        {result.mean_effect_joint?.toFixed(4)}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                    <strong>Interpretation:</strong>{' '}
                    {result.interaction?.category === 'synergistic' ? (
                      <span>
                        Simultaneous ablation of both concepts induces a larger drop than the sum of separate ablations. The features form a functional circuit or composite detector.
                      </span>
                    ) : result.interaction?.category === 'redundant' ? (
                      <span>
                        Joint ablation drop is smaller than the independent sum. The model exhibits compensation, and either feature alone suffices to preserve the class logit.
                      </span>
                    ) : (
                      <span>Features operate approximately additively and independently.</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
