import { useState } from 'react';
import { X, Loader2, Sparkles, SkipForward } from 'lucide-react';
import { useVaultStore } from '../state/vaultStore';

interface Props {
  onClose(): void;
  onCreated(vaultId: number): void;
}

export function NewVaultModal({ onClose, onCreated }: Props) {
  const { createVault, generatePurpose } = useVaultStore();

  const [name, setName]             = useState('');
  const [description, setDesc]      = useState('');
  const [questions, setQuestions]   = useState('');
  const [step, setStep]             = useState<'form' | 'generating'>('form');
  const [error, setError]           = useState('');

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || '';

  async function handleCreate(withGenerate: boolean) {
    if (!name.trim()) { setError('Vault name is required'); return; }
    setError('');
    setStep('generating');
    try {
      const vault = await createVault(name.trim(), slug);
      if (withGenerate && description.trim()) {
        await generatePurpose(vault.id, description.trim(), questions.trim());
      }
      onCreated(vault.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStep('form');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-panel border border-rim rounded-xl shadow-2xl w-full max-w-lg mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rim">
          <h2 className="text-[15px] font-semibold text-ink">New vault</h2>
          <button
            onClick={onClose}
            className="text-ink-dim hover:text-ink transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {step === 'generating' ? (
          <div className="px-6 py-10 flex flex-col items-center gap-3">
            <Loader2 size={24} className="text-amber animate-spin" />
            <p className="text-sm text-ink-dim">Setting up your vault…</p>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">

            {/* Name */}
            <label className="block">
              <span className="block text-xs text-ink-dim mb-1.5">Vault name <span className="text-red-400">*</span></span>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Work Research, ML Papers, Meeting Notes"
                className="w-full bg-base border border-rim rounded px-3 py-2 text-sm text-ink placeholder:text-ink-dim/40 input-amber-focus"
              />
              {slug && (
                <p className="mt-1 text-[11px] text-ink-dim font-mono">slug: {slug}</p>
              )}
            </label>

            {/* Description */}
            <label className="block">
              <span className="block text-xs text-ink-dim mb-1.5">What is this vault for? <span className="text-ink-dim/50">(optional — used to generate purpose.md)</span></span>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDesc(e.target.value)}
                placeholder="e.g. I'm tracking all meeting notes and internal decisions for the MPAY project. I want to search and summarize them later."
                className="w-full bg-base border border-rim rounded px-3 py-2 text-sm text-ink placeholder:text-ink-dim/40 input-amber-focus resize-none"
              />
            </label>

            {/* Key questions */}
            <label className="block">
              <span className="block text-xs text-ink-dim mb-1.5">Key questions you want to answer <span className="text-ink-dim/50">(optional, one per line)</span></span>
              <textarea
                rows={3}
                value={questions}
                onChange={e => setQuestions(e.target.value)}
                placeholder="What decisions were made in sprint planning?&#10;Who owns the payment reconciliation work?&#10;What blockers came up last quarter?"
                className="w-full bg-base border border-rim rounded px-3 py-2 text-sm text-ink placeholder:text-ink-dim/40 input-amber-focus resize-none"
              />
            </label>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => handleCreate(true)}
                disabled={!name.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium text-black disabled:opacity-40 transition-all hover:opacity-90 active:scale-95"
                style={{ background: 'var(--color-amber)' }}
              >
                <Sparkles size={13} />
                {description.trim() ? 'Create + generate purpose' : 'Create vault'}
              </button>

              <button
                onClick={() => handleCreate(false)}
                disabled={!name.trim()}
                className="flex items-center gap-2 px-3 py-2 rounded text-sm text-ink-dim hover:text-ink border border-rim hover:border-ink-dim transition-colors disabled:opacity-40"
              >
                <SkipForward size={13} />
                Skip — use defaults
              </button>
            </div>

            <p className="text-[11px] text-ink-dim/60 pb-1">
              You can always edit <code className="font-mono">purpose.md</code> in the vault folder later.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
