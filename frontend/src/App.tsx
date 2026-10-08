import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit2,
  Eye,
  FileText,
  Folder,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  Paperclip,
  Play,
  Plus,
  Send,
  Settings,
  Shield,
  Square,
  Trash2,
  Upload,
  UserCircle,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { create } from 'zustand'

import { AuthScreen } from './components/AuthScreen'
import {
  createConversation,
  createSchedule,
  deleteConversation,
  deleteFile,
  deleteSchedule,
  getConversation,
  getMeApi,
  getToken,
  listFiles,
  listConversations,
  listSchedules,
  logoutApi,
  runScheduleNow,
  setToken,
  toggleSchedule,
  updateConversationTitle,
  updateProfileApi,
  uploadFile,
} from './lib/api'
import type {
  AuthUser,
  Conversation,
  LibraryFile,
  ScheduleItem,
} from './lib/api'

type Message = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status?: 'streaming' | 'completed' | 'failed'
}

type ConversationState = {
  messages: Message[]
  isStreaming: boolean
  addMessage: (message: Message) => void
  updateMessage: (id: string, content: string, status?: Message['status']) => void
  setMessages: (messages: Message[]) => void
  setStreaming: (value: boolean) => void
}

const useConversation = create<ConversationState>((set) => ({
  messages: [],
  isStreaming: false,
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, content, status) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === id ? { ...message, content, status } : message,
      ),
    })),
  setMessages: (messages) => set({ messages }),
  setStreaming: (value) => set({ isStreaming: value }),
}))

