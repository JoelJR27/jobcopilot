export const ARBEITNOW_SOURCE = {
    name: 'Arbeitnow',
    baseUrl: 'https://www.arbeitnow.com',
    endpoint: 'https://www.arbeitnow.com/api/job-board-api',
    jobHosts: ['www.arbeitnow.com', 'www.arbeitnow.co.uk', 'www.arbeitnow.fr', 'www.arbeitnow.ch'],
} as const;
export const CIANDT_SOURCE = { name: "CI&T / Lever", baseUrl: "https://jobs.lever.co/ciandt", endpoint: "https://api.lever.co/v0/postings/ciandt?mode=json" } as const;
export const SWILE_SOURCE = { name: "Swile / Lever", baseUrl: "https://jobs.lever.co/swile", endpoint: "https://api.lever.co/v0/postings/swile?mode=json" } as const;
export const LEVER_SOURCES = {
    ciandt: { ...CIANDT_SOURCE, boardToken: "ciandt", company: "CI&T" },
    swile: { ...SWILE_SOURCE, boardToken: "swile", company: "Swile" },
} as const;
