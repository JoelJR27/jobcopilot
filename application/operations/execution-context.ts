export interface ExecutionContext { signal: AbortSignal; deadline: number; check(): void }
export function executionContext(timeoutMs: number, parent?: AbortSignal) {
    const controller = new AbortController(); const deadline = Date.now() + timeoutMs;
    const abort = () => controller.abort(); parent?.addEventListener('abort', abort, { once: true });
    if (parent?.aborted) abort();
    const timer = setTimeout(abort, timeoutMs);
    const context: ExecutionContext = { signal: controller.signal, deadline, check() { if (controller.signal.aborted || Date.now() >= deadline) { controller.abort(); throw new Error('OPERATION_TIMEOUT'); } } };
    return { context, close() { clearTimeout(timer); parent?.removeEventListener('abort', abort); } };
}
