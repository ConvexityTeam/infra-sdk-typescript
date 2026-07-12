import type { InfraClient } from "../client.js";

/** Base class every resource namespace (`client.wallet`, `client.tokenization`, `client.indexer`) extends. */
export abstract class APIResource {
  constructor(protected readonly client: InfraClient) {}
}
