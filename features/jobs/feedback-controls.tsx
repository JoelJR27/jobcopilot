'use client';
import { useState } from 'react';
import type { FeedbackType } from '@/domain/jobs/feedback';
export function FeedbackControls({ matchId, initial }: { matchId: string; initial: FeedbackType | null }) {
    const [value, setValue] = useState(initial); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
    async function save(type: FeedbackType) {
        setSaving(true); setMessage(''); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch('/api/job-matches/' + encodeURIComponent(matchId) + '/feedback', { method: 'PUT', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type }) });
            if (!response.ok) throw new Error();
            setValue(type); setMessage('Feedback salvo.');
        } catch { setMessage('Não foi possível salvar o feedback. Tente novamente.'); }
        finally { clearTimeout(timer); setSaving(false); }
    }
    return <div className="space-y-2"><div className="flex gap-3">
        <button type="button" className="rounded border px-3 py-2" aria-pressed={value === 'RELEVANT'} disabled={saving} onClick={() => save('RELEVANT')}>Relevante</button>
        <button type="button" className="rounded border px-3 py-2" aria-pressed={value === 'NOT_RELEVANT'} disabled={saving} onClick={() => save('NOT_RELEVANT')}>Não relevante</button>
    </div><p role="status">{saving ? 'Salvando feedback…' : message}</p></div>;
}
