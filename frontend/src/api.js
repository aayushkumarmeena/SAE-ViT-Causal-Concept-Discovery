import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

export const getSystemInfo = () => api.get('/system/info').then(r => r.data);
export const getExperiments = () => api.get('/experiments').then(r => r.data);
export const getRunOverview = (exp, run) => api.get(`/experiments/${exp}/${run}/overview`).then(r => r.data);
export const getFeatures = (exp, run, params = {}) => api.get(`/experiments/${exp}/${run}/features`, { params }).then(r => r.data);
export const getFeatureDetail = (exp, run, fid) => api.get(`/experiments/${exp}/${run}/features/${fid}`).then(r => r.data);
export const getCausalImages = (exp, run, fid = 0) => api.get(`/experiments/${exp}/${run}/causal-images`, { params: { feature_id: fid } }).then(r => r.data);

export const runIntervention = (exp, run, data) => api.post(`/experiments/${exp}/${run}/intervene`, data).then(r => r.data);
export const analyzeImage = (exp, run, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/experiments/${exp}/${run}/analyze-image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const runInteraction = (exp, run, data) => api.post(`/experiments/${exp}/${run}/interaction`, data).then(r => r.data);
export const getRandomControls = (exp, run, fid) => api.get(`/experiments/${exp}/${run}/random-controls`, { params: { feature_id: fid } }).then(r => r.data);
export const getHypotheses = (exp) => api.get(`/experiments/${exp}/hypotheses`).then(r => r.data);
export const getComparisons = (exp) => api.get(`/experiments/${exp}/comparisons`).then(r => r.data);

export const triggerPipeline = (data) => api.post('/pipeline/run', data).then(r => r.data);
export const stopPipeline = () => api.post('/pipeline/stop').then(r => r.data);
export const getPipelineStatus = () => api.get('/pipeline/status').then(r => r.data);

// Advanced Endpoints
export const multiSteer = (exp, run, data) => api.post(`/experiments/${exp}/${run}/multi-steer`, data).then(r => r.data);
export const getDoseResponse = (exp, run, fid) => api.get(`/experiments/${exp}/${run}/dose-response/${fid}`).then(r => r.data);
export const inspectPatch = (exp, run, data) => api.post(`/experiments/${exp}/${run}/patch-inspect`, data).then(r => r.data);
export const getCircuitGraph = (exp, run, maxNodes = 24) => api.get(`/experiments/${exp}/${run}/circuit-graph`, { params: { max_nodes: maxNodes } }).then(r => r.data);
export const getVivaDefense = () => api.get('/viva-defense').then(r => r.data);

export default api;

