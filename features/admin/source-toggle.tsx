'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function SourceToggle({ id, initial }: { id: string; initial: boolean }) {
    const router = useRouter();
    const [active, setActive] = useState(initial); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
    async function toggle() {
        setSaving(true); setMessage(''); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch('/api/admin/job-sources/' + encodeURIComponent(id), { method: 'PUT', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: !active }) });
            if (!response.ok) throw new Error();
            setActive(!active); setMessage('Fonte atualizada.'); router.refresh();
        } catch { setMessage('Não foi possível atualizar a fonte.'); }
        finally { clearTimeout(timer); setSaving(false); }
    }
    return <div><button type="button" disabled={saving} onClick={toggle} className="rounded border px-3 py-2">{saving ? 'Salvando…' : active ? 'Desativar' : 'Ativar'}</button><p role="status">{message}</p></div>;
}
