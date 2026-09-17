export interface RecipeFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type RecipeFetch = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<RecipeFetchResponse>;

export class RecipeHttp {
  static async readJson(
    fetchImpl: RecipeFetch,
    url: string,
    options: { timeoutMs?: number } = {},
  ): Promise<{ status: number; body: unknown }> {
    const timeoutMs = options.timeoutMs;
    const response = await fetchImpl(url, timeoutMs === undefined
      ? {}
      : { signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        throw new Error(`Recipe catalog returned non-JSON from ${url}`);
      }
    }
    return { status: response.status, body };
  }
}
