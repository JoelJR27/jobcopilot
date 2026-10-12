import Link from 'next/link';
import { SENIORITY_LABELS } from '@/shared/validation/professional-fields';

export const inputClass = 'mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-2 focus:outline-blue-700';

export function splitLines(value: string): string[] {
    return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function EditorNavigation() {
    return <nav aria-label="Dados profissionais" className="mb-6 flex gap-6 text-blue-800 underline">
        <Link href="/profile">Meu perfil</Link><Link href="/preferences">Preferências de vagas</Link>
    </nav>;
}

export function ListField(props: { id: string; label: string; value: string; onChange: (value: string) => void; maxItems: number; maxLength: number; required?: boolean }) {
    return <div>
        <label htmlFor={props.id} className="font-medium">{props.label}{props.required ? ' *' : ''}</label>
        <p id={`${props.id}-hint`} className="text-sm text-slate-600">Um item por linha. Até {props.maxItems} itens, {props.maxLength} caracteres por item.</p>
        <textarea id={props.id} aria-describedby={`${props.id}-hint`} className={inputClass} rows={3} required={props.required}
            maxLength={props.maxItems * (props.maxLength + 1)} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </div>;
}

export function SeniorityField(props: { value: string; onChange: (value: string) => void }) {
    return <div><label htmlFor="seniority" className="font-medium">Senioridade *</label>
        <select id="seniority" className={inputClass} required value={props.value} onChange={(event) => props.onChange(event.target.value)}>
            <option value="">Selecione</option>
            {Object.entries(SENIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
    </div>;
}
