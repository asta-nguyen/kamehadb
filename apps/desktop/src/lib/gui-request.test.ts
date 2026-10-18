import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelRequest } from '../../wailsjs/go/api/SqlService';
import { runGUIRequest } from './gui-request';

vi.mock('../../wailsjs/go/api/SqlService', () => ({ CancelRequest: vi.fn() }));

// Delayed binding responses exercise ownership races without pretending to
// measure driver interruption, which is covered by native Go fixtures.
function pending<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

describe('GUI request binding ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CancelRequest).mockResolvedValue(true);
  });

  it('executes nothing for an already aborted view', async () => {
    const controller = new AbortController();
    controller.abort();
    const invoke = vi.fn();
    await expect(runGUIRequest(invoke, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(invoke).not.toHaveBeenCalled();
    expect(CancelRequest).not.toHaveBeenCalled();
  });

  it('cancels only its ID and rejects a late successful response', async () => {
    const one = pending<number>(),
      two = pending<number>();
    const controller = new AbortController();
    const invoke = vi.fn(() => one.promise);
    const first = runGUIRequest(invoke, controller.signal, 'one');
    const second = runGUIRequest(() => two.promise, undefined, 'two');
    controller.abort();
    expect(CancelRequest).toHaveBeenCalledExactlyOnceWith('one');
    one.resolve(1);
    two.resolve(2);
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(await second).toBe(2);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('generates an ID and removes cancellation after settlement', async () => {
    const controller = new AbortController();
    const invoke = vi.fn(async () => 'result');
    expect(await runGUIRequest(invoke, controller.signal)).toBe('result');
    expect(invoke).toHaveBeenCalledWith(expect.any(String));
    controller.abort();
    expect(CancelRequest).not.toHaveBeenCalled();
  });

  it('never retries a failed, possibly executed command', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('connection lost after write');
    });
    await expect(runGUIRequest(invoke)).rejects.toThrow('connection lost after write');
    expect(invoke).toHaveBeenCalledOnce();
  });
});
