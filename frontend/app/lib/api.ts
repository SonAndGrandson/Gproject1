export interface Monitor {
  id: number;
  url: string;
  interval_seconds: number;
  is_active: boolean;
}

export interface CheckResult {
  id: number;
  monitor_id: number;
  status_code: number | null;
  is_up: boolean;
  response_time_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/backend${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const data: unknown = await response.json();
      if (typeof data === "object" && data !== null && "detail" in data) {
        const message = (data as { detail: unknown }).detail;
        detail = typeof message === "string" ? message : JSON.stringify(message);
      }
    } catch {
    }
    throw new Error(detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getMonitors(): Promise<Monitor[]> {
  return request<Monitor[]>("/monitors");
}

export async function getMonitorChecks(id: number): Promise<CheckResult[]> {
  return request<CheckResult[]>(`/monitors/${id}/checks?limit=100`);
}

export async function createMonitor(data: {
  url: string;
  interval_seconds: number;
  is_active: boolean;
}): Promise<Monitor> {
  return request<Monitor>("/monitors", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateMonitorUrl(id: number, url: string): Promise<Monitor> {
  return request<Monitor>(`/monitors/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ url }),
  });
}

export async function deleteMonitor(id: number): Promise<void> {
  return request<void>(`/monitors/${id}`, { method: "DELETE" });
}
