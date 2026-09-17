export interface JupiterFetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type JupiterFetch = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<JupiterFetchResponse>;

export class JupiterHttp {
  static headers(apiKey?: string): Record<string, string> {
    if (!apiKey) return {};
    return { "x-api-key": apiKey };
  }

  static async readJson(
    fetchImpl: JupiterFetch,
    url: string,
    apiKey?: string,
  ): Promise<{ status: number; body: unknown }> {
    const response = await fetchImpl(url, {
      headers: JupiterHttp.headers(apiKey),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        throw new Error(`Jupiter returned non-JSON from ${url}`);
      }
    }
    return { status: response.status, body };
  }

  static join(base: string, path: string, params?: URLSearchParams): string {
    const root = base.endsWith("/") ? base.slice(0, -1) : base;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    const query = params && [...params].length > 0 ? `?${params}` : "";
    return `${root}${suffix}${query}`;
  }
}
