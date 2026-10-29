import React from 'react';
import { Layers, Activity, Sliders, Database, ShieldCheck, GitCompare, Terminal, Download, Cpu, Play } from 'lucide-react';

export default function Navbar({
  experiments,
  selectedExp,
  setSelectedExp,
  selectedRun,
  setSelectedRun,
  activeTab,
  setActiveTab,
  systemInfo,
}) {
  const currentExpObj = experiments.find(e => e.name === selectedExp);
  const runs = currentExpObj ? currentExpObj.runs : [];

  const navItems = [
    { id: 'overview', label: '1. Overview', icon: Activity },
    { id: 'studio', label: '2. Causal Studio', icon: Sliders },
    { id: 'features', label: '3. Discovered Concepts', icon: Database },
    { id: 'stats', label: '4. Statistical Controls', icon: ShieldCheck },
    { id: 'interactions', label: '5. Interactions', icon: Layers },
    { id: 'comparisons', label: '6. Benchmarks', icon: GitCompare },
    { id: 'pipeline', label: '7. Run Pipeline', icon: Terminal },
    { id: 'export', label: '8. Export & Viva', icon: Download },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50">
      {/* Top Bar: Brand, Hardware Pill, and Model Selectors */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-400 p-0.5 shadow-lg shadow-brand-500/20 flex items-center justify-center">
              <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Layers className="h-5 w-5 text-brand-400 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">SAE-ViT</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">
                  Causal Discovery 2.0
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Mechanistic Concept Interpretability & Feature Steering</p>
            </div>
          </div>

          {/* Experiment & Run Selectors */}
          <div className="flex items-center gap-3">
            {/* System / Hardware Badge */}
            {systemInfo && (
              <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-slate-300">
                <Cpu className="h-3.5 w-3.5 text-cyan-400" />
                <span>{systemInfo.device_name || 'CPU'}</span>
              </div>
            )}

            {/* Experiment dropdown */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-400 hidden sm:inline">Exp:</label>
              <select
                value={selectedExp}
                onChange={e => setSelectedExp(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-brand-500 focus:outline-none transition"
              >
                {experiments.map(e => (
                  <option key={e.name} value={e.name}>
                    {e.name} ({e.runs_count} runs)
                  </option>
                ))}
              </select>
            </div>

            {/* Run dropdown */}
            {runs.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-400 hidden sm:inline">Run:</label>
                <select
                  value={selectedRun}
                  onChange={e => setSelectedRun(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-brand-500 focus:outline-none transition max-w-[200px] truncate"
                >
                  {runs.map(r => (
                    <option key={r.run_id} value={r.run_id}>
                      L{r.layer} - {r.sae_type} ({r.width}w{r.k ? ` k${r.k}` : ''})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-800/60 overflow-x-auto">
        <nav className="flex space-x-1 sm:space-x-2 py-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
