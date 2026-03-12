import { X } from 'lucide-react';

interface DiffViewerProps {
  deployment: {
    version: string;
    changes: Array<{
      file: string;
      additions: number;
      deletions: number;
    }>;
  };
  onClose: () => void;
}

const mockDiff = `
@@ -1,5 +1,7 @@
 export function getUserById(id: string) {
+  // Added caching layer
+  const cached = cache.get(\`user:\${id}\`);
+  if (cached) return cached;
+
   const user = await db.users.findOne({ id });
-  return user;
+  cache.set(\`user:\${id}\`, user);
+  return user;
 }
`.trim();

export default function DiffViewer({ deployment, onClose }: DiffViewerProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1f2e] border border-[#2d3748] rounded-lg max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#2d3748]">
          <div>
            <h2 className="text-xl font-semibold">Changes in {deployment.version}</h2>
            <p className="text-sm text-[#94a3b8] mt-1">
              {deployment.changes.length} files changed
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#2d3748] hover:bg-[#374151] flex items-center justify-center transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* File List */}
        <div className="p-6 overflow-auto">
          <div className="space-y-4">
            {deployment.changes.map((change, i) => (
              <div key={i} className="bg-[#2d3748] rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-[#0f1117]">
                  <span className="font-mono text-sm">{change.file}</span>
                  <div className="flex gap-3 text-sm">
                    <span className="text-[#16a34a]">+{change.additions}</span>
                    <span className="text-[#dc2626]">-{change.deletions}</span>
                  </div>
                </div>
                
                <div className="p-4 font-mono text-xs overflow-x-auto">
                  {mockDiff.split('\n').map((line, j) => (
                    <div
                      key={j}
                      className={`${
                        line.startsWith('+') ? 'bg-[#16a34a]/20 text-[#16a34a]' :
                        line.startsWith('-') ? 'bg-[#dc2626]/20 text-[#dc2626]' :
                        line.startsWith('@@') ? 'text-[#2563eb]' :
                        'text-[#94a3b8]'
                      } px-2 py-0.5`}
                    >
                      {line || ' '}
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
