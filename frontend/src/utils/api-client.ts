/**
 * 统一 HTTP 请求封装
 *
 * NOTE: 所有后端 API 调用统一走此模块
 *       自动注入 JWT Token、处理错误、提供类型安全
 *       其他模块从此处导入 apiClient / getToken 即可
 */

/**
 * 后端 API 基础地址
 * NOTE: 开发环境默认 http://localhost:8000
 *       生产环境通过 VITE_API_BASE 环境变量注入（Render 后端 URL）
 */
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

/**
 * 获取 JWT Token
 * NOTE: 从 localStorage 中 kunlun_jwt_token 字段读取
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem('kunlun_jwt_token');
  } catch {
    return null;
  }
}

/**
 * 设置 JWT Token
 */
export function setToken(token: string): void {
  localStorage.setItem('kunlun_jwt_token', token);
}

/**
 * 清除 JWT Token
 */
export function clearToken(): void {
  localStorage.removeItem('kunlun_jwt_token');
}

/**
 * 构建带 Bearer Token 的 headers
 */
function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 统一的 API 响应错误
 */
export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`API Error ${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

/**
 * 解析响应，非 2xx 状态码抛出 ApiError
 */
async function handleResponse<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      // NOTE: FastAPI 422 验证错误的 detail 是对象数组 [{loc, msg, type}]
      // 需要特殊处理，否则直接 toString 会显示 [object Object]
      if (Array.isArray(body.detail)) {
        detail = body.detail
          .map((e: { loc?: string[]; msg?: string }) =>
            e.msg ? `${(e.loc ?? []).join('.')}: ${e.msg}` : JSON.stringify(e)
          )
          .join('; ');
      } else {
        detail = body.detail || body.message || detail;
      }
    } catch { /* 无法解析 JSON */ }
    throw new ApiError(resp.status, detail);
  }
  return resp.json() as Promise<T>;
}

/**
 * 统一 API 请求客户端
 *
 * NOTE: 自动注入 JWT Token，统一错误处理
 *       使用方式：apiClient.get<T>('/api/assets')
 */
export const apiClient = {
  /**
   * GET 请求
   */
  async get<T>(path: string): Promise<T> {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    return handleResponse<T>(resp);
  },

  /**
   * POST 请求（JSON body）
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(resp);
  },

  /**
   * POST 请求（FormData，用于文件上传）
   * NOTE: 不设 Content-Type，让浏览器自动设置 multipart/form-data boundary
   */
  async postForm<T>(path: string, formData: FormData): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const resp = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return handleResponse<T>(resp);
  },

  /**
   * PUT 请求
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(resp);
  },

  /**
   * DELETE 请求
   */
  async delete<T>(path: string): Promise<T> {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse<T>(resp);
  },

  /**
   * PATCH 请求（JSON body）
   */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(resp);
  },
};
