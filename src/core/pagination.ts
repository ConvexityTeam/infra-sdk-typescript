/**
 * The Infra API uses three different pagination envelopes depending on the service
 * (see the Conventions doc). {@link Page} normalizes all three into one ergonomic type so
 * callers can iterate any list endpoint the same way:
 *
 * ```ts
 * const page = await client.tokenization.listTokens();
 * for await (const token of page) {
 *   console.log(token.ticker);
 * }
 *
 * // or, page by page:
 * let page = await client.wallet.getTransactionHistory();
 * while (true) {
 *   for (const tx of page.data) handle(tx);
 *   if (!page.hasNextPage()) break;
 *   page = await page.getNextPage();
 * }
 * ```
 */
export class Page<T> implements AsyncIterable<T> {
  readonly data: readonly T[];
  private readonly nextParams: Record<string, unknown> | null;
  private readonly fetchNext: ((params: Record<string, unknown>) => Promise<Page<T>>) | null;

  constructor(opts: {
    data: readonly T[];
    nextParams: Record<string, unknown> | null;
    fetchNext: ((params: Record<string, unknown>) => Promise<Page<T>>) | null;
  }) {
    this.data = opts.data;
    this.nextParams = opts.nextParams;
    this.fetchNext = opts.fetchNext;
  }

  hasNextPage(): boolean {
    return this.nextParams !== null && this.fetchNext !== null;
  }

  async getNextPage(): Promise<Page<T>> {
    if (!this.fetchNext || !this.nextParams) {
      throw new Error("This is the last page — check hasNextPage() before calling getNextPage().");
    }
    return this.fetchNext(this.nextParams);
  }

  /** Walks every page starting with this one, yielding each `Page<T>` in turn. */
  async *iterPages(): AsyncGenerator<Page<T>, void, void> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- `page` walks forward each iteration; `this` is just the starting value.
    let page: Page<T> = this;
    yield page;
    while (page.hasNextPage()) {
      page = await page.getNextPage();
      yield page;
    }
  }

  /** Yields every item across all pages, fetching subsequent pages lazily as iteration proceeds. */
  async *[Symbol.asyncIterator](): AsyncGenerator<T, void, void> {
    for await (const page of this.iterPages()) {
      yield* page.data;
    }
  }

  /** Eagerly fetches every remaining page and returns all items as a single array. Use with caution on large collections. */
  async toArray(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) {
      items.push(item);
    }
    return items;
  }
}

/** Raw shape returned by limit/offset endpoints (currently: Wallet transaction history). */
export interface OffsetPaginatedResponse<T> {
  items: readonly T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}

export function pageFromOffsetResponse<T>(
  raw: OffsetPaginatedResponse<T>,
  fetchNext: (params: Record<string, unknown>) => Promise<Page<T>>,
): Page<T> {
  const hasNext = raw.pagination.hasMore && raw.pagination.nextOffset !== null;
  return new Page({
    data: raw.items,
    nextParams: hasNext ? { offset: raw.pagination.nextOffset, limit: raw.pagination.limit } : null,
    fetchNext: hasNext ? fetchNext : null,
  });
}

/** Raw shape returned by page/pageSize endpoints with inline totals (currently: Tokenization). */
export interface FlatPaginatedResponse<T> {
  items: readonly T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageFromFlatResponse<T>(
  raw: FlatPaginatedResponse<T>,
  fetchNext: (params: Record<string, unknown>) => Promise<Page<T>>,
): Page<T> {
  const itemsSeenSoFar = (raw.page - 1) * raw.pageSize + raw.items.length;
  const hasNext = itemsSeenSoFar < raw.total;
  return new Page({
    data: raw.items,
    nextParams: hasNext ? { page: raw.page + 1, pageSize: raw.pageSize } : null,
    fetchNext: hasNext ? fetchNext : null,
  });
}

/** Raw shape returned by page/limit endpoints with a `meta` block (currently: Indexer). */
export interface MetaPaginatedResponse<T> {
  data: readonly T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function pageFromMetaResponse<T>(
  raw: MetaPaginatedResponse<T>,
  fetchNext: (params: Record<string, unknown>) => Promise<Page<T>>,
): Page<T> {
  const hasNext = raw.meta.page < raw.meta.totalPages;
  return new Page({
    data: raw.data,
    nextParams: hasNext ? { page: raw.meta.page + 1, limit: raw.meta.limit } : null,
    fetchNext: hasNext ? fetchNext : null,
  });
}
