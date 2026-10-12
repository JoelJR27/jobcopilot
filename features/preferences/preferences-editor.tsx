'use client';

import type { FormEvent } from 'react';
import { preferencesSchema, type Preferences } from '@/domain/preferences/preferences';
import { WORK_MODEL_LABELS } from '@/shared/validation/professional-fields';
import { useAccountEditor } from '@/features/account/use-account-editor';
import { EditorNavigation, ListField, SeniorityField, splitLines } from '@/features/account/editor-fields';

const initial = { desiredRoles: '', desiredSkills: '', seniority: '', workModels: [] as Preferences['workModels'], locations: '' };
function decode(data: unknown): typeof initial {
    const preferences = preferencesSchema.parse(data);
    return { ...preferences, desiredRoles: preferences.desiredRoles.join('\n'), desiredSkills: preferences.desiredSkills.join('\n'), locations: preferences.locations.join('\n') };
}

export default function PreferencesEditor() {
    const editor = useAccountEditor('preferences', initial, decode);
    function change(field: 'desiredRoles' | 'desiredSkills' | 'seniority' | 'locations', value: string) { editor.edit({ ...editor.data, [field]: value }); }
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const result = preferencesSchema.safeParse({ ...editor.data,
            desiredRoles: splitLines(editor.data.desiredRoles), desiredSkills: splitLines(editor.data.desiredSkills), locations: splitLines(editor.data.locations),
        });
        if (!result.success) { editor.setError(result.error.issues[0].message); return; }
        await editor.save(result.data);
    }
    return <main lang="pt-BR" className="mx-auto max-w-2xl px-5 py-10 text-slate-900">
        <EditorNavigation /><h1 className="mb-2 text-3xl font-semibold">Preferências de vagas</h1>
        <p className="mb-6 text-slate-600">Escolha os cargos e formatos de trabalho que procura. Campos com * são obrigatórios.</p>
        {editor.loading ? <p role="status">Carregando preferências…</p> : <>
            {editor.error && <div className="mb-4"><p role="alert" className="text-red-800">{editor.error}</p>
                <button type="button" onClick={editor.reload} disabled={editor.saving} className="mt-2 underline">Recarregar dados</button></div>}
            {editor.saved && <p role="status" className="mb-4 text-green-800">Preferências salvas com sucesso.</p>}
            {editor.ready && <form onSubmit={submit}><fieldset disabled={editor.saving} className="space-y-5">
                <legend className="sr-only">Preferências de vagas</legend>
                <ListField id="desiredRoles" label="Cargos desejados" required maxItems={20} maxLength={100} value={editor.data.desiredRoles} onChange={(value) => change('desiredRoles', value)} />
                <ListField id="desiredSkills" label="Habilidades desejadas" maxItems={50} maxLength={80} value={editor.data.desiredSkills} onChange={(value) => change('desiredSkills', value)} />
                <SeniorityField value={editor.data.seniority} onChange={(value) => change('seniority', value)} />
                <fieldset><legend className="font-medium">Modelos de trabalho *</legend>
                    {Object.entries(WORK_MODEL_LABELS).map(([model, label]) => {
                        const value = model as Preferences['workModels'][number];
                        return <label key={value} className="mr-5 inline-flex items-center gap-2 py-2"><input type="checkbox"
                            checked={editor.data.workModels.includes(value)} onChange={(event) => editor.edit({ ...editor.data,
                                workModels: event.target.checked ? [...editor.data.workModels, value] : editor.data.workModels.filter((item) => item !== value),
                            })} />{label}</label>;
                    })}
                </fieldset>
                <ListField id="locations" label="Localizações" maxItems={20} maxLength={120} value={editor.data.locations} onChange={(value) => change('locations', value)} />
                <p className="text-sm text-slate-600">Informe ao menos uma localização para vagas presenciais ou híbridas. Para vagas apenas remotas, a localização é opcional.</p>
                <button type="submit" className="rounded bg-blue-800 px-5 py-2 text-white disabled:opacity-60">{editor.saving ? 'Salvando…' : 'Salvar preferências'}</button>
            </fieldset></form>}
        </>}
    </main>;
}
