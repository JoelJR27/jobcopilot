'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function ResumeStep() {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = new FormData(form);
        const file = payload.get('file');
        setError(''); setSaved(false);
        if (!(file instanceof File) || file.size === 0) { setError('Selecione um currículo PDF ou DOCX.'); return; }
        if (file.size > 5 * 1024 * 1024) { setError('O currículo deve possuir no máximo 5 MB.'); return; }
        setSaving(true);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);
        try {
            const response = await fetch('/api/resumes', { method: 'POST', body: payload,
                credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
            if (!response.ok) {
                if (response.status === 401) { setError('Sua sessão expirou. Entre novamente.'); return; }
                const body: unknown = await response.json();
                if (response.status === 400 && body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
                    setError(body.error.slice(0, 300));
                } else if (response.status === 429) setError('Muitos envios. Aguarde e tente novamente.');
                else setError('Não foi possível confirmar o envio do currículo. Tente novamente.');
                return;
            }
            setSaved(true); form.reset(); router.refresh();
        } catch { setError('Não foi possível confirmar o envio do currículo. Tente novamente.'); }
        finally { clearTimeout(timer); setSaving(false); }
    }

    return <form onSubmit={submit} className="mt-3 space-y-2">
        <label htmlFor="resume-file" className="block">Currículo PDF ou DOCX, até 5 MB</label>
        <input id="resume-file" name="file" type="file" required accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={saving} />
        <button type="submit" disabled={saving} className="block rounded bg-blue-800 px-4 py-2 text-white disabled:opacity-60">{saving ? 'Enviando…' : 'Enviar currículo'}</button>
        {error && <p role="alert" className="text-red-800">{error}</p>}
        {saved && <p role="status" className="text-green-800">Currículo enviado com sucesso.</p>}
    </form>;
}
