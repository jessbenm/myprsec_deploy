import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface RollbackModalProps {
  deployment: {
    version: string;
    date: string;
  };
  onClose: () => void;
  onConfirm: () => void;
}

export default function RollbackModal({ deployment, onClose, onConfirm }: RollbackModalProps) {
  const [countdown, setCountdown] = useState(5);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!confirmed || countdown <= 0) return;
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onConfirm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [confirmed, countdown, onConfirm]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1f2e] border border-[#2d3748] rounded-lg max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#2d3748]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#ea580c]/20 flex items-center justify-center">
              <AlertTriangle className="text-[#ea580c]" size={20} />
            </div>
            <h2 className="text-xl font-semibold">Confirm Rollback</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#2d3748] hover:bg-[#374151] flex items-center justify-center transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="bg-[#ea580c]/10 border border-[#ea580c]/30 rounded-lg p-4">
            <p className="text-sm text-[#ea580c]">
              ⚠️ This action will rollback your production environment to a previous version.
              All current changes will be reverted.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-[#94a3b8]">Rollback to:</span>
              <span className="font-medium">{deployment.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#94a3b8]">Deployed:</span>
              <span className="font-medium">{deployment.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#94a3b8]">Environment:</span>
              <span className="font-medium">Production</span>
            </div>
          </div>

          {confirmed && countdown > 0 && (
            <div className="bg-[#2d3748] rounded-lg p-4 text-center">
              <div className="text-4xl font-bold text-[#2563eb] mb-2">{countdown}</div>
              <div className="text-sm text-[#94a3b8]">Rolling back in {countdown} seconds...</div>
              <button
                onClick={() => {
                  setConfirmed(false);
                  setCountdown(5);
                }}
                className="mt-3 text-sm text-[#ea580c] hover:underline"
              >
                Cancel rollback
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {!confirmed && (
          <div className="p-6 border-t border-[#2d3748] flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-[#2d3748] hover:bg-[#374151] py-2 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => setConfirmed(true)}
              className="flex-1 bg-[#ea580c] hover:bg-[#c2410c] py-2 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <AlertTriangle size={16} />
              Confirm Rollback
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