function titleForMessage(content: string) {
  const normalized = content.trim().replace(/\s+/g, ' ')
  return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function App() {
  const {
    messages,
    isStreaming,
    addMessage,
    updateMessage,
    setMessages,
    setStreaming,
  } = useConversation()

  // Authentication State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isGuest, setIsGuest] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)

  // App Core States
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Layout & Navigation States
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<'schedule' | 'library' | 'settings' | null>(null)
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)
  const [historySearch, setHistorySearch] = useState('')

  // Attachment states (selected documents/images for the active prompt)
  const [attachedFiles, setAttachedFiles] = useState<LibraryFile[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)

  // Dynamic Library & Schedule Data
  const [libraryFiles, setLibraryFiles] = useState<LibraryFile[]>([])
  const [schedules, setSchedules] = useState<ScheduleItem[]>([])
  const [previewFile, setPreviewFile] = useState<LibraryFile | null>(null)

  // Schedule creation form states
  const [newScheduleTitle, setNewScheduleTitle] = useState('')
  const [newScheduleFreq, setNewScheduleFreq] = useState('Mỗi ngày lúc 08:00 sáng')
  const [newSchedulePrompt, setNewSchedulePrompt] = useState('')
  const [newScheduleCategory, setNewScheduleCategory] = useState('Báo cáo')
  const [showCreateScheduleForm, setShowCreateScheduleForm] = useState(false)

  // Settings & Profile
  const [usernameInput, setUsernameInput] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('erumi_model') || 'erumi-auto')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('erumi_api_key') || '')
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingChatTitle, setEditingChatTitle] = useState('')

  // Refs
  const abortRef = useRef<AbortController | null>(null)
  const initializedRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const attachmentRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const canSubmit = (input.trim().length > 0 || attachedFiles.length > 0) && !isStreaming && !loading

  function showToast(msg: string) {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3200)
  }

  // Check auth session on startup
  useEffect(() => {
    async function checkAuth() {
      const token = getToken()
      if (token) {
        try {
          const user = await getMeApi()
          setCurrentUser(user)
          setUsernameInput(user.display_name)
        } catch {
          setToken(null)
          setCurrentUser(null)
        }
      }
      setAuthChecking(false)
    }
    void checkAuth()
  }, [])

  // Load files and schedules dynamically
  async function loadLibraryFiles() {
    try {
      const files = await listFiles()
      setLibraryFiles(files)
    } catch {
      // Use fallback
    }
  }

  async function loadSchedulesList() {
    try {
      const items = await listSchedules()
      setSchedules(items)
    } catch {
      // Use fallback
    }
  }

  // Auto scroll to bottom
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Close attachment dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        attachmentRef.current &&
        !attachmentRef.current.contains(event.target as Node)
      ) {
        setShowAttachmentMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function selectConversation(id: string) {
    try {
      setError(null)
      const conversation = await getConversation(id)
      setActiveConversationId(id)
      setMessages(
        conversation.messages.map((message) => ({
          id: message.id,
          role:
            message.role === 'assistant' ||
            message.role === 'user' ||
            message.role === 'system'
              ? message.role
              : 'assistant',
          content: message.content,
          status:
            message.status === 'failed'
              ? 'failed'
              : message.status === 'streaming'
                ? 'streaming'
                : 'completed',
        })),
      )
      setMobileSidebarOpen(false)
      window.requestAnimationFrame(() => {
        if (inputRef.current) inputRef.current.focus()
        if (textareaRef.current) textareaRef.current.focus()
      })
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể mở đoạn chat này.',
      )
    }
  }

  async function refreshConversations() {
    try {
      const items = await listConversations()
      setConversations(items)
      return items
    } catch {
      return []
    }
  }

  async function initializeApp() {
    try {
      setLoading(true)
      setError(null)
      const items = await refreshConversations()
      await loadLibraryFiles()
      await loadSchedulesList()

      if (items.length > 0) {
        await selectConversation(items[0].id)
      } else {
        const created = await createConversation()
        setConversations([created])
        setActiveConversationId(created.id)
        setMessages([])
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể khởi động Erumi.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authChecking && (currentUser || isGuest) && !initializedRef.current) {
      initializedRef.current = true
      void initializeApp()
    }
  }, [authChecking, currentUser, isGuest])

  function handleAuthSuccess(user: AuthUser) {
    setCurrentUser(user)
    setUsernameInput(user.display_name)
    setIsGuest(false)
    initializedRef.current = false
    showToast(`Chào mừng ${user.display_name} trở lại!`)
  }

  function handleGuestAccess() {
    setIsGuest(true)
    setCurrentUser(null)
    setUsernameInput('Khách (Guest)')
    initializedRef.current = false
    showToast('Đang sử dụng chế độ Khách (Guest Demo)')
  }

  async function handleLogout() {
    if (!window.confirm('Bạn có chắc chắn muốn đăng xuất không?')) return
    await logoutApi()
    setCurrentUser(null)
    setIsGuest(false)
    initializedRef.current = false
    setMessages([])
    setConversations([])
    setActiveModal(null)
    showToast('Đã đăng xuất an toàn.')
  }

  async function handleNewChat() {
    try {
      const created = await createConversation()
      setConversations((items) => [created, ...items])
      setActiveConversationId(created.id)
      setMessages([])
      setInput('')
      setAttachedFiles([])
      setError(null)
      setMobileSidebarOpen(false)
      window.requestAnimationFrame(() => {
        if (inputRef.current) inputRef.current.focus()
        if (textareaRef.current) textareaRef.current.focus()
      })
      showToast('Đã tạo đoạn chat mới')
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tạo đoạn chat mới.',
      )
    }
  }

  async function handleDeleteChat(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Bạn có chắc muốn xóa đoạn chat này không?')) return

    try {
      await deleteConversation(id)
      const remaining = conversations.filter((c) => c.id !== id)
      setConversations(remaining)

      if (activeConversationId === id) {
        if (remaining.length > 0) {
          await selectConversation(remaining[0].id)
        } else {
          await handleNewChat()
        }
      }
      showToast('Đã xóa đoạn chat thành công')
    } catch {
      setError('Không thể xóa đoạn chat.')
    }
  }

  async function handleSaveChatTitle(id: string, e: React.MouseEvent | React.FormEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!editingChatTitle.trim()) {
      setEditingChatId(null)
      return
    }

    try {
      await updateConversationTitle(id, editingChatTitle.trim())
      setConversations((items) =>
        items.map((c) => (c.id === id ? { ...c, title: editingChatTitle.trim() } : c)),
      )
      setEditingChatId(null)
      showToast('Đã cập nhật tiêu đề đoạn chat')
    } catch {
      setError('Không thể đổi tên đoạn chat.')
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploadingFile(true)
      const uploaded = await uploadFile(file)
      setLibraryFiles((prev) => [uploaded, ...prev])
      setAttachedFiles((prev) => [...prev, uploaded])
      setShowAttachmentMenu(false)
      showToast(`Đã tải lên '${file.name}'`)
    } catch {
      setError('Không thể tải lên tệp tin.')
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeleteLibraryFile(id: string) {
    if (!window.confirm('Bạn có muốn xóa tài liệu này khỏi thư viện?')) return
    try {
      await deleteFile(id)
      setLibraryFiles((prev) => prev.filter((f) => f.id !== id))
      setAttachedFiles((prev) => prev.filter((f) => f.id !== id))
      showToast('Đã xóa tệp khỏi thư viện')
    } catch {
      setError('Không thể xóa tệp.')
    }
  }

  async function handleToggleScheduleItem(id: string) {
    try {
      const updated = await toggleSchedule(id)
      setSchedules((prev) => prev.map((s) => (s.id === id ? updated : s)))
      showToast(updated.status === 'active' ? 'Đã kích hoạt lịch trình' : 'Đã tạm dừng lịch trình')
    } catch {
      setError('Không thể cập nhật trạng thái lịch trình.')
    }
  }

  async function handleRunSchedule(id: string) {
    try {
      const res = await runScheduleNow(id)
      await loadSchedulesList()
      showToast(res.result || 'Đã thực thi lịch trình thành công')
    } catch {
      setError('Không thể thực thi lịch trình.')
    }
  }

  async function handleDeleteScheduleItem(id: string) {
    if (!window.confirm('Bạn có chắc muốn xóa lịch trình này?')) return
    try {
      await deleteSchedule(id)
      setSchedules((prev) => prev.filter((s) => s.id !== id))
      showToast('Đã xóa lịch trình')
    } catch {
      setError('Không thể xóa lịch trình.')
    }
  }

  async function handleCreateNewSchedule(e: FormEvent) {
    e.preventDefault()
    if (!newScheduleTitle.trim() || !newSchedulePrompt.trim()) return

    try {
      const created = await createSchedule({
        title: newScheduleTitle.trim(),
        frequency: newScheduleFreq,
        prompt: newSchedulePrompt.trim(),
        category: newScheduleCategory,
      })
      setSchedules((prev) => [created, ...prev])
      setNewScheduleTitle('')
      setNewSchedulePrompt('')
      setShowCreateScheduleForm(false)
      showToast('Đã tạo lịch trình mới thành công')
    } catch {
      setError('Không thể tạo lịch trình mới.')
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    try {
      if (currentUser) {
        const payload: { display_name?: string; current_password?: string; new_password?: string } = {}
        if (usernameInput.trim()) payload.display_name = usernameInput.trim()
        if (newPassword.trim()) {
          payload.current_password = currentPassword
          payload.new_password = newPassword.trim()
        }
        const updated = await updateProfileApi(payload)
        setCurrentUser(updated)
        setCurrentPassword('')
        setNewPassword('')
        showToast('Đã lưu thông tin tài khoản thành công')
      } else {
        localStorage.setItem('erumi_username', usernameInput.trim() || 'Username')
        showToast('Đã lưu tên hiển thị')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật hồ sơ.')
    }
  }

  function handleSaveModelSettings(model: string, key: string) {
    setSelectedModel(model)
    setApiKey(key)
    localStorage.setItem('erumi_model', model)
    localStorage.setItem('erumi_api_key', key)
    showToast('Đã cập nhật cài đặt mô hình AI')
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault()

    const rawPrompt = input.trim()
    if ((!rawPrompt && attachedFiles.length === 0) || isStreaming || !activeConversationId) return

    // Construct full prompt incorporating attached document context
    let fullPrompt = rawPrompt
    if (attachedFiles.length > 0) {
      const docsContext = attachedFiles
        .map((f) => `[Tài liệu đính kèm: "${f.filename}"\nNội dung: ${f.preview || '(Chưa có trích xuất text)'}]`)
        .join('\n\n')
      fullPrompt = rawPrompt
        ? `${rawPrompt}\n\n--- Dữ liệu đính kèm ---\n${docsContext}`
        : `Hãy phân tích tài liệu đính kèm:\n\n${docsContext}`
    }

    const userMessageId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()

    addMessage({
      id: userMessageId,
      role: 'user',
      content: rawPrompt || `[Đã gửi ${attachedFiles.length} tệp đính kèm]`,
      status: 'completed',
    })

    addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'streaming',
    })

    setConversations((items) =>
      items.map((conversation) =>
        conversation.id === activeConversationId
          ? { ...conversation, title: titleForMessage(rawPrompt || 'Tài liệu đính kèm') }
          : conversation,
      ),
    )

    setInput('')
    setAttachedFiles([])
    setShowAttachmentMenu(false)
    setStreaming(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = getToken()
      const response = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(apiKey ? { 'X-API-Key': apiKey } : {}),
        },
        body: JSON.stringify({
          conversation_id: activeConversationId,
          model: selectedModel,
          messages: [{ role: 'user', content: fullPrompt }],
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error('Erumi không thể kết nối tới dịch vụ trò chuyện.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let answer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const eventText of events) {
          const dataLine = eventText
            .split('\n')
            .find((line) => line.startsWith('data: '))

          if (!dataLine) continue

          const payload = JSON.parse(dataLine.slice(6)) as {
            type?: string
            content?: string
            message?: string
            conversation_id?: string
          }

          if (payload.type === 'metadata' && payload.conversation_id) {
            setActiveConversationId(payload.conversation_id)
          }

          if (payload.type === 'token') {
            answer += payload.content ?? ''
            updateMessage(assistantId, answer, 'streaming')
          }

          if (payload.type === 'error') {
            throw new Error(payload.message ?? 'Erumi không thể tạo câu trả lời.')
          }

          if (payload.type === 'done') {
            updateMessage(assistantId, answer, 'completed')
          }
        }
      }

      await refreshConversations()
    } catch (requestError) {
      if ((requestError as Error).name !== 'AbortError') {
        const message =
          requestError instanceof Error
            ? requestError.message
            : 'Erumi chưa thể phản hồi.'

        updateMessage(assistantId, message, 'failed')
        setError(message)
      }
    } finally {
      abortRef.current = null
      setStreaming(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  function stopStreaming() {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    showToast('Đã sao chép vào bộ nhớ tạm')
  }

  const emptyState = messages.length === 0 && !loading

  const filteredConversations = conversations.filter((c) =>
    (c.title || 'Đoạn chat mới').toLowerCase().includes(historySearch.toLowerCase()),
  )

  // Show Auth Screen if not logged in and not continuing as guest
  if (authChecking) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-white gap-3 text-slate-500">
        <Loader2 className="animate-spin text-[#145da0]" size={32} />
        <span className="text-sm font-medium">Đang kiểm tra phiên đăng nhập…</span>
      </div>
    )
  }

  if (!currentUser && !isGuest) {
    return <AuthScreen onSuccess={handleAuthSuccess} onGuestAccess={handleGuestAccess} />
  }

  const currentDisplayName = currentUser?.display_name || usernameInput || 'Username'

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-[#3f3f3f]">
      {/* Hidden File Input for uploading */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Mobile Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 lg:hidden transition-opacity duration-200 ${
          mobileSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMobileSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-60 bg-slate-900/90 text-white px-4 py-2.5 rounded-2xl shadow-2xl text-sm font-medium flex items-center gap-2 animate-fade-in backdrop-blur-sm border border-white/10">
          <Check size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================
          SIDEBAR: Khớp chính xác với hình 1.png và 2.png
          ======================================================== */}
      <aside
        className={`relative z-50 flex flex-col h-full bg-[#145da0] text-white transition-all duration-300 select-none shadow-xl lg:shadow-none ${
          mobileSidebarOpen
            ? 'fixed inset-y-0 left-0 w-[275px] translate-x-0'
            : 'fixed inset-y-0 left-0 -translate-x-full lg:static lg:translate-x-0'
        } ${sidebarCollapsed ? 'lg:w-[70px]' : 'lg:w-[275px]'}`}
      >
        {/* Toggle tab on right edge (nút mũi tên ở mép sidebar) */}
        <button
          type="button"
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="sidebar-toggle-tab hidden lg:flex"
          title={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
          aria-label={sidebarCollapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
        >
          {sidebarCollapsed ? (
            <ChevronRight size={13} strokeWidth={2.8} />
          ) : (
            <ChevronLeft size={13} strokeWidth={2.8} />
          )}
        </button>

        {/* Top Header & Brand */}
        <div className="flex flex-col pt-6 pb-2">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center justify-center gap-4 mb-2">
              <span className="text-2xl font-black italic tracking-wider">E</span>
            </div>
          ) : (
            <div className="px-7 mb-4 flex items-center justify-between">
              <h1 className="erumi-brand-title">ERUMI</h1>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="lg:hidden text-white/80 hover:text-white p-1"
                aria-label="Đóng thanh bên"
              >
                <X size={22} />
              </button>
            </div>
          )}

          {/* Navigation Items */}
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-3 px-2">
              <button
                type="button"
                onClick={() => void handleNewChat()}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all"
                title="Đoạn chat mới"
              >
                <Plus size={22} strokeWidth={2.4} />
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('schedule')}
                className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-white/15 text-white transition-all relative"
                title="Lịch trình"
              >
                <Clock size={20} strokeWidth={2.2} />
                {schedules.filter((s) => s.status === 'active').length > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-emerald-400 rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('library')}
                className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-white/15 text-white transition-all"
                title="Thư viện"
              >
                <Folder size={20} strokeWidth={2.2} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1 px-5">
              <button
                type="button"
                onClick={() => void handleNewChat()}
                className="sidebar-menu-btn"
              >
                <Plus size={22} strokeWidth={2.4} />
                <span>Đoạn chat mới</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('schedule')}
                className="sidebar-menu-btn justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <Clock size={21} strokeWidth={2.2} />
                  <span>Lịch trình</span>
                </div>
                {schedules.filter((s) => s.status === 'active').length > 0 && (
                  <span className="text-[11px] bg-white/20 text-white font-semibold px-2 py-0.5 rounded-full">
                    {schedules.filter((s) => s.status === 'active').length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('library')}
                className="sidebar-menu-btn justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <Folder size={21} strokeWidth={2.2} />
                  <span>Thư viện</span>
                </div>
                {libraryFiles.length > 0 && (
                  <span className="text-[11px] bg-white/20 text-white font-semibold px-2 py-0.5 rounded-full">
                    {libraryFiles.length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Solid Divider */}
        {!sidebarCollapsed && <div className="border-t border-white/70 mx-6 my-3" />}

        {/* Middle Section: Recent Chats inside Dashed Box */}
        <div className="flex-1 flex flex-col min-h-0 px-5 overflow-hidden">
          {!sidebarCollapsed ? (
            <>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-[14px] italic text-white/95 font-normal">Gần đây</span>
                {conversations.length > 3 && (
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      placeholder="Tìm..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="w-20 bg-white/10 text-white placeholder:text-white/60 text-[11px] rounded-lg px-2 py-0.5 outline-none focus:w-28 transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Dashed container matching 1.png & 2.png */}
              <div className="sidebar-history-container flex-1 min-h-[220px] flex flex-col overflow-hidden mb-2">
                {conversations.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-white/90 text-[15px] select-none text-center px-2">
                    Lịch sử chat
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-white/70 text-xs text-center px-2">
                    Không tìm thấy đoạn chat
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                    {filteredConversations.map((conversation) => {
                      const active = conversation.id === activeConversationId
                      const isEditing = editingChatId === conversation.id

                      return (
                        <div
                          key={conversation.id}
                          className={`sidebar-history-item group ${active ? 'active' : ''}`}
                          onClick={() => {
                            if (!isEditing) void selectConversation(conversation.id)
                          }}
                        >
                          {isEditing ? (
                            <form
                              onSubmit={(e) => void handleSaveChatTitle(conversation.id, e)}
                              className="flex items-center gap-1.5 w-full"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                autoFocus
                                type="text"
                                value={editingChatTitle}
                                onChange={(e) => setEditingChatTitle(e.target.value)}
                                className="w-full bg-white/20 text-white rounded px-1.5 py-0.5 text-xs outline-none border border-white/30"
                              />
                              <button type="submit" className="text-white hover:text-emerald-300 p-1">
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingChatId(null)}
                                className="text-white/70 hover:text-white p-1"
                              >
                                <X size={14} />
                              </button>
                            </form>
                          ) : (
                            <>
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <MessageCircle size={16} className="shrink-0 opacity-80" />
                                <span className="truncate">
                                  {conversation.title || 'Đoạn chat mới'}
                                </span>
                              </div>

                              {/* Hover actions: rename & delete */}
                              <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingChatId(conversation.id)
                                    setEditingChatTitle(conversation.title || '')
                                  }}
                                  className="p-1 text-white/70 hover:text-white rounded hover:bg-white/10"
                                  title="Đổi tên"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => void handleDeleteChat(conversation.id, e)}
                                  className="p-1 text-white/70 hover:text-red-300 rounded hover:bg-white/10"
                                  title="Xóa đoạn chat"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-70">
              <MessageCircle size={22} />
            </div>
          )}
        </div>

        {/* Solid Divider */}
        {!sidebarCollapsed && <div className="border-t border-white/70 mx-6 my-3" />}

        {/* Bottom User Profile */}
        <div className="p-4 pt-2">
          {sidebarCollapsed ? (
            <div
              onClick={() => setActiveModal('settings')}
              className="flex justify-center text-white cursor-pointer hover:opacity-90 transition-opacity"
              title={currentDisplayName}
            >
              <UserCircle size={32} strokeWidth={1.8} />
            </div>
          ) : (
            <div
              onClick={() => setActiveModal('settings')}
              className="flex items-center justify-between px-3 py-2 text-white cursor-pointer rounded-xl hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <UserCircle size={36} strokeWidth={1.8} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-medium tracking-wide truncate">{currentDisplayName}</p>
                  <p className="text-[11px] text-white/70 truncate">{currentUser?.email || 'Tài khoản'}</p>
                </div>
              </div>
              <Settings size={18} className="text-white/70 hover:text-white shrink-0 ml-1" />
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="relative flex flex-1 flex-col h-full min-w-0 bg-white overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-lg bg-[#145da0] text-white"
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>
          <div className="text-xl font-black italic text-[#145da0]">ERUMI</div>
          <button
            type="button"
            onClick={() => void handleNewChat()}
            className="p-2 rounded-lg bg-[#145da0] text-white"
            aria-label="Đoạn chat mới"
          >
            <Plus size={20} />
          </button>
        </header>

        {/* Floating Error Alert */}
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 max-w-lg w-[90%] bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-sm shadow-md flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 p-1"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* CONTENT SWITCH: EMPTY STATE (1.png) vs ACTIVE CHAT (2.png) */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="animate-spin text-[#145da0]" size={28} />
            <span className="text-sm">Erumi đang khởi động…</span>
          </div>
        ) : emptyState ? (
          /* ========================================================
             EMPTY STATE / TRANG CHỦ (Khớp 100% với phác thảo 1.png)
             ======================================================== */
          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
            {/* Mascot Robot */}
            <img
              src="/erumi-chatbot.png"
              alt="ERUMI Mascot"
              className="w-[125px] h-[125px] object-contain select-none mb-4 drop-shadow-sm transition-transform hover:scale-105 duration-200"
            />

            {/* Heading: ERUMI CÓ THỂ GIÚP GÌ CHO BẠN ? */}
            <h2 className="text-center font-extrabold text-[24px] sm:text-[32px] md:text-[38px] text-[#3f3f3f] tracking-tight uppercase max-w-3xl px-4 select-none mb-8">
              ERUMI CÓ THỂ GIÚP GÌ CHO BẠN ?
            </h2>

            {/* Centered Pill Search / Input Bar (Khớp 1.png) */}
            <div className="w-full max-w-[620px] px-2 relative" ref={attachmentRef}>
              {/* Attached file badges above pill input */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2 px-3">
                  {attachedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="inline-flex items-center gap-1.5 bg-[#145da0]/10 text-[#145da0] px-3 py-1 rounded-full text-xs font-semibold animate-fade-in"
                    >
                      <Paperclip size={13} />
                      <span className="truncate max-w-[160px]">{file.filename}</span>
                      <button
                        type="button"
                        onClick={() => setAttachedFiles((prev) => prev.filter((f) => f.id !== file.id))}
                        className="hover:text-red-500"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmit} className="w-full">
                <div className="erumi-pill-input">
                  {/* Left '+' button */}
                  <button
                    type="button"
                    onClick={() => setShowAttachmentMenu((v) => !v)}
                    className="pill-action-btn"
                    title="Thêm tùy chọn"
                  >
                    {uploadingFile ? <Loader2 size={22} className="animate-spin" /> : <Plus size={26} strokeWidth={2.4} />}
                  </button>

                  {/* Input field */}
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Hỏi Erumi"
                    className="flex-1 bg-transparent border-0 outline-none text-white text-[17px] font-medium placeholder:text-white/80 px-3 py-2"
                  />

                  {/* Right Send icon button */}
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="pill-action-btn"
                    title="Gửi tin nhắn"
                  >
                    <Send size={22} strokeWidth={2} />
                  </button>
                </div>
              </form>

              {/* Attachment Popup Menu */}
              {showAttachmentMenu && (
                <div className="absolute left-6 -top-36 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 w-56 text-[#373A3C] z-30 animate-fade-in">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    <Paperclip size={18} className="text-[#145da0]" />
                    <span>Đính kèm tệp tin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    <ImageIcon size={18} className="text-[#145da0]" />
                    <span>Tải ảnh lên</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal('schedule')
                      setShowAttachmentMenu(false)
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    <Calendar size={18} className="text-[#145da0]" />
                    <span>Lập lịch trình</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ========================================================
             ACTIVE CHAT STATE (Khớp 100% với phác thảo 2.png)
             ======================================================== */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Scrollable Message List */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-16 pt-8 pb-36">
              <div className="max-w-4xl mx-auto space-y-7">
                {messages.map((message) => {
                  const isUser = message.role === 'user'
                  return (
                    <div
                      key={message.id}
                      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in group`}
                    >
                      {isUser ? (
                        /* USER SPEECH BUBBLE WITH CURVED RIGHT TAIL (Khớp 2.png) */
                        <div className="relative max-w-[80%] sm:max-w-[70%]">
                          <div className="speech-bubble-user">
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                          {/* Curved tail pointing downwards-right matching 2.png */}
                          <svg
                            className="absolute -bottom-2 right-2 w-[18px] h-[15px] text-[#004aad] fill-current pointer-events-none"
                            viewBox="0 0 18 15"
                          >
                            <path d="M0 0 C6 1 12 5 18 15 C15 10 11 5 6 0 Z" />
                          </svg>

                          {/* Action copy button */}
                          <button
                            type="button"
                            onClick={() => copyToClipboard(message.content)}
                            className="absolute -top-3 -right-2 hidden group-hover:flex bg-slate-800 text-white p-1 rounded-full shadow-md text-xs hover:bg-slate-900"
                            title="Sao chép"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      ) : (
                        /* ASSISTANT SPEECH BUBBLE WITH CURVED LEFT TAIL + MASCOT (Khớp 2.png) */
                        <div className="flex items-start gap-3 max-w-[85%] sm:max-w-[75%]">
                          <img
                            src="/erumi-chatbot.png"
                            alt="ERUMI"
                            className="w-10 h-10 object-contain shrink-0 mt-1 select-none"
                          />
                          <div className="relative flex-1">
                            <div className="speech-bubble-assistant">
                              <div className="whitespace-pre-wrap leading-relaxed">
                                {message.content ||
                                  (message.status === 'streaming'
                                    ? 'Erumi đang suy nghĩ…'
                                    : '')}
                              </div>
                              {message.status === 'streaming' && (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-white/80">
                                  <Loader2 size={12} className="animate-spin" />
                                  <span>Đang phản hồi...</span>
                                </div>
                              )}
                            </div>
                            {/* Curved tail pointing downwards-left toward mascot matching 2.png */}
                            <svg
                              className="absolute -bottom-2 left-2 w-[18px] h-[15px] text-[#004aad] fill-current pointer-events-none"
                              viewBox="0 0 18 15"
                            >
                              <path d="M18 0 C12 1 6 5 0 15 C3 10 7 5 12 0 Z" />
                            </svg>

                            {/* Action copy button */}
                            {message.content && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(message.content)}
                                className="absolute -top-3 -right-2 hidden group-hover:flex bg-slate-800 text-white p-1 rounded-full shadow-md text-xs hover:bg-slate-900"
                                title="Sao chép"
                              >
                                <Copy size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Pinned Bottom Input Bar (Khớp 2.png) */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-6 pb-6 px-4 flex justify-center">
              <div className="w-full max-w-3xl relative" ref={attachmentRef}>
                {/* Attached file badges above input pill */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2 px-3">
                    {attachedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="inline-flex items-center gap-1.5 bg-[#145da0]/10 text-[#145da0] px-3 py-1 rounded-full text-xs font-semibold animate-fade-in"
                      >
                        <Paperclip size={13} />
                        <span className="truncate max-w-[180px]">{file.filename}</span>
                        <button
                          type="button"
                          onClick={() => setAttachedFiles((prev) => prev.filter((f) => f.id !== file.id))}
                          className="hover:text-red-500"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="w-full">
                  <div className="erumi-pill-input">
                    {/* Left '+' button */}
                    <button
                      type="button"
                      onClick={() => setShowAttachmentMenu((v) => !v)}
                      className="pill-action-btn"
                      title="Thêm tùy chọn"
                    >
                      {uploadingFile ? <Loader2 size={22} className="animate-spin" /> : <Plus size={26} strokeWidth={2.4} />}
                    </button>

                    {/* Auto-growing Textarea or Input */}
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      placeholder="Hỏi Erumi"
                      className="flex-1 bg-transparent border-0 outline-none text-white text-[17px] font-medium placeholder:text-white/80 px-3 py-2 resize-none max-h-32"
                    />

                    {/* Right Action Button (Send or Stop) */}
                    {isStreaming ? (
                      <button
                        type="button"
                        onClick={stopStreaming}
                        className="pill-action-btn"
                        title="Dừng phản hồi"
                      >
                        <Square size={20} fill="currentColor" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!canSubmit}
                        className="pill-action-btn"
                        title="Gửi"
                      >
                        <Send size={22} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </form>

                {/* Attachment Menu in Chat View */}
                {showAttachmentMenu && (
                  <div className="absolute left-6 -top-36 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 w-56 text-[#373A3C] z-30 animate-fade-in">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      <Paperclip size={18} className="text-[#145da0]" />
                      <span>Đính kèm tệp tin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      <ImageIcon size={18} className="text-[#145da0]" />
                      <span>Tải ảnh lên</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal('schedule')
                        setShowAttachmentMenu(false)
                      }}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      <Calendar size={18} className="text-[#145da0]" />
                      <span>Lập lịch trình</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================
          MODAL: LỊCH TRÌNH (SCHEDULE) - HOÀN TOÀN ĐỘNG
          ======================================================== */}
      {activeModal === 'schedule' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl p-6 border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#145da0]/10 text-[#145da0] flex items-center justify-center">
                  <Clock size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Lịch trình Erumi</h3>
                  <p className="text-xs text-slate-500">Tác vụ tự động hóa & Nhắc nhở định kỳ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  setShowCreateScheduleForm(false)
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* List or Form Toggle */}
            <div className="flex-1 overflow-y-auto py-5 pr-1">
              {showCreateScheduleForm ? (
                /* Form tạo lịch trình mới */
                <form onSubmit={handleCreateNewSchedule} className="space-y-4">
                  <h4 className="text-sm font-bold text-slate-700">Tạo lịch trình mới</h4>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Tên lịch trình
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Tóm tắt tin tức AI mỗi sáng"
                      value={newScheduleTitle}
                      onChange={(e) => setNewScheduleTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#145da0]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Tần suất / Thời gian
                    </label>
                    <select
                      value={newScheduleFreq}
                      onChange={(e) => setNewScheduleFreq(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#145da0] bg-white"
                    >
                      <option value="Mỗi ngày lúc 08:00 sáng">Mỗi ngày lúc 08:00 sáng</option>
                      <option value="Thứ 2 & Thứ 6 lúc 17:00">Thứ 2 & Thứ 6 lúc 17:00</option>
                      <option value="Mỗi thứ 2 hàng tuần lúc 09:00">Mỗi thứ 2 hàng tuần lúc 09:00</option>
                      <option value="Mỗi giờ">Mỗi giờ</option>
                      <option value="Hàng ngày lúc 20:00 tối">Hàng ngày lúc 20:00 tối</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Nội dung tác vụ Erumi cần làm
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Mô tả công việc hoặc câu lệnh để Erumi tự động thực thi..."
                      value={newSchedulePrompt}
                      onChange={(e) => setNewSchedulePrompt(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#145da0] resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Phân loại
                    </label>
                    <div className="flex gap-2">
                      {['Báo cáo', 'Tin tức', 'Nhắc nhở', 'Tự động'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setNewScheduleCategory(cat)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                            newScheduleCategory === cat
                              ? 'bg-[#145da0] text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowCreateScheduleForm(false)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-[#145da0] text-white text-sm font-semibold hover:bg-[#10528e]"
                    >
                      Lưu lịch trình
                    </button>
                  </div>
                </form>
              ) : (
                /* Danh sách lịch trình */
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Lịch trình đã thiết lập ({schedules.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCreateScheduleForm(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#145da0] hover:underline"
                    >
                      <Plus size={14} />
                      <span>Thêm lịch trình mới</span>
                    </button>
                  </div>

                  {schedules.map((schedule) => (
                    <div
                      key={schedule.id}
                      className="p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-[#145da0]/15 text-[#145da0]">
                            {schedule.category}
                          </span>
                          <h4 className="text-sm font-bold text-slate-800">{schedule.title}</h4>
                        </div>

                        {/* Status badge & Switch */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleToggleScheduleItem(schedule.id)}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                              schedule.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                            }`}
                          >
                            {schedule.status === 'active' ? '● Đang bật' : '○ Tạm dừng'}
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600">{schedule.prompt}</p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {schedule.frequency}
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleRunSchedule(schedule.id)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#145da0] hover:text-[#0f4a80] px-2 py-1 rounded-lg hover:bg-white"
                            title="Chạy thử ngay bây giờ"
                          >
                            <Play size={12} />
                            <span>Chạy ngay</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteScheduleItem(schedule.id)}
                            className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-white"
                            title="Xóa lịch trình"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  setShowCreateScheduleForm(false)
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: THƯ VIỆN (LIBRARY) - HOÀN TOÀN ĐỘNG
          ======================================================== */}
      {activeModal === 'library' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-6 border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#145da0]/10 text-[#145da0] flex items-center justify-center">
                  <Folder size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Thư viện tri thức</h3>
                  <p className="text-xs text-slate-500">Tài liệu, dữ liệu tham khảo và tệp đính kèm</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* Drag & Drop Upload Bar */}
            <div className="pt-4 pb-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-[#145da0] rounded-2xl p-4 text-center cursor-pointer bg-slate-50/70 hover:bg-[#145da0]/5 transition-all flex items-center justify-center gap-3"
              >
                <Upload size={20} className="text-[#145da0]" />
                <span className="text-xs font-semibold text-slate-700">
                  Nhấp để tải lên tệp mới (.docx, .pdf, .txt, .md, hình ảnh)
                </span>
              </div>
            </div>

            {/* Files List */}
            <div className="flex-1 overflow-y-auto py-2 space-y-3">
              {libraryFiles.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  Chưa có tài liệu nào trong thư viện. Hãy tải lên tệp đầu tiên!
                </div>
              ) : (
                libraryFiles.map((file) => (
                  <div
                    key={file.id}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 text-[#145da0]">
                        <FileText size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-slate-800 truncate">
                          {file.filename}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {formatBytes(file.size_bytes)} · {file.content_type}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setAttachedFiles((prev) =>
                            prev.some((f) => f.id === file.id) ? prev : [...prev, file],
                          )
                          setActiveModal(null)
                          showToast(`Đã đính kèm '${file.filename}' vào đoạn chat`)
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold bg-[#145da0] text-white px-3 py-1.5 rounded-xl hover:bg-[#10528e] transition-colors"
                      >
                        <Paperclip size={13} />
                        <span>Đính kèm chat</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-white border border-transparent hover:border-slate-200"
                        title="Xem trước"
                      >
                        <Eye size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDeleteLibraryFile(file.id)}
                        className="p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-white border border-transparent hover:border-slate-200"
                        title="Xóa tệp"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: XEM TRƯỚC TÀI LIỆU (PREVIEW FILE)
          ======================================================== */}
      {previewFile && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl p-6 border border-slate-100 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={20} className="text-[#145da0] shrink-0" />
                <h4 className="text-base font-bold text-slate-800 truncate">
                  {previewFile.filename}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              <pre className="text-xs font-mono bg-slate-50 p-4 rounded-2xl whitespace-pre-wrap text-slate-700 border border-slate-100">
                {previewFile.preview || 'Không có bản xem trước văn bản cho tệp này.'}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="px-5 py-2.5 rounded-xl bg-[#145da0] text-white text-sm font-semibold hover:bg-[#10528e]"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: CÀI ĐẶT & BẢO VỆ THÔNG TIN KHÁCH HÀNG (SETTINGS)
          ======================================================== */}
      {activeModal === 'settings' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-6 border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#145da0]/10 text-[#145da0] flex items-center justify-center">
                  <Settings size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Cài đặt Erumi</h3>
                  <p className="text-xs text-slate-500">Hồ sơ người dùng & Bảo mật thông tin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Customer Privacy & Security Badge */}
              <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-100 flex items-start gap-3">
                <Shield size={20} className="text-[#145da0] shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold text-[#145da0] block mb-0.5">
                    Bảo vệ quyền riêng tư & Dữ liệu
                  </span>
                  <span className="text-slate-600 leading-relaxed block">
                    {currentUser
                      ? `Tài khoản ${currentUser.email} được mã hóa độc lập. Dữ liệu hội thoại và tệp tin của bạn không bị chia sẻ.`
                      : 'Đang dùng phiên Khách. Hãy đăng ký tài khoản để dữ liệu được lưu trữ riêng biệt vĩnh viễn.'}
                  </span>
                </div>
              </div>

              {/* Profile Form */}
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên hiển thị (Username)
                  </label>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#145da0]"
                  />
                </div>

                {currentUser && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Email tài khoản
                    </label>
                    <input
                      type="text"
                      disabled
                      value={currentUser.email}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
                    />
                  </div>
                )}

                {currentUser && (
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <span className="block text-xs font-bold text-slate-700">Đổi mật khẩu</span>
                    <input
                      type="password"
                      placeholder="Mật khẩu hiện tại"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#145da0]"
                    />
                    <input
                      type="password"
                      placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#145da0]"
                    />
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    Lưu thông tin hồ sơ
                  </button>
                </div>
              </form>

              {/* AI Model Provider */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mô hình trí tuệ nhân tạo (AI Model)
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => handleSaveModelSettings(e.target.value, apiKey)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#145da0] bg-white"
                >
                  <option value="erumi-auto">Erumi Auto (Tự động thông minh - Khuyên dùng)</option>
                  <option value="qwen3:4b">Ollama Local (qwen3:4b / Llama3)</option>
                  <option value="agent-deep">Agent Deep (Nghiên cứu sâu & Tác vụ phức tạp)</option>
                </select>
              </div>

              {/* Stats overview */}
              <div className="pt-2 border-t border-slate-100">
                <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Thống kê hệ thống
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="block text-lg font-black text-[#145da0]">
                      {conversations.length}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">Cuộc hội thoại</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="block text-lg font-black text-[#145da0]">
                      {libraryFiles.length}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">Tài liệu</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="block text-lg font-black text-[#145da0]">
                      {schedules.length}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">Lịch trình</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Bottom: Logout & Close */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold transition-colors cursor-pointer"
              >
                <LogOut size={15} />
                <span>Đăng xuất</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-5 py-2.5 rounded-xl bg-[#145da0] text-white text-sm font-semibold hover:bg-[#10528e] transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
