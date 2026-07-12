import { describe, it, expect } from "vitest";
import {
  Page,
  pageFromOffsetResponse,
  pageFromFlatResponse,
  pageFromMetaResponse,
} from "../../src/core/pagination.js";

describe("pageFromOffsetResponse", () => {
  it("walks two pages and stops when hasMore is false", async () => {
    const fetchPage = (params: Record<string, unknown>): Promise<Page<{ id: number }>> => {
      if (params.offset === 1) {
        return Promise.resolve(
          pageFromOffsetResponse(
            { items: [{ id: 2 }], pagination: { total: 2, limit: 1, offset: 1, hasMore: false, nextOffset: null } },
            fetchPage,
          ),
        );
      }
      throw new Error("unexpected params");
    };

    const page = pageFromOffsetResponse(
      { items: [{ id: 1 }], pagination: { total: 2, limit: 1, offset: 0, hasMore: true, nextOffset: 1 } },
      fetchPage,
    );

    expect(page.hasNextPage()).toBe(true);
    const all: number[] = [];
    for await (const item of page) all.push(item.id);
    expect(all).toEqual([1, 2]);
  });

  it("reports no next page when hasMore is false", () => {
    const page = pageFromOffsetResponse<{ id: number }>(
      { items: [{ id: 1 }], pagination: { total: 1, limit: 20, offset: 0, hasMore: false, nextOffset: null } },
      () => {
        throw new Error("should not be called");
      },
    );
    expect(page.hasNextPage()).toBe(false);
  });
});

describe("pageFromFlatResponse", () => {
  it("computes hasNextPage from cumulative items seen vs total", () => {
    const page = pageFromFlatResponse<{ id: number }>(
      { items: [{ id: 1 }, { id: 2 }], total: 5, page: 1, pageSize: 2 },
      () => {
        throw new Error("not reached");
      },
    );
    expect(page.hasNextPage()).toBe(true);
  });

  it("reports no next page once every item has been seen", () => {
    const page = pageFromFlatResponse<{ id: number }>(
      { items: [{ id: 5 }], total: 5, page: 3, pageSize: 2 },
      () => {
        throw new Error("not reached");
      },
    );
    expect(page.hasNextPage()).toBe(false);
  });

  it("toArray collects every item across pages", async () => {
    const fetchPage = (params: Record<string, unknown>): Promise<Page<{ id: number }>> => {
      expect(params).toEqual({ page: 2, pageSize: 2 });
      return Promise.resolve(
        pageFromFlatResponse({ items: [{ id: 3 }], total: 3, page: 2, pageSize: 2 }, fetchPage),
      );
    };
    const page = pageFromFlatResponse({ items: [{ id: 1 }, { id: 2 }], total: 3, page: 1, pageSize: 2 }, fetchPage);
    await expect(page.toArray()).resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });
});

describe("pageFromMetaResponse", () => {
  it("computes hasNextPage from page vs totalPages", () => {
    const page = pageFromMetaResponse<{ id: number }>(
      { data: [{ id: 1 }], meta: { total: 2, page: 1, limit: 1, totalPages: 2 } },
      () => {
        throw new Error("not reached");
      },
    );
    expect(page.hasNextPage()).toBe(true);
  });

  it("reports no next page on the last page", () => {
    const page = pageFromMetaResponse<{ id: number }>(
      { data: [{ id: 2 }], meta: { total: 2, page: 2, limit: 1, totalPages: 2 } },
      () => {
        throw new Error("not reached");
      },
    );
    expect(page.hasNextPage()).toBe(false);
  });
});

describe("Page", () => {
  it("throws a clear error when getNextPage is called without a next page", async () => {
    const page = new Page<number>({ data: [1], nextParams: null, fetchNext: null });
    await expect(page.getNextPage()).rejects.toThrow(/last page/);
  });
});
