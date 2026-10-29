import React, { useState } from 'react';
import { Eye, Layers, Square, Grid, Image as ImageIcon } from 'lucide-react';

export default function HeatmapViewer({ heatmaps, title = 'Patch Spatial Activations' }) {
  const modes = [
    { id: 'overlay', label: 'Overlay', icon: Layers, desc: 'Heatmap overlaid on original image' },
    { id: 'normalized', label: 'Normalized', icon: Eye, desc: 'Min-max normalized patch map' },
    { id: 'raw', label: 'Raw', icon: Grid, desc: '14x14 raw patch activation matrix' },
    { id: 'mask', label: 'Mask', icon: Square, desc: 'Thresholded active patch mask' },
    { id: 'bbox', label: 'Bounding Box', icon: ImageIcon, desc: 'Strongest connected activation bounding box' },
  ];

  const availableModes = modes.filter(m => heatmaps && heatmaps[m.id]);
  const [activeMode, setActiveMode] = useState(availableModes.length ? availableModes[0].id : 'overlay');

  if (!heatmaps || Object.keys(heatmaps).length === 0) {
    return (
      <div className="glass-panel rounded-xl p-6 text-center text-slate-500 text-sm">
        No heatmaps generated for this feature.
      </div>
    );
  }

  const currentSrc = heatmaps[activeMode] || Object.values(heatmaps)[0];
  const currentModeObj = modes.find(m => m.id === activeMode);

  return (
    <div className="glass-panel rounded-xl p-4 sm:p-5 flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h4>
        <span className="text-[11px] text-slate-400">{currentModeObj?.desc}</span>
      </div>

      {/* Main Image Display */}
      <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-slate-900 w-full max-w-[280px] aspect-square flex items-center justify-center shadow-inner">
        <img
          src={currentSrc.startsWith('data:') ? currentSrc : currentSrc}
          alt={`Heatmap ${activeMode}`}
          className="w-full h-full object-cover transition-all duration-300"
        />
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] font-mono text-cyan-300 border border-white/10 uppercase">
          {activeMode}
        </div>
      </div>

      {/* Mode Selector Buttons */}
      <div className="flex flex-wrap gap-1.5 mt-3 justify-center w-full">
        {modes.map(m => {
          const hasImg = !!heatmaps[m.id];
          const isSelected = activeMode === m.id;
          return (
            <button
              key={m.id}
              disabled={!hasImg}
              onClick={() => setActiveMode(m.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/20'
                  : hasImg
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  : 'bg-slate-900 text-slate-600 cursor-not-allowed opacity-40'
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
