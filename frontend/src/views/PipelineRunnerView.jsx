import React, { useState, useEffect, useRef } from 'react';
import { triggerPipeline, stopPipeline, getPipelineStatus } from '../api';
import { Terminal, Play, Square, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export default function PipelineRunnerView({ onPipelineFinished }) {
  const [mode, setMode] = useState('demo');
  const [sweep, setSweep] = useState(false);
  const [stages, setStages] = useState('extract,train,discover,evaluate,report');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [statusInfo, setStatusInfo] = useState(null);
  const [error, setError] = useState(null);

  const logsEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  // Poll status periodically
  useEffect(() => {
    const check = () => {
      getPipelineStatus().then(res => {
        setStatusInfo(res.status);
        setRunning(res.status?.status === 'running');
      });
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  const startStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    const es = new EventSource('/api/pipeline/logs/stream');
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      setLogs(prev => [...prev, event.data]);
    };

    es.addEventListener('end', () => {
      es.close();
      setRunning(false);
      if (onPipelineFinished) onPipelineFinished();
    });

    es.onerror = () => {
      es.close();
    };
  };

  const handleStart = async () => {
    setError(null);
    setLogs([]);
    try {
      const res = await triggerPipeline({ mode, sweep, stages });
      if (!res.success) {
        setError(res.message);
        return;
      }
      setRunning(true);
      startStream();
    } catch (err) {
      setError(`Failed to trigger pipeline: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleStop = async () => {
    try {
      await stopPipeline();
      setRunning(false);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    } catch (err) {
      setError(`Failed to stop pipeline: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Terminal className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Pipeline Orchestrator & Live Terminal</h2>
            <p className="text-xs text-slate-400">
              Launch ViT activation extraction, SAE dictionary training, concept discovery, and causal steering jobs directly from the browser.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="glass-panel rounded-xl p-4 border-l-4 border-rose-500 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Control Panel */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Mode Selector */}
          <div>
            <label className="text-xs text-slate-300 font-medium mb-1 block">Execution Preset Mode</label>
            <select
              value={mode}
              onChange={e => setMode(e.target.value)}
              disabled={running}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
            >
              <option value="selftest">selftest (Tiny ViT + synthetic, offline ~10s)</option>
              <option value="smoke">smoke (10 images, real ViT-B/16 ~30s)</option>
              <option value="demo">demo (CIFAR-100, 500 images, Top-K SAE ~3m)</option>
              <option value="full">full (Research scale 10k images)</option>
            </select>
          </div>

          {/* Stages Input */}
          <div>
            <label className="text-xs text-slate-300 font-medium mb-1 block">Stages</label>
            <input
              type="text"
              value={stages}
              onChange={e => setStages(e.target.value)}
              disabled={running}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none"
            />
          </div>

          {/* Sweep Checkbox */}
          <div className="flex items-center pt-5">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={sweep}
                onChange={e => setSweep(e.target.checked)}
                disabled={running}
                className="accent-brand-500 rounded"
              />
              <span>Architectural Sweep (--sweep)</span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          {!running ? (
            <button
              onClick={handleStart}
              className="py-2.5 px-6 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs shadow-lg shadow-brand-500/20 flex items-center gap-2 transition"
            >
              <Play className="h-4 w-4 fill-white" />
              Start Pipeline Run
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="py-2.5 px-6 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-lg shadow-rose-500/20 flex items-center gap-2 transition"
            >
              <Square className="h-4 w-4 fill-white" />
              Terminate Pipeline Job
            </button>
          )}

          {statusInfo?.status === 'running' && (
            <span className="flex items-center gap-2 text-xs text-brand-400 font-mono">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Running: {statusInfo.cmd}
            </span>
          )}
        </div>
      </div>

      {/* Real-time Streaming Logs Terminal */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex flex-col h-[480px]">
        {/* Terminal Header */}
        <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
            </div>
            <span className="font-mono text-slate-400 text-[11px] ml-2">stdout / stderr stream</span>
          </div>
          <button
            onClick={() => setLogs([])}
            className="text-[11px] text-slate-500 hover:text-slate-300 font-mono"
          >
            Clear Console
          </button>
        </div>

        {/* Terminal Body */}
        <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1 text-slate-300 selection:bg-brand-500/30">
          {logs.length === 0 ? (
            <div className="text-slate-600 italic">No output yet. Click 'Start Pipeline Run' to initiate execution.</div>
          ) : (
            logs.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes('ERROR') || line.includes('failed')
                    ? 'text-rose-400'
                    : line.includes('WARNING')
                    ? 'text-amber-300'
                    : line.includes('====')
                    ? 'text-cyan-400 font-bold'
                    : line.includes('finished')
                    ? 'text-emerald-400 font-bold'
                    : 'text-slate-300'
                }
              >
                {line}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
