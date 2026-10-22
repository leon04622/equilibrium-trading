/**
 * Race a promise against a timer. The original work is not cancelled;
 * callers must attach their own .catch() so a late failure cannot crash the process.
 */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => void,
): Promise<{ timedOut: boolean; value?: T }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<{ timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), ms);
    });
    const finished = work.then((value) => ({ timedOut: false as const, value }));
    const result = await Promise.race([finished, timeout]);
    if (result.timedOut) {
      onTimeout();
      return { timedOut: true };
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
