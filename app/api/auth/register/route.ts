import { NextResponse } from 'next/server';
import { registerSchema } from '@/features/auth/schemas/register-schema';
import { makeRegisterUser } from '@/infrastructure/composition/auth';

export async function POST(request: Request) {
    const body: unknown = await request.json();

    const result = registerSchema.safeParse(body);

    if (!result.success) {
        return NextResponse.json(
            {
                message: 'Dados de cadastro inválidos.',
                errors: result.error.flatten().fieldErrors,
            },
            { status: 400 },
        );
    }

    try {
        const registerUser = makeRegisterUser();

        const user = await registerUser.execute(result.data);

        return NextResponse.json(
            {
                id: user.id,
                email: user.email,
            },
            { status: 201 },
        );
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === 'Usuário já cadastrado.'
        ) {
            return NextResponse.json(
                {
                    message: 'Não foi possível realizar o cadastro.',
                },
                { status: 409 },
            );
        }

        console.error(error);

        return NextResponse.json(
            {
                message: 'Ocorreu um erro ao realizar o cadastro.',
            },
            { status: 500 },
        );
    }
}