export interface AdminSeedRepository {
    // Promove sem trocar a senha e revoga sessões na elevação de privilégio.
    upsertAdmin(input: { email: string; passwordHash: string }): Promise<void>;
}
