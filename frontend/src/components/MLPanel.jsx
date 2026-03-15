import React, { useState } from 'react';
import axios from 'axios';
import { Brain, RefreshCw } from 'lucide-react';
import { BACKEND_URL } from '../utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('alphadesk_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

export default function MLPanel({ mlStats }) {
  const [training, setTraining] = useState(false);

  const triggerRetrain = async () => {
    setTraining(true);
    try {
      await api.post('/api/ml/train');
      alert('Training started in background. Check back in 5 minutes.');
    } catch (e) {
      alert(e.response?.data?.error || 'ML engine unavailable');
    }
    setTraining(false);
  };

  const model = mlStats?.models?.[0];

  return (
    <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: '1px solid #1e2d4a' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={16} color="#3b82f6" />
          <h3 style={{ color: '#e2e8f0', fontSize: 14 }}>ML Engine</h3>
        </div>
        <button
          onClick={triggerRetrain} disabled={training}
          style={{
            background: '#1e3a5f', color: '#3b82f6', border: '1px solid #3b82f6',
            borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <RefreshCw size={11} className={training ? 'spin' : ''} />
          {training ? 'Training...' : 'Retrain'}
        </button>
      </div>

      {model ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Version',  val: model.version },
            { label: 'AUC',      val: model.auc?.toFixed(3) },
            { label: 'Accuracy', val: `${(model.accuracy * 100).toFixed(1)}%` },
            { label: 'F1 Score', val: model.f1?.toFixed(3) },
            { label: 'Samples',  val: model.samples?.toLocaleString() },
            { label: 'Features', val: model.features },
          ].map(({ label, val }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{val ?? '—'}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#64748b', fontSize: 12, padding: '20px 0' }}>
          No trained model yet. Click Retrain to start.
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: '#64748b' }}>
        Ensemble: 60% XGBoost + 40% Random Forest + PPO RL Agent
      </div>
    </div>
  );
}
