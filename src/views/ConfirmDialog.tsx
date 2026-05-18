import { AlertTriangle, X } from 'lucide-react';

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-panel border border-rim rounded-lg w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex items-start justify-between px-5 py-4 border-b border-rim gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={15} className="text-red-400 shrink-0" />
            <p className="text-sm font-semibold text-ink">{title}</p>
          </div>
          <button onClick={onCancel} className="text-ink-dim hover:text-ink transition-colors mt-0.5">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-ink-dim leading-relaxed">{body}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-rim">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs text-ink-dim border border-rim hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-500 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
