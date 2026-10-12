import { prisma } from '@/infrastructure/database/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        await prisma.$queryRaw`SELECT 1`;

        return NextResponse.json({
            status: 'ok',
            database: 'up',
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return NextResponse.json(
            {
                status: 'error',
                database: 'down',
            },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
