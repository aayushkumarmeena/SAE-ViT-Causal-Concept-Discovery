import React, { useState, useEffect } from 'react';
import { runIntervention, analyzeImage, getCausalImages, multiSteer, inspectPatch } from '../api';
import HeatmapViewer from '../components/HeatmapViewer';
import {
  Sliders,
  Upload,
  Image as ImageIcon,
  Play,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Plus,
  Trash2,
  Crosshair,
  Grid,
  Zap,
  Layers,
  Info,
  CheckCircle,
  Eye,
  Compass,
  FileText,
  Lightbulb,
  Activity,
} from 'lucide-react';

export default function StudioView({ expName, runId, defaultFeature = 0 }) {
  // Mode selection: Single vs Composite Multi-Vector Steering
  const [steeringMode, setSteeringMode] = useState('single'); // 'single' | 'composite'

  // Image source: Causal evaluation split vs Custom Upload
  const [imageSource, setImageSource] = useState('upload'); // 'causal' | 'upload'

  // Single Feature Steering Controls
  const [featureId, setFeatureId] = useState(defaultFeature);
  const [mode, setMode] = useState('scale'); // 'scale' | 'steer'
  const [interventionKind, setInterventionKind] = useState('ablation');
  const [alpha, setAlpha] = useState(0.0);

  // Composite multi-vector steering state
  const [multiVectors, setMultiVectors] = useState([
    { feature_id: defaultFeature, alpha: 2.0 },
    { feature_id: (defaultFeature + 1) % 256, alpha: -1.0 },
  ]);

  const [scope, setScope] = useState('global');
  const [localPct, setLocalPct] = useState(90);

  // Causal held-out images
  const [causalImages, setCausalImages] = useState([]);
  const [selectedPosition, setSelectedPosition] = useState(null);

  // Uploaded image & analysis
  const [uploadedBase64, setUploadedBase64] = useState(null);
  const [uploadedAnalysis, setUploadedAnalysis] = useState(null);
  const [selectedHeatmapFid, setSelectedHeatmapFid] = useState(null);

  // Active view tab in right column: 'analysis' | 'intervention'
  const [activeTab, setActiveTab] = useState('analysis');

  // Intervention execution state
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Patch Inspector State
  const [selectedPatch, setSelectedPatch] = useState(null);
  const [patchData, setPatchData] = useState(null);
  const [inspectingPatch, setInspectingPatch] = useState(false);

  // Load causal images when feature changes
  useEffect(() => {
    if (imageSource === 'causal') {
      getCausalImages(expName, runId, featureId)
        .then(data => {
          setCausalImages(data.thumbnails || []);
          if (data.thumbnails && data.thumbnails.length > 0) {
            setSelectedPosition(data.thumbnails[0].position);
          } else {
            setSelectedPosition(null);
          }
        })
        .catch(err => console.error(err));
    }
  }, [expName, runId, featureId, imageSource]);

  const handleKindChange = (kind) => {
    setInterventionKind(kind);
    if (kind === 'ablation') {
      setMode('scale');
      setAlpha(0.0);
    } else if (kind === 'suppression') {
      setMode('scale');
      setAlpha(0.5);
    } else if (kind === 'amplification') {
      setMode('scale');
      setAlpha(2.0);
    } else if (kind === 'steering') {
      setMode('steer');
      setAlpha(2.0);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setExecuting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (uploadEvt) => {
        const b64 = uploadEvt.target?.result;
        setUploadedBase64(b64);
        try {
          const analysis = await analyzeImage(expName, runId, file);
          setUploadedAnalysis(analysis);
          setActiveTab('analysis');
          if (analysis.active_features && analysis.active_features.length > 0) {
            const topFid = analysis.active_features[0].feature_id;
            setFeatureId(topFid);
            setSelectedHeatmapFid(topFid);
          }
        } catch (err) {
          setError(`Image analysis failed: ${err.response?.data?.detail || err.message}`);
        } finally {
          setExecuting(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError(`Failed to read file: ${err.message}`);
      setExecuting(false);
    }
  };

  // Run Intervention (Single or Composite)
  const executeIntervention = async () => {
    if (imageSource === 'causal' && selectedPosition === null) {
      setError('Please select a held-out image.');
      return;
    }
    if (imageSource === 'upload' && !uploadedBase64) {
      setError('Please upload an image first.');
      return;
    }

    setExecuting(true);
    setError(null);

    try {
      let res;
      if (steeringMode === 'composite') {
        res = await multiSteer(expName, runId, {
          vectors: multiVectors,
          scope,
          local_percentile: scope === 'local' ? parseInt(localPct) : null,
          image_pos: imageSource === 'causal' ? selectedPosition : null,
          image_base64: imageSource === 'upload' ? uploadedBase64 : null,
        });
      } else {
        res = await runIntervention(expName, runId, {
          feature_ids: [parseInt(featureId)],
          alphas: [parseFloat(alpha)],
          mode: mode,
          scope: scope,
          local_percentile: scope === 'local' ? parseInt(localPct) : null,
          image_pos: imageSource === 'causal' ? selectedPosition : null,
          image_base64: imageSource === 'upload' ? uploadedBase64 : null,
        });
      }
      setResult(res);
      setActiveTab('intervention');
    } catch (err) {
      setError(`Intervention failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  // 1-Click Quick Intervention Trigger from concept cards
  const executeQuickIntervention = async (fid, targetAlpha, targetMode = 'scale', targetKind = 'ablation') => {
    setFeatureId(fid);
    setAlpha(targetAlpha);
    setMode(targetMode);
    setInterventionKind(targetKind);
    setSteeringMode('single');
    setExecuting(true);
    setError(null);

    try {
      const res = await runIntervention(expName, runId, {
        feature_ids: [parseInt(fid)],
        alphas: [parseFloat(targetAlpha)],
        mode: targetMode,
        scope: scope,
        local_percentile: scope === 'local' ? parseInt(localPct) : null,
        image_pos: imageSource === 'causal' ? selectedPosition : null,
        image_base64: imageSource === 'upload' ? uploadedBase64 : null,
      });
      setResult(res);
      setActiveTab('intervention');
    } catch (err) {
      setError(`Quick intervention failed: ${err.response?.data?.detail || err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  // Patch Inspection Click Handler
  const handlePatchClick = async (pIdx) => {
    setSelectedPatch(pIdx);
    setInspectingPatch(true);
    try {
      const data = await inspectPatch(expName, runId, {
        patch_index: pIdx,
        image_pos: imageSource === 'causal' ? selectedPosition : null,
        image_base64: imageSource === 'upload' ? uploadedBase64 : null,
      });
      setPatchData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setInspectingPatch(false);
    }
  };

  // Multi-vector helpers
  const addVectorComponent = () => {
    setMultiVectors(prev => [...prev, { feature_id: (prev[prev.length - 1]?.feature_id || 0) + 1, alpha: 1.0 }]);
  };

  const removeVectorComponent = (index) => {
    setMultiVectors(prev => prev.filter((_, i) => i !== index));
  };

  const updateVector = (index, field, value) => {
    setMultiVectors(prev => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  // Current selected concept heatmap
  const currentHeatmapData = uploadedAnalysis?.feature_heatmaps?.[String(selectedHeatmapFid)] ||
    uploadedAnalysis?.feature_heatmaps?.[String(uploadedAnalysis?.active_features?.[0]?.feature_id)] ||
    null;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Compass className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Causal Concept Steering Studio</h2>
              <p className="text-xs text-slate-400">
                Upload custom imagery, inspect active sparse autoencoder concepts, verify localization, and execute causal interventions.
              </p>
            </div>
          </div>

          {/* Mode Switcher: Single vs Vector Composition */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setSteeringMode('single')}
              className={`py-1.5 px-3 rounded-lg text-xs font-medium transition ${
                steeringMode === 'single'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Single Feature
            </button>
            <button
              onClick={() => setSteeringMode('composite')}
              className={`py-1.5 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                steeringMode === 'composite'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              Vector Arithmetic
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

      {/* Main Grid: Control Panel (5 cols) + Visualization & Analysis Hub (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Image Selection & Steering Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Image Source Selector */}
          <div className="glass-panel rounded-2xl p-5 space-y-4 border border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-brand-400" />
              1. Image Input Source
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setImageSource('upload')}
                className={`py-2 px-3 rounded-lg text-xs font-medium border transition ${
                  imageSource === 'upload'
                    ? 'bg-cyan-600/30 border-cyan-500 text-white font-semibold'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                Upload Custom Image
              </button>
              <button
                onClick={() => setImageSource('causal')}
                className={`py-2 px-3 rounded-lg text-xs font-medium border transition ${
                  imageSource === 'causal'
                    ? 'bg-cyan-600/30 border-cyan-500 text-white font-semibold'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                Held-Out Dataset
              </button>
            </div>

            {imageSource === 'upload' ? (
              <div className="space-y-3">
                {uploadedBase64 ? (
                  <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={uploadedBase64}
                        alt="Uploaded preview"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-700 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Image Analyzed</span>
                        </div>
                        {uploadedAnalysis?.summary_narrative && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            Predicted: <strong className="text-cyan-300">{uploadedAnalysis.summary_narrative.predicted_class}</strong> ({uploadedAnalysis.summary_narrative.confidence_pct}%)
                          </p>
                        )}
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {uploadedAnalysis?.active_features?.length || 0} active concepts discovered
                        </p>
                      </div>
                    </div>

                    <label className="block w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-center text-xs font-medium cursor-pointer transition">
                      Upload Different Image
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-cyan-400 rounded-xl p-5 cursor-pointer bg-slate-900/40 hover:bg-slate-900 transition text-center group">
                    <Upload className="h-7 w-7 text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-white">Click or drag an image here</span>
                    <span className="text-[11px] text-slate-400 mt-1">Supports PNG, JPG, or WEBP (automatically scaled to 224×224)</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs text-slate-400">
                  Select Image (active for #{featureId}):
                </label>
                {causalImages.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-900/60 rounded-lg border border-slate-800">
                    {causalImages.map(img => (
                      <div
                        key={img.position}
                        onClick={() => setSelectedPosition(img.position)}
                        className={`relative aspect-square rounded-md overflow-hidden cursor-pointer border-2 transition ${
                          selectedPosition === img.position
                            ? 'border-brand-500 scale-95 shadow-md shadow-brand-500/20'
                            : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={`data:image/png;base64,${img.thumbnail}`}
                          alt={`Pos ${img.position}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] font-mono text-center text-slate-300 py-0.5">
                          #{img.position}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-400 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                    Feature #{featureId} is not active on initial validation images. Enter another feature ID below.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 2. Steering & Vector Controls */}
          <div className="glass-panel rounded-2xl p-5 space-y-4 border border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-cyan-400" />
                {steeringMode === 'composite' ? '2. Vector Arithmetic Setup' : '2. Intervention Configuration'}
              </span>
              {steeringMode === 'composite' && (
                <span className="text-[10px] font-mono text-cyan-400">Δ = Σ α_i · W_dec[i]</span>
              )}
            </h3>

            {steeringMode === 'single' ? (
              /* Single Mode Controls */
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-300 font-medium">Target SAE Feature ID</label>
                    <span className="text-[11px] font-mono text-cyan-400 font-bold">ID #{featureId}</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={featureId}
                    onChange={e => setFeatureId(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Preset Modes */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'ablation', label: 'Ablation (x0)', desc: 'Knock out feature' },
                    { id: 'suppression', label: 'Suppression (x0.5)', desc: 'Dampen activation' },
                    { id: 'amplification', label: 'Amplify (x2.0)', desc: 'Boost concept' },
                    { id: 'steering', label: 'Steer (+2.0)', desc: 'Inject direction' },
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleKindChange(item.id)}
                      className={`p-2 rounded-lg text-left border transition ${
                        interventionKind === item.id
                          ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="text-xs font-semibold">{item.label}</div>
                      <div className="text-[10px] text-slate-400">{item.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Slider */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-slate-300 font-medium">
                      {mode === 'steer' ? 'Steering Strength (α)' : 'Scaling Factor (α)'}
                    </label>
                    <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                      {alpha.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={mode === 'steer' ? '-5.0' : '0.0'}
                    max="5.0"
                    step="0.25"
                    value={alpha}
                    onChange={e => setAlpha(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>
              </div>
            ) : (
              /* Composite Multi-Vector Controls */
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400">
                  Compose concept vectors simultaneously. Add positive strength to inject a concept or negative strength to remove it:
                </p>

                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {multiVectors.map((vec, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex items-center gap-3"
                    >
                      <div className="w-24">
                        <label className="text-[10px] text-slate-500 block mb-0.5 font-mono">Feature ID</label>
                        <input
                          type="number"
                          min="0"
                          value={vec.feature_id}
                          onChange={e => updateVector(idx, 'feature_id', Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono"
                        />
                      </div>

                      <div className="flex-1">
                        <div className="flex justify-between text-[10px] font-mono mb-0.5">
                          <span className="text-slate-400">Strength (α)</span>
                          <span className={vec.alpha >= 0 ? 'text-cyan-400 font-bold' : 'text-rose-400 font-bold'}>
                            {vec.alpha >= 0 ? '+' : ''}{vec.alpha.toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-5.0"
                          max="5.0"
                          step="0.25"
                          value={vec.alpha}
                          onChange={e => updateVector(idx, 'alpha', parseFloat(e.target.value))}
                          className="w-full accent-cyan-500 cursor-pointer h-1.5"
                        />
                      </div>

                      <button
                        onClick={() => removeVectorComponent(idx)}
                        disabled={multiVectors.length <= 1}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded transition disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addVectorComponent}
                  className="w-full py-1.5 px-3 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <Plus className="h-3.5 w-3.5 text-purple-400" />
                  Add Vector Direction
                </button>
              </div>
            )}

            {/* Scope Settings */}
            <div className="border-t border-slate-800 pt-3 space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Intervention Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setScope('global')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition ${
                      scope === 'global'
                        ? 'bg-slate-800 border-cyan-400 text-white font-semibold'
                        : 'bg-slate-900/50 border-slate-800 text-slate-400'
                    }`}
                  >
                    Global (All 196 Patches)
                  </button>
                  <button
                    onClick={() => setScope('local')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition ${
                      scope === 'local'
                        ? 'bg-slate-800 border-cyan-400 text-white font-semibold'
                        : 'bg-slate-900/50 border-slate-800 text-slate-400'
                    }`}
                  >
                    Local (Top q% Patches)
                  </button>
                </div>
              </div>

              {scope === 'local' && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[11px] text-slate-400">Percentile Threshold (q%)</label>
                    <span className="text-[11px] font-mono text-cyan-400">Top {100 - localPct}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="99"
                    value={localPct}
                    onChange={e => setLocalPct(parseInt(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer h-1.5"
                  />
                </div>
              )}
            </div>

            {/* Trigger Button */}
            <button
              onClick={executeIntervention}
              disabled={executing}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-purple-600 to-brand-600 hover:brightness-110 text-white font-medium text-xs shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {executing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Running Neural Forward Pass...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  {steeringMode === 'composite' ? 'Execute Multi-Vector Steering' : 'Execute Causal Intervention'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Dynamic Analysis Hub / Intervention Outcomes (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* View Tab Selector if result exists */}
          {result && uploadedAnalysis && (
            <div className="flex items-center gap-2 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setActiveTab('analysis')}
                className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                  activeTab === 'analysis'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Compass className="h-3.5 w-3.5" />
                Image Concept Decomposition
              </button>
              <button
                onClick={() => setActiveTab('intervention')}
                className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition flex items-center justify-center gap-2 ${
                  activeTab === 'intervention'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                Causal Intervention Outcome
              </button>
            </div>
          )}

          {/* TAB 1: Image Concept Decomposition Hub (Displayed when uploaded, or on tab select) */}
          {(activeTab === 'analysis' || !result) && uploadedAnalysis ? (
            <div className="space-y-6">
              {/* 1. What We Are Doing: 5-Step Mechanistic Pipeline Walkthrough */}
              <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">What We Are Doing (The Mechanistic Pipeline)</h3>
                    <p className="text-[11px] text-slate-400">
                      Step-by-step walkthrough of how your image is embedded, decomposed into concepts, and prepared for causal testing.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-1">
                  {uploadedAnalysis.pipeline_steps?.map((step) => (
                    <div
                      key={step.step}
                      className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-2 hover:border-cyan-500/40 transition"
                    >
                      <div>
                        <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-mono font-bold mb-1.5 border border-cyan-500/30">
                          {step.step}
                        </div>
                        <h5 className="text-[11px] font-semibold text-white leading-snug">{step.title}</h5>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{step.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. What The Results Are About: Predictions & SAE Fidelity */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* ViT Top Prediction & Probabilities (6 cols) */}
                <div className="md:col-span-6 glass-panel rounded-2xl p-5 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-cyan-400" />
                      ViT Baseline Prediction
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                      Layer {uploadedAnalysis.reconstruction_stats?.layer || 2}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide block">Primary Decision</span>
                    <div className="flex items-baseline justify-between mt-0.5">
                      <h3 className="text-lg font-bold text-white truncate">
                        {uploadedAnalysis.top_predictions?.[0]?.class || 'Unknown'}
                      </h3>
                      <span className="text-base font-mono font-bold text-emerald-400">
                        {((uploadedAnalysis.top_predictions?.[0]?.prob || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      Raw Logit: {uploadedAnalysis.top_predictions?.[0]?.logit?.toFixed(2)}
                    </span>
                  </div>

                  {/* Top-5 probability bars */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 block font-medium">Top Competitor Classes:</span>
                    {uploadedAnalysis.top_predictions?.slice(1, 5).map((tp, idx) => (
                      <div key={idx} className="space-y-0.5 text-xs">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-300 truncate max-w-[150px]">{tp.class}</span>
                          <span className="font-mono text-slate-400">{(tp.prob * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-slate-600 rounded-full"
                            style={{ width: `${Math.min(100, tp.prob * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SAE Reconstruction Metrics (6 cols) */}
                <div className="md:col-span-6 glass-panel rounded-2xl p-5 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-purple-400" />
                      SAE Representation Fidelity
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      {uploadedAnalysis.reconstruction_stats?.dictionary_size} Features
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Measures how faithfully the Sparse Autoencoder captured this image's token representations:
                  </p>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400">Cosine Similarity</span>
                      <p className="text-base font-mono font-bold text-cyan-300 mt-0.5">
                        {((uploadedAnalysis.reconstruction_stats?.cosine_similarity || 0) * 100).toFixed(1)}%
                      </p>
                      <span className="text-[9px] text-slate-500">Directional fidelity</span>
                    </div>

                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400">Explained Variance</span>
                      <p className="text-base font-mono font-bold text-purple-300 mt-0.5">
                        {((uploadedAnalysis.reconstruction_stats?.explained_variance || 0) * 100).toFixed(1)}%
                      </p>
                      <span className="text-[9px] text-slate-500">Variance retained</span>
                    </div>

                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400">Mean Sparsity (L₀)</span>
                      <p className="text-base font-mono font-bold text-emerald-300 mt-0.5">
                        {(uploadedAnalysis.reconstruction_stats?.l0_per_patch || 0).toFixed(1)}
                      </p>
                      <span className="text-[9px] text-slate-500">Active features / patch</span>
                    </div>

                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400">Active Features</span>
                      <p className="text-base font-mono font-bold text-amber-300 mt-0.5">
                        {uploadedAnalysis.reconstruction_stats?.total_active_features || 0}
                      </p>
                      <span className="text-[9px] text-slate-500">Distinct concepts</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Discovered Active Concepts & Spatial Localization Visualizer */}
              <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Crosshair className="h-5 w-5 text-cyan-400" />
                    <div>
                      <h4 className="text-sm font-semibold text-white">Discovered Concepts & Spatial Focus</h4>
                      <p className="text-[11px] text-slate-400">
                        Select any concept to view its activation heatmap and test its causal contribution.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Concept Selector Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {uploadedAnalysis.active_features?.slice(0, 5).map((feat) => {
                    const isSelected = selectedHeatmapFid === feat.feature_id;
                    return (
                      <button
                        key={feat.feature_id}
                        onClick={() => setSelectedHeatmapFid(feat.feature_id)}
                        className={`py-1.5 px-3 rounded-xl text-xs font-mono font-medium transition flex items-center gap-2 shrink-0 border ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-sm'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className="font-bold">#{feat.feature_id}</span>
                        <span className="font-sans text-[11px] text-slate-300">{feat.concept || feat.top_class}</span>
                        {feat.is_causal && (
                          <span className="w-2 h-2 rounded-full bg-amber-400" title="Validated Causal Feature" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Concept Spatial Visualizer & Actions */}
                {currentHeatmapData ? (
                  <div className="space-y-4 pt-1">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* 1. Original Image */}
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center">
                        <span className="text-[10px] text-slate-400 mb-1.5 font-medium">1. Input Image</span>
                        <img
                          src={uploadedBase64}
                          alt="Input preview"
                          className="w-full aspect-square object-cover rounded-lg"
                        />
                      </div>

                      {/* 2. Raw SAE Feature Map */}
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center">
                        <span className="text-[10px] text-slate-400 mb-1.5 font-medium">
                          2. SAE Activation Map (14×14)
                        </span>
                        <img
                          src={`data:image/png;base64,${currentHeatmapData.raw}`}
                          alt="Raw heatmap"
                          className="w-full aspect-square object-cover rounded-lg"
                        />
                      </div>

                      {/* 3. Jet Overlay */}
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center">
                        <span className="text-[10px] text-slate-400 mb-1.5 font-medium">
                          3. Spatial Localization Overlay
                        </span>
                        <img
                          src={`data:image/png;base64,${currentHeatmapData.overlay}`}
                          alt="Overlay heatmap"
                          className="w-full aspect-square object-cover rounded-lg"
                        />
                      </div>
                    </div>

                    {/* Concept Card & 1-Click Causal Interventions */}
                    {(() => {
                      const curFeat = uploadedAnalysis.active_features?.find(
                        f => f.feature_id === (selectedHeatmapFid || uploadedAnalysis.active_features[0]?.feature_id)
                      );
                      if (!curFeat) return null;

                      return (
                        <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-white text-sm">
                                Feature #{curFeat.feature_id}: {curFeat.concept || curFeat.top_class}
                              </span>
                              {curFeat.is_causal ? (
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                                  Validated Causal Feature
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                                  Correlational Candidate
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 text-[10px]">
                                {curFeat.localization_type}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">
                              Peak activation: <strong className="text-white font-mono">{curFeat.max_activation.toFixed(2)}</strong> across{' '}
                              <strong className="text-white font-mono">{curFeat.n_active_patches}</strong> of 196 patches (SCS: {((curFeat.spatial_conc10 || 0) * 100).toFixed(0)}%).
                            </p>
                          </div>

                          {/* Quick Intervention Triggers */}
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => executeQuickIntervention(curFeat.feature_id, 0.0, 'scale', 'ablation')}
                              disabled={executing}
                              className="py-1.5 px-3 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40 text-xs font-medium transition flex items-center gap-1.5"
                            >
                              <Zap className="h-3.5 w-3.5 text-rose-300" />
                              1-Click Ablate (x0.0)
                            </button>
                            <button
                              onClick={() => executeQuickIntervention(curFeat.feature_id, 2.0, 'scale', 'amplification')}
                              disabled={executing}
                              className="py-1.5 px-3 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 text-xs font-medium transition flex items-center gap-1.5"
                            >
                              <Zap className="h-3.5 w-3.5 text-cyan-300" />
                              1-Click Boost (x2.0)
                            </button>
                            <button
                              onClick={() => setFeatureId(curFeat.feature_id)}
                              className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                            >
                              Set as Target ID
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </div>

              {/* 4. Actionable Insights & Causal Recommendations */}
              {uploadedAnalysis.summary_narrative && (
                <div className="p-4 bg-gradient-to-r from-cyan-950/30 via-slate-900 to-purple-950/30 rounded-2xl border border-cyan-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold uppercase tracking-wider">
                    <Compass className="h-4 w-4" />
                    Mechanistic Interpretability Takeaway
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    The Vision Transformer recognizes this image as <strong>{uploadedAnalysis.summary_narrative.predicted_class}</strong> ({uploadedAnalysis.summary_narrative.confidence_pct}% confidence). The Sparse Autoencoder demonstrates that <strong>Feature #{uploadedAnalysis.summary_narrative.dominant_feature_id}</strong> ('{uploadedAnalysis.summary_narrative.dominant_concept}') is the strongest driving semantic basis vector.
                  </p>
                  <p className="text-[11px] text-cyan-400 font-medium">
                    💡 {uploadedAnalysis.summary_narrative.recommendation}
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {/* TAB 2: Causal Intervention Outcomes (Displayed after intervention executed) */}
          {(activeTab === 'intervention' || !uploadedAnalysis) && result ? (
            <div className="space-y-5">
              {/* Prediction Flip Alert */}
              {result.is_prediction_flipped ? (
                <div className="glass-panel rounded-xl p-4 border-2 border-emerald-500/60 bg-emerald-500/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
                        Prediction Flipped!
                      </span>
                      <p className="text-sm font-semibold text-white">
                        {result.prediction_before} <ArrowRight className="inline h-3.5 w-3.5 mx-1" />{' '}
                        {result.prediction_after}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                    Flip Success
                  </span>
                </div>
              ) : (
                <div className="glass-panel rounded-xl p-3 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Baseline Top-1: <strong className="text-slate-200">{result.target_class}</strong>
                  </span>
                  <span className="text-slate-500 font-mono">Prediction maintained</span>
                </div>
              )}

              {/* Metrics Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="glass-panel rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400">Target Logit Shift</span>
                  <div className="text-lg font-mono font-bold text-white mt-1">
                    {result.target_logit_after.toFixed(2)}
                  </div>
                  <div
                    className={`text-[11px] font-mono mt-0.5 ${
                      result.target_delta_logit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    Δ {result.target_delta_logit >= 0 ? '+' : ''}
                    {result.target_delta_logit.toFixed(2)}
                  </div>
                </div>

                <div className="glass-panel rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400">Target Prob</span>
                  <div className="text-lg font-mono font-bold text-white mt-1">
                    {(result.target_prob_after * 100).toFixed(1)}%
                  </div>
                  <div
                    className={`text-[11px] font-mono mt-0.5 ${
                      result.target_delta_prob >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    Δ {result.target_delta_prob >= 0 ? '+' : ''}
                    {(result.target_delta_prob * 100).toFixed(1)}%
                  </div>
                </div>

                <div className="glass-panel rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400">Baseline Logit</span>
                  <div className="text-lg font-mono font-bold text-white mt-1">
                    {result.target_logit_before.toFixed(2)}
                  </div>
                  <span className="text-[10px] text-slate-500">{(result.target_prob_before * 100).toFixed(1)}% init</span>
                </div>

                <div className="glass-panel rounded-xl p-3.5">
                  <span className="text-[11px] text-slate-400">Patches Intervened</span>
                  <div className="text-lg font-mono font-bold text-cyan-400 mt-1">
                    {result.num_patches_intervened}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {scope === 'local' ? `Top ${100 - localPct}%` : 'All 196'}
                  </span>
                </div>
              </div>

              {/* Class Shift Table */}
              <div className="glass-panel rounded-xl p-5 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Top-5 Classes Shift Breakdown
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-2 font-medium">Rank</th>
                        <th className="pb-2 font-medium">Class Before</th>
                        <th className="pb-2 font-medium">Prob Before</th>
                        <th className="pb-2 font-medium">Class After</th>
                        <th className="pb-2 font-medium">Prob After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {[0, 1, 2, 3, 4].map(idx => {
                        const b = result.top5_before[idx];
                        const a = result.top5_after[idx];
                        return (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="py-2 text-slate-500">#{idx + 1}</td>
                            <td className="py-2 text-slate-200">{b ? b.class : '-'}</td>
                            <td className="py-2 text-slate-400">{b ? `${(b.prob * 100).toFixed(1)}%` : '-'}</td>
                            <td className="py-2 font-semibold text-cyan-300">{a ? a.class : '-'}</td>
                            <td className="py-2 text-cyan-400">{a ? `${(a.prob * 100).toFixed(1)}%` : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}

          {/* Fallback when neither uploaded nor executed */}
          {!uploadedAnalysis && !result && (
            <div className="glass-panel rounded-2xl p-10 text-center text-slate-400 flex flex-col items-center justify-center min-h-[260px] border border-slate-800">
              <Upload className="h-10 w-10 text-slate-600 mb-2" />
              <h4 className="text-sm font-semibold text-slate-200">Upload an Image to Begin Mechanistic Discovery</h4>
              <p className="text-xs text-slate-400 max-w-md mt-1 leading-relaxed">
                Upload any custom image on the left. The platform will automatically decompose the image into 196 ViT patches, retrieve firing SAE concepts, visualize spatial heatmaps, and walk you through what the results mean.
              </p>
            </div>
          )}

          {/* Interactive 14x14 Patch Inspector */}
          <div className="glass-panel rounded-2xl p-5 space-y-4 border border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Crosshair className="h-4 w-4 text-cyan-400" />
                Interactive 14×14 Spatial Patch Token Inspector
              </h4>
              <span className="text-[11px] text-slate-400">Click any patch to inspect firing concepts</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* 14x14 Clickable Grid */}
              <div className="relative aspect-square max-w-[260px] mx-auto w-full bg-slate-900 rounded-xl overflow-hidden border border-slate-700 p-1">
                <div className="grid grid-cols-14 grid-rows-14 gap-0.5 h-full w-full">
                  {Array.from({ length: 196 }).map((_, pIdx) => (
                    <button
                      key={pIdx}
                      onClick={() => handlePatchClick(pIdx)}
                      className={`w-full h-full rounded-[1px] transition-all ${
                        selectedPatch === pIdx
                          ? 'bg-cyan-400 scale-125 z-10 shadow-lg shadow-cyan-400/50'
                          : 'bg-slate-800 hover:bg-cyan-500/70'
                      }`}
                      title={`Patch #${pIdx} (${Math.floor(pIdx / 14)}, ${pIdx % 14})`}
                    />
                  ))}
                </div>
              </div>

              {/* Patch Details Drawer */}
              <div className="space-y-3">
                {selectedPatch !== null ? (
                  inspectingPatch ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1 text-cyan-400" />
                      Decomposing patch activations...
                    </div>
                  ) : patchData ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold font-mono text-cyan-300">
                          Patch #{selectedPatch} (Row {patchData.row}, Col {patchData.col})
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {patchData.total_active} active features
                        </span>
                      </div>

                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {patchData.active_concepts.length > 0 ? (
                          patchData.active_concepts.map(ac => (
                            <div
                              key={ac.feature_id}
                              onClick={() => {
                                setFeatureId(ac.feature_id);
                              }}
                              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/50 cursor-pointer flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-semibold text-white font-mono">#{ac.feature_id}</span>
                                <span className="text-slate-400 text-[11px] ml-2 truncate max-w-[120px] inline-block align-bottom">
                                  {ac.concept}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-cyan-400 text-xs">
                                {ac.activation.toFixed(2)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500 italic">No SAE features active at this patch threshold.</p>
                        )}
                      </div>
                    </div>
                  ) : null
                ) : (
                  <div className="text-center py-10 text-xs text-slate-500">
                    <Grid className="h-8 w-8 mx-auto mb-2 text-slate-700" />
                    Click any cell on the 14x14 grid to inspect which concepts fire at that spatial token.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
