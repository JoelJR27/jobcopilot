'use client';

import { useEffect, useState } from 'react';

class EditorRequestError extends Error {}

async function requestData(resource: 'profile' | 'preferences', init: RequestInit) {
    const response = await fetch(`/api/${resource}`, { ...init, cache: 'no-store', credentials: 'same-origin' });
    if (response.status === 401) throw new EditorRequestError('Sua sessão expirou. Entre na sua conta novamente.');
    const body: unknown = await response.json();
    if (!response.ok) {
        if (response.status === 400 && body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
            throw new EditorRequestError(body.error.slice(0, 300));
        }
        throw new Error('Não foi possível confirmar a operação. Tente novamente.');
    }
    if (!body || typeof body !== 'object' || !(resource in body)) throw new Error('Resposta inválida. Tente novamente.');
    return (body as Record<string, unknown>)[resource];
}

export function useAccountEditor<T>(resource: 'profile' | 'preferences', initialData: T, decode: (data: unknown) => T) {
    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(true);
    const [ready, setReady] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        requestData(resource, { signal: controller.signal }).then((value) => {
            if (active) { setData(value === null ? initialData : decode(value)); setReady(true); }
        }).catch(() => {
            if (active) setError('Não foi possível carregar seus dados. Verifique sua sessão e tente novamente.');
        }).finally(() => {
            clearTimeout(timer);
            if (active) setLoading(false);
        });
        return () => { active = false; clearTimeout(timer); controller.abort(); };
    }, [resource, initialData, decode, version]);

    function edit(next: T) { setData(next); setSaved(false); setError(''); }
    function reload() { setError(''); setSaved(false); setReady(false); setLoading(true); setVersion((value) => value + 1); }

    async function save(payload: unknown) {
        setSaving(true); setSaved(false); setError('');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const value = await requestData(resource, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload), signal: controller.signal,
            });
            setData(decode(value)); setSaved(true);
        } catch (failure) {
            // Exceptions locais não são enviadas a logs/telemetria.
            setError(failure instanceof EditorRequestError && !controller.signal.aborted ? failure.message : 'Não foi possível confirmar o salvamento. Tente novamente.');
        } finally { clearTimeout(timer); setSaving(false); }
    }

    return { data, loading, ready, saving, error, saved, edit, reload, save, setError };
}
