import { useState } from 'react';
import { X, DollarSign, Cpu, HardDrive } from 'lucide-react';

interface CostEstimatorProps {
  onClose: () => void;
}

const containerOptions = [
  { name: 'nginx', defaultRam: 512, defaultCpu: 0.5 },
  { name: 'frontend', defaultRam: 512, defaultCpu: 1 },
  { name: 'backend', defaultRam: 2048, defaultCpu: 2 },
  { name: 'postgres', defaultRam: 4096, defaultCpu: 1 },
  { name: 'redis', defaultRam: 256, defaultCpu: 0.5 },
  { name: 'certbot', defaultRam: 128, defaultCpu: 0.25 },
];

// Pricing (example rates per month)
const RAM_COST_PER_GB = 5; // $5 per GB
const CPU_COST_PER_CORE = 10; // $10 per vCPU

export default function CostEstimator({ onClose }: CostEstimatorProps) {
  const [containers, setContainers] = useState(
    containerOptions.map(c => ({ ...c, ram: c.defaultRam, cpu: c.defaultCpu, enabled: true }))
  );

  const updateContainer = (index: number, field: 'ram' | 'cpu' | 'enabled', value: number | boolean) => {
    setContainers(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const totalRamGB = containers.filter(c => c.enabled).reduce((sum, c) => sum + c.ram, 0) / 1024;
  const totalCpu = containers.filter(c => c.enabled).reduce((sum, c) => sum + c.cpu, 0);
  const totalCost = (totalRamGB * RAM_COST_PER_GB) + (totalCpu * CPU_COST_PER_CORE);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1f2e] border border-[#2d3748] rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#2d3748]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#16a34a]/20 flex items-center justify-center">
              <DollarSign className="text-[#16a34a]" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Cost Estimator</h2>
              <p className="text-sm text-[#94a3b8]">Estimate your monthly infrastructure costs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#2d3748] hover:bg-[#374151] flex items-center justify-center transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-auto">
          <div className="space-y-4">
            {containers.map((container, index) => (
              <div
                key={container.name}
                className={`bg-[#2d3748] rounded-lg p-4 transition-all ${
                  !container.enabled && 'opacity-50'
                }`}
              >
                <div className="flex items-center gap-4 mb-4">
                  <input
                    type="checkbox"
                    checked={container.enabled}
                    onChange={(e) => updateContainer(index, 'enabled', e.target.checked)}
                    className="w-4 h-4 rounded border-[#2d3748] bg-[#1a1f2e] text-[#2563eb] focus:ring-2 focus:ring-[#2563eb]"
                  />
                  <span className="font-semibold flex-1">{container.name}</span>
                  <span className="text-sm text-[#94a3b8]">
                    ${((container.ram / 1024) * RAM_COST_PER_GB + container.cpu * CPU_COST_PER_CORE).toFixed(2)}/mo
                  </span>
                </div>

                {container.enabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 text-sm text-[#94a3b8] mb-2">
                        <HardDrive size={14} />
                        RAM (MB)
                      </label>
                      <input
                        type="number"
                        value={container.ram}
                        onChange={(e) => updateContainer(index, 'ram', Number(e.target.value))}
                        step="128"
                        min="128"
                        className="w-full bg-[#1a1f2e] border border-[#2d3748] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-2 text-sm text-[#94a3b8] mb-2">
                        <Cpu size={14} />
                        CPU (cores)
                      </label>
                      <input
                        type="number"
                        value={container.cpu}
                        onChange={(e) => updateContainer(index, 'cpu', Number(e.target.value))}
                        step="0.25"
                        min="0.25"
                        className="w-full bg-[#1a1f2e] border border-[#2d3748] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="mt-6 bg-[#2563eb]/10 border border-[#2563eb]/30 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Monthly Cost Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">Total RAM:</span>
                <span className="font-medium">{totalRamGB.toFixed(2)} GB × ${RAM_COST_PER_GB} = ${(totalRamGB * RAM_COST_PER_GB).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94a3b8]">Total CPU:</span>
                <span className="font-medium">{totalCpu.toFixed(2)} cores × ${CPU_COST_PER_CORE} = ${(totalCpu * CPU_COST_PER_CORE).toFixed(2)}</span>
              </div>
              <div className="h-px bg-[#2d3748]"></div>
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Total Monthly Cost:</span>
                <span className="font-bold text-[#16a34a]">${totalCost.toFixed(2)}</span>
              </div>
              <div className="text-xs text-[#94a3b8] text-center pt-2">
                * Prices are estimates and may vary based on your hosting provider
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#2d3748]">
          <button
            onClick={onClose}
            className="w-full bg-[#2563eb] hover:bg-[#1e40af] py-2 rounded-lg transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
