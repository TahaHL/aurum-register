export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw Error(
      "The desk cannot reach its server. Your inputs are still here; try again.",
    );
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (response.status === 429) {
    const retry = response.headers.get("Retry-After");
    const reset = response.headers
      .get("RateLimit")
      ?.match(/(?:reset=|t=)(\d+)/)?.[1];
    const delay =
      retry && /^\d+$/.test(retry)
        ? Number(retry)
        : retry && Number.isFinite(Date.parse(retry))
          ? Math.ceil((Date.parse(retry) - Date.now()) / 1000)
          : Number(reset || 5);
    const seconds = Math.max(1, Math.min(delay, 86400));
    throw new ApiError(
      `Too many requests. Retrying in ${seconds} seconds.`,
      429,
      seconds,
    );
  }
  if (!response.ok)
    throw new ApiError(
      body?.message || "Request failed. Please try again.",
      response.status,
    );
  if (body === null) throw Error("The server returned an unexpected response.");
  return body as T;
}
