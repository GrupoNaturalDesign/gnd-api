import type { RequestInit, Response } from 'undici-types';

export type FetchRequestInit = RequestInit;
export type FetchResponse = Response;
export type FetchFn = (
  input: string | URL | import('undici-types').Request,
  init?: FetchRequestInit
) => Promise<FetchResponse>;
