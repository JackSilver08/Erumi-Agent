export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type ApiMessage = {
  id: string
  role: ChatRole
  content: string
  status: string
  model_id?: string | null
  created_at: string
  completed_at?: string | null
}

export type Conversation = {
  id: string
  title: string
  status: string
  created_at: string
  updated_at?: string | null
}

export type ConversationDetail = Conversation & {
  messages: ApiMessage[]
}

export type LibraryFile = {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  preview: string
  created_at: string
  status: string
}

export type ScheduleItem = {
  id: string
  title: string
  frequency: string
  prompt: string
  category: string
  status: 'active' | 'paused'
  created_at: string
  last_run?: string | null
  last_result?: string | null
}

export type AuthUser = {
  id: string
  email: string
  display_name: string
  role: string
  created_at?: string
}

export type AuthResponse = {
  access_token: string
  token_type: string
  user: AuthUser
}

export function getToken(): string | null {
  return localStorage.getItem('erumi_token')
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem('erumi_token', token)
  } else {
    localStorage.removeItem('erumi_token')
  }
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const token = getToken()
  const customHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  }

  const response = await fetch(input, {
    ...init,
    headers: customHeaders,
  })

  if (!response.ok) {
    if (response.status === 401) {
      // Token might be invalid or expired
      const errorMsg = await response.text()
      throw new Error(errorMsg || 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
    }
    const body = await response.text()
    throw new Error(body || `Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

// Authentication APIs
export function loginApi(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function registerApi(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResponse> {
  return request<AuthResponse>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name: displayName }),
  })
}

export function getMeApi(): Promise<AuthUser> {
  return request<AuthUser>('/api/v1/auth/me')
}

export function updateProfileApi(data: {
  display_name?: string
  current_password?: string
  new_password?: string
}): Promise<AuthUser> {
  return request<AuthUser>('/api/v1/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function logoutApi(): Promise<void> {
  setToken(null)
}

// Conversation APIs
export function listConversations(): Promise<Conversation[]> {
  return request<Conversation[]>('/api/v1/chats')
}

export function getConversation(id: string): Promise<ConversationDetail> {
  return request<ConversationDetail>(`/api/v1/chats/${id}`)
}

export function createConversation(title = 'New chat'): Promise<ConversationDetail> {
  return request<ConversationDetail>('/api/v1/chats', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export function updateConversationTitle(id: string, title: string): Promise<Conversation> {
  return request<Conversation>(`/api/v1/chats/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

export async function deleteConversation(id: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`/api/v1/chats/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete chat: ${res.status}`)
  }
}

// File / Library APIs
export async function listFiles(): Promise<LibraryFile[]> {
  const res = await request<{ items: LibraryFile[] }>('/api/v1/files')
  return res.items || []
}

export async function uploadFile(file: File): Promise<LibraryFile> {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch('/api/v1/files', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })

  if (!res.ok) {
    throw new Error(`Failed to upload file: ${res.status}`)
  }

  return res.json() as Promise<LibraryFile>
}

export async function deleteFile(id: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`/api/v1/files/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete file: ${res.status}`)
  }
}

// Schedule APIs
export function listSchedules(): Promise<ScheduleItem[]> {
  return request<ScheduleItem[]>('/api/v1/schedules')
}

export function createSchedule(data: {
  title: string
  frequency: string
  prompt: string
  category: string
}): Promise<ScheduleItem> {
  return request<ScheduleItem>('/api/v1/schedules', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function toggleSchedule(id: string): Promise<ScheduleItem> {
  return request<ScheduleItem>(`/api/v1/schedules/${id}/toggle`, {
    method: 'PATCH',
  })
}

export function runScheduleNow(id: string): Promise<{ status: string; result: string }> {
  return request<{ status: string; result: string }>(`/api/v1/schedules/${id}/run`, {
    method: 'POST',
  })
}

export async function deleteSchedule(id: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`/api/v1/schedules/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete schedule: ${res.status}`)
  }
}
