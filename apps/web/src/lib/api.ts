const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:4000/api";

type SuccessResponse<T> = { success: true; data: T };
type ErrorResponse = { success: false; error: { code: string; message: string; details?: unknown } };
type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const tenantId = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  if (tenantId && path !== "/auth/login" && path !== "/auth/register") {
    headers["X-Tenant-Id"] = tenantId;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  let body: any;
  try {
    body = await res.json();
  } catch {
    body = {};
  }

  if (!res.ok) {
    return {
      success: false,
      error: body.error || { code: "BAD_REQUEST", message: `Request failed with status ${res.status}` },
    };
  }

  return body as SuccessResponse<T>;
}

export function isSuccessResponse<T>(response: unknown): response is SuccessResponse<T> {
  return typeof (response as { success?: unknown }).success === "boolean" && (response as { success: unknown }).success === true;
}

export const api = {
  get: <T = unknown>(path: string) => request<T>(path),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function setTenantId(tenantId: string) {
  localStorage.setItem("tenantId", tenantId);
}

export function getTenantId(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
}

export function clearTenantId() {
  localStorage.removeItem("tenantId");
}

export default api;