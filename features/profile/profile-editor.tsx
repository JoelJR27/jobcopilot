'use client';

import type { FormEvent } from 'react';
import { profileSchema } from '@/domain/profile/profile';
import { useAccountEditor } from '@/features/account/use-account-editor';
import { EditorNavigation, inputClass, ListField, SeniorityField, splitLines } from '@/features/account/editor-fields';

const initial = { headline: '', summary: '', skills: '', experiences: '', education: '', languages: '', roles: '', seniority: '' };
const fields = [
    { id: 'skills', label: 'Habilidades', maxItems: 50, maxLength: 80, required: true },
    { id: 'roles', label: 'Cargos que você exerce', maxItems: 20, maxLength: 100, required: true },
    { id: 'experiences', label: 'Experiências profissionais', maxItems: 20, maxLength: 1000 },
    { id: 'education', label: 'Formação', maxItems: 20, maxLength: 500 },
    { id: 'languages', label: 'Idiomas e níveis de domínio', maxItems: 20, maxLength: 80 },
] as const;

function decode(data: unknown): typeof initial {
    const profile = profileSchema.parse(data);
    return { ...profile, skills: profile.skills.join('\n'), experiences: profile.experiences.join('\n'),
        education: profile.education.join('\n'), languages: profile.languages.join('\n'), roles: profile.roles.join('\n') };
}

export default function ProfileEditor() {
    const editor = useAccountEditor('profile', initial, decode);
    function change(field: keyof typeof initial, value: string) { editor.edit({ ...editor.data, [field]: value }); }
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const result = profileSchema.safeParse({ ...editor.data,
            skills: splitLines(editor.data.skills), roles: splitLines(editor.data.roles), experiences: splitLines(editor.data.experiences),
            education: splitLines(editor.data.education), languages: splitLines(editor.data.languages),
        });
        if (!result.success) { editor.setError(result.error.issues[0].message); return; }
        await editor.save(result.data);
    }
    return <main lang="pt-BR" className="mx-auto max-w-2xl px-5 py-10 text-slate-900">
        <EditorNavigation /><h1 className="mb-2 text-3xl font-semibold">Meu perfil profissional</h1>
        <p className="mb-6 text-slate-600">Preencha seus dados profissionais para preparar suas recomendações. Campos com * são obrigatórios.</p>
        {editor.loading ? <p role="status">Carregando perfil…</p> : <>
            {editor.error && <div className="mb-4"><p role="alert" className="text-red-800">{editor.error}</p>
                <button type="button" onClick={editor.reload} disabled={editor.saving} className="mt-2 underline">Recarregar dados</button></div>}
            {editor.saved && <p role="status" className="mb-4 text-green-800">Perfil salvo com sucesso.</p>}
            {editor.ready && <form onSubmit={submit}><fieldset disabled={editor.saving} className="space-y-5">
                <legend className="sr-only">Dados profissionais</legend>
                <div><label htmlFor="headline" className="font-medium">Título profissional *</label>
                    <input id="headline" className={inputClass} required maxLength={160} value={editor.data.headline} onChange={(event) => change('headline', event.target.value)} /></div>
                <div><label htmlFor="summary" className="font-medium">Resumo profissional</label>
                    <textarea id="summary" className={inputClass} rows={4} maxLength={4000} value={editor.data.summary} onChange={(event) => change('summary', event.target.value)} /></div>
                {fields.map((field) => <ListField key={field.id} {...field} value={editor.data[field.id]} onChange={(value) => change(field.id, value)} />)}
                <SeniorityField value={editor.data.seniority} onChange={(value) => change('seniority', value)} />
                <button type="submit" className="rounded bg-blue-800 px-5 py-2 text-white disabled:opacity-60">{editor.saving ? 'Salvando…' : 'Salvar perfil'}</button>
            </fieldset></form>}
        </>}
    </main>;
}
