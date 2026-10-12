'use client';
export default function JobsError({ reset }: { reset: () => void }) {
    return <main lang="pt-BR" className="p-8"><p role="alert">Não foi possível carregar vagas.</p><button type="button" onClick={reset}>Tentar novamente</button></main>;
}
