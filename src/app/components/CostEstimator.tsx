import { useState, useEffect } from 'react';
import { X, DollarSign, Cpu, HardDrive, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface CostEstimatorProps {
  onClose: () => void;
  vpsId?: string;
}

interface ContainerData {
  name: string;
  ram: number;   // MB
  cpu: number;   // cores (estimated)
  enabled: boolean;
  realRam?: number; // RAM réelle depuis docker stats
}

const RAM_COST_PER_GB  = 5;   // $5/GB/mois
const CPU_COST_PER_CORE = 10; // $10/vCPU/mois
const STORAGE_COST     = 8;   // $8/mois fixe
const NETWORK_COST     = 3;   // $3/mois fixe

export default function CostEstimator({ onClose, vpsId }: CostEstimatorProps) {
  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [vpsList,    setVpsList]    = useState<{id:string;name:string}[]>([]);
  const [selectedVps, setSelectedVps] = useState(vpsId || '');

  // ── Charger les VPS disponibles ────────────────────────────────────────────
  useEffect(() => {
    apiFetch(`/api/vps`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : Object.values(data);
        setVpsList(list as any);
        if (!selectedVps && list.length > 0) setSelectedVps((list[0] as any).id);
      })
      .catch(() => {});
  }, []);

  // ── Charger les métriques réelles du VPS sélectionné ──────────────────────
  const loadMetrics = async () => {
    if (!selectedVps) return;
    setLoading(true);
    try {
      const res  = await apiFetch(`/api/metrics/${selectedVps}`);
      if (!res.ok) throw new Error();
      const data = await res.json();

      const parsed: ContainerData[] = data.containers.map((c: any) => {
        // Parser la RAM réelle
        const memMatch = c.mem?.match(/([\d.]+)\s*(MiB|GiB|MB|GB)/i);
        const realRamMB = memMatch
          ? parseFloat(memMatch[1]) * (/gib|gb/i.test(memMatch[2]) ? 1024 : 1)
          : 0;

        // Estimer les cores CPU (0.5 par défaut, 1 pour backend/db)
        const name = c.name?.toLowerCase() || '';
        const cpuCores = name.includes('backend') || name.includes('db') || name.includes('postgres') ? 1
          : name.includes('frontend') ? 0.5
          : 0.25;

        // RAM allouée (limite docker)
        const limitMatch = c.mem?.match(/\/\s*([\d.]+)\s*(MiB|GiB|MB|GB)/i);
        const limitMB = limitMatch
          ? parseFloat(limitMatch[1]) * (/gib|gb/i.test(limitMatch[2]) ? 1024 : 1)
          : realRamMB * 2;

        const shortName = c.name
          .replace('mypresc-staging-', '')
          .replace('mypresc-production-', '')
          .replace('mypresc-', '');

        return {
          name:    shortName,
          ram:     Math.round(limitMB),
          cpu:     cpuCores,
          realRam: Math.round(realRamMB),
          enabled: true,
        };
      });

      setContainers(parsed);
    } catch {
      // Fallback si pas de connexion
      setContainers([
        { name: 'nginx',    ram: 128,  cpu: 0.25, enabled: true },
        { name: 'frontend', ram: 512,  cpu: 0.5,  enabled: true },
        { name: 'backend',  ram: 1024, cpu: 1,    enabled: true },
        { name: 'postgres', ram: 512,  cpu: 1,    enabled: true },
        { name: 'redis',    ram: 256,  cpu: 0.25, enabled: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (selectedVps) loadMetrics(); }, [selectedVps]);

  const update = (i: number, field: keyof ContainerData, value: any) => {
    setContainers(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };

  const active      = containers.filter(c => c.enabled);
  const totalRamGB  = active.reduce((s, c) => s + c.ram, 0) / 1024;
  const totalCpu    = active.reduce((s, c) => s + c.cpu, 0);
  const ramCost     = totalRamGB * RAM_COST_PER_GB;
  const cpuCost     = totalCpu * CPU_COST_PER_CORE;
  const totalCost   = ramCost + cpuCost + STORAGE_COST + NETWORK_COST;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1e293b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#16a34a]/15 border border-[#16a34a]/30 flex items-center justify-center">
              <DollarSign className="text-[#16a34a]" size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Cost Estimator</h2>
              <p className="text-xs text-[#475569]">Estimation mensuelle basée sur les données réelles</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadMetrics} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#94a3b8] hover:text-white transition-colors" style={{ background: '#1e293b' }}>
              <RefreshCw size={11} /> Refresh
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1e293b] hover:bg-[#2d3748] flex items-center justify-center transition-all text-[#94a3b8]">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* VPS selector */}
        {vpsList.length > 1 && (
          <div className="px-5 pt-4 flex items-center gap-3">
            <span className="text-xs text-[#475569] font-medium">VPS :</span>
            <div className="flex gap-2">
              {vpsList.map(v => (
                <button key={v.id} onClick={() => setSelectedVps(v.id)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: selectedVps === v.id ? 'linear-gradient(135deg, #06b6d4, #2563eb)' : '#1e293b',
                    color: selectedVps === v.id ? '#fff' : '#64748b',
                  }}>
                  {v.name || v.id}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-[#475569]">
              <Loader2 size={18} className="animate-spin text-[#06b6d4]" />
              <span className="text-sm">Chargement des données réelles...</span>
            </div>
          ) : (
            <>
              <div className="space-y-2.5 mb-5">
                {containers.map((c, i) => {
                  const cost = ((c.ram / 1024) * RAM_COST_PER_GB + c.cpu * CPU_COST_PER_CORE).toFixed(2);
                  return (
                    <div key={c.name} className="rounded-xl p-3.5 transition-all"
                      style={{ background: '#1e293b', opacity: c.enabled ? 1 : 0.45, border: '1px solid #334155' }}>
                      <div className="flex items-center gap-3 mb-2.5">
                        <input type="checkbox" checked={c.enabled}
                          onChange={e => update(i, 'enabled', e.target.checked)}
                          className="w-3.5 h-3.5 accent-cyan-500 cursor-pointer" />
                        <span className="font-semibold text-sm text-white flex-1 capitalize">{c.name}</span>
                        {c.realRam && (
                          <span className="text-[10px] text-[#06b6d4] font-mono">
                            Réel: {c.realRam < 1024 ? `${c.realRam}MB` : `${(c.realRam/1024).toFixed(1)}GB`}
                          </span>
                        )}
                        <span className="text-xs font-bold text-[#16a34a]">${cost}/mo</span>
                      </div>
                      {c.enabled && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="flex items-center gap-1.5 text-[10px] text-[#475569] mb-1.5 font-medium">
                              <HardDrive size={11} /> RAM allouée (MB)
                            </label>
                            <input type="number" value={c.ram}
                              onChange={e => update(i, 'ram', Number(e.target.value))}
                              step="128" min="128"
                              className="w-full rounded-lg px-3 py-1.5 text-xs outline-none text-white"
                              style={{ background: '#0f172a', border: '1px solid #334155' }} />
                          </div>
                          <div>
                            <label className="flex items-center gap-1.5 text-[10px] text-[#475569] mb-1.5 font-medium">
                              <Cpu size={11} /> CPU (cores)
                            </label>
                            <input type="number" value={c.cpu}
                              onChange={e => update(i, 'cpu', Number(e.target.value))}
                              step="0.25" min="0.25"
                              className="w-full rounded-lg px-3 py-1.5 text-xs outline-none text-white"
                              style={{ background: '#0f172a', border: '1px solid #334155' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
              <div className="rounded-xl p-4" style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }}>
                <h3 className="text-sm font-bold text-white mb-3">Résumé mensuel</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-[#94a3b8]">
                    <span>RAM ({totalRamGB.toFixed(2)} GB × ${RAM_COST_PER_GB})</span>
                    <span className="text-white font-mono">${ramCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#94a3b8]">
                    <span>CPU ({totalCpu.toFixed(2)} cores × ${CPU_COST_PER_CORE})</span>
                    <span className="text-white font-mono">${cpuCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#94a3b8]">
                    <span>Stockage (forfait)</span>
                    <span className="text-white font-mono">${STORAGE_COST.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#94a3b8]">
                    <span>Réseau (forfait)</span>
                    <span className="text-white font-mono">${NETWORK_COST.toFixed(2)}</span>
                  </div>
                  <div className="h-px bg-[#1e293b] my-1" />
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-white">Total mensuel estimé</span>
                    <span className="text-[#16a34a] text-base">${totalCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#475569]">
                    <span>Coût annuel</span>
                    <span className="font-mono">${(totalCost * 12).toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-[10px] text-[#334155] mt-3 text-center">
                  * Estimation — les prix réels dépendent de votre hébergeur
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}