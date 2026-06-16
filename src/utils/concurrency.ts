/**
 * 并发控制工具 - 限制同时执行的异步任务数量
 * 替代 p-limit，无需安装额外依赖
 */

type AsyncFn<T> = () => Promise<T>;

export function createConcurrencyLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (queue.length > 0 && active < concurrency) {
      const run = queue.shift()!;
      run();
    }
  };

  return async function limit<T>(fn: AsyncFn<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      next();
    }
  };
}

/**
 * 带并发限制的 Promise.all
 * @param tasks 任务数组
 * @param limitFn 并发限制函数
 * @returns 所有任务结果
 */
export async function limitedAll<T>(
  tasks: AsyncFn<T>[],
  limitFn: <R>(fn: AsyncFn<R>) => Promise<R>
): Promise<T[]> {
  return Promise.all(tasks.map(task => limitFn(task)));
}
