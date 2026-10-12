export function fold(value: string): string {
    return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
const cities = ['sao paulo', 'rio de janeiro', 'campinas', 'belo horizonte', 'curitiba', 'porto alegre', 'recife', 'fortaleza', 'salvador', 'brasilia', 'florianopolis', 'manaus', 'goiania', 'vitoria', 'natal', 'joao pessoa', 'cuiaba', 'maceio', 'aracaju', 'teresina', 'palmas', 'belem', 'sao luis', 'porto velho', 'rio branco', 'boa vista', 'macapa'];
const states = ['acre', 'alagoas', 'amapa', 'amazonas', 'bahia', 'ceara', 'distrito federal', 'espirito santo', 'goias', 'maranhao', 'mato grosso', 'minas gerais', 'paraiba', 'parana', 'pernambuco', 'piaui', 'rondonia', 'roraima', 'santa catarina', 'sergipe', 'tocantins', 'rio grande do sul', 'rio grande do norte'];
// Evidência somente no campo de localização do provider, nunca em menções soltas na descrição.
export function brazilEligibility(job: { location?: string | null; workModel?: string | null }): { eligible: boolean; rank: number; label: string } {
    const location = fold(job.location ?? '');
    const remote = job.workModel === 'REMOTE' || /\b(remote|remoto|homeoffice)\b/.test(location);
    const brazil = /\b(brazil|brasil|br)\b/.test(location) || [...cities, ...states].some((place) => location === place || location.startsWith(place + ',') || location.startsWith(place + ' -'));
    if (brazil) return { eligible: true, rank: remote ? 1 : 0, label: remote ? 'Remoto compatível com Brasil' : 'Localização no Brasil' };
    if (remote && /\b(latam|latin america|america latina|worldwide|anywhere|global remote)\b/.test(location)) return { eligible: true, rank: 2, label: 'Remoto explicitamente LATAM/mundial' };
    return { eligible: false, rank: 3, label: 'Elegibilidade para Brasil não informada' };
}
