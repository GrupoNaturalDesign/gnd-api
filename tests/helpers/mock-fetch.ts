import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';

interface MockResponse {
  status?: number;
  json?: unknown;
  text?: string;
}

export class MockFetch {
  private responses: MockResponse[];
  private callCount = 0;

  constructor(responses: MockResponse[] = []) {
    this.responses = responses;
  }

  setResponses(responses: MockResponse[]): void {
    this.responses = responses;
    this.callCount = 0;
  }

  get fetch() {
    return async (): Promise<Response> => {
      const idx = Math.min(this.callCount, this.responses.length - 1);
      const resp = this.responses[idx] ?? { status: 500 };
      this.callCount++;
      return new Response(
        resp.json != null ? JSON.stringify(resp.json) : (resp.text ?? '{}'),
        { status: resp.status ?? 200, headers: { 'Content-Type': 'application/json' } }
      );
    };
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
  }
}

export function resetGlobalFetch(): void {
  delete (globalThis as Record<string, unknown>).fetch;
}

let mockFetchInstance: MockFetch | null = null;

export function setGlobalMockFetch(mock: MockFetch): void {
  mockFetchInstance = mock;
  (globalThis as Record<string, unknown>).fetch = mock.fetch;
}

export function getMockFetch(): MockFetch {
  if (!mockFetchInstance) {
    mockFetchInstance = new MockFetch();
    (globalThis as Record<string, unknown>).fetch = mockFetchInstance.fetch;
  }
  return mockFetchInstance;
}