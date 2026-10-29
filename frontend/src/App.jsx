import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import OverviewView from './views/OverviewView';
import StudioView from './views/StudioView';
import FeatureExplorerView from './views/FeatureExplorerView';
import StatisticalControlsView from './views/StatisticalControlsView';
import InteractionsView from './views/InteractionsView';
import ComparisonsView from './views/ComparisonsView';
import PipelineRunnerView from './views/PipelineRunnerView';
import ExportReportsView from './views/ExportReportsView';
import { getExperiments, getRunOverview, getSystemInfo } from './api';

export default function App() {
  const [experiments, setExperiments] = useState([]);
  const [selectedExp, setSelectedExp] = useState('');
  const [selectedRun, setSelectedRun] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [runDetails, setRunDetails] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // Studio target feature state (can be set from FeatureExplorer)
  const [studioFeatureId, setStudioFeatureId] = useState(0);

  // Fetch experiments and system info on initial mount
  const loadInitialData = async () => {
    try {
      const [sys, exps] = await Promise.all([
        getSystemInfo().catch(() => null),
        getExperiments().catch(() => []),
      ]);
      setSystemInfo(sys);
      setExperiments(exps);

      if (exps.length > 0) {
        const firstExp = exps[0];
        setSelectedExp(firstExp.name);
        if (firstExp.runs && firstExp.runs.length > 0) {
          setSelectedRun(firstExp.runs[0].run_id);
        }
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // When selected experiment changes, update default run
  useEffect(() => {
    const cur = experiments.find(e => e.name === selectedExp);
    if (cur && cur.runs && cur.runs.length > 0) {
      const runExists = cur.runs.some(r => r.run_id === selectedRun);
      if (!runExists) {
        setSelectedRun(cur.runs[0].run_id);
      }
    }
  }, [selectedExp, experiments]);

  // When selected run changes, fetch run overview
  useEffect(() => {
    if (selectedExp && selectedRun) {
      setLoading(true);
      getRunOverview(selectedExp, selectedRun)
        .then(details => setRunDetails(details))
        .catch(err => {
          console.error(err);
          setRunDetails(null);
        })
        .finally(() => setLoading(false));
    }
  }, [selectedExp, selectedRun]);

  const handleSelectFeatureForStudio = (fid) => {
    setStudioFeatureId(fid);
    setActiveTab('studio');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans selection:bg-brand-500 selection:text-white">
      {/* Navigation Bar */}
      <Navbar
        experiments={experiments}
        selectedExp={selectedExp}
        setSelectedExp={setSelectedExp}
        selectedRun={selectedRun}
        setSelectedRun={setSelectedRun}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        systemInfo={systemInfo}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'overview' && (
          <OverviewView runDetails={runDetails} loading={loading} />
        )}
        {activeTab === 'studio' && (
          <StudioView
            expName={selectedExp}
            runId={selectedRun}
            defaultFeature={studioFeatureId}
          />
        )}
        {activeTab === 'features' && (
          <FeatureExplorerView
            expName={selectedExp}
            runId={selectedRun}
            onSelectFeatureForStudio={handleSelectFeatureForStudio}
          />
        )}
        {activeTab === 'stats' && (
          <StatisticalControlsView expName={selectedExp} runId={selectedRun} />
        )}
        {activeTab === 'interactions' && (
          <InteractionsView expName={selectedExp} runId={selectedRun} />
        )}
        {activeTab === 'comparisons' && (
          <ComparisonsView expName={selectedExp} />
        )}
        {activeTab === 'pipeline' && (
          <PipelineRunnerView onPipelineFinished={loadInitialData} />
        )}
        {activeTab === 'export' && (
          <ExportReportsView expName={selectedExp} runId={selectedRun} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>SAE-ViT Mechanistic Causal Interpretability Platform</span>
          <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
            <span>FastAPI REST & SSE</span>
            <span>React + Vite</span>
            <span>Docker Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
