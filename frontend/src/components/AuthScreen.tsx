import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  User as UserIcon,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'

import { loginApi, registerApi, setToken } from '../lib/api'
import type { AuthUser } from '../lib/api'

type AuthScreenProps = {
  onSuccess: (user: AuthUser) => void
  onGuestAccess: () => void
}

export function AuthScreen({ onSuccess, onGuestAccess }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (mode === 'register') {
      if (password.length < 6) {
        setError('Mật khẩu phải chứa ít nhất 6 ký tự.')
        return
      }
      if (password !== confirmPassword) {
        setError('Xác nhận mật khẩu không trùng khớp.')
        return
      }
      if (!displayName.trim()) {
        setError('Vui lòng nhập tên hiển thị.')
        return
      }
    }

    try {
      setLoading(true)
      if (mode === 'login') {
        const res = await loginApi(email, password)
        setToken(res.access_token)
        onSuccess(res.user)
      } else {
        const res = await registerApi(email, password, displayName)
        setToken(res.access_token)
        onSuccess(res.user)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Đã có lỗi xảy ra. Vui lòng kiểm tra lại thông tin.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-screen flex flex-col md:flex-row bg-white overflow-hidden select-none">
      {/* Left Column: Form */}
      <div className="w-full md:w-[46%] lg:w-[42%] xl:w-[40%] flex flex-col justify-center items-center px-6 sm:px-12 lg:px-16 py-10 bg-white relative z-10 min-h-screen">
        <div className="w-full max-w-[380px] flex flex-col justify-center animate-fade-in">
          {/* Mobile Mascot Header (visible only on small screens) */}
          <div className="md:hidden flex flex-col items-center mb-6">
            <div className="w-20 h-20 rounded-full bg-[#145da0] flex items-center justify-center p-2.5 shadow-md mb-2">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center p-2">
                <img
                  src="/erumi-chatbot.png"
                  alt="ERUMI"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
            <h1 className="text-2xl font-black italic tracking-wider text-[#145da0]">ERUMI</h1>
          </div>

          {/* Tab switch */}
          <div className="flex bg-[#f1f4f8] p-1.5 rounded-2xl mb-7">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setError(null)
              }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-[#145da0] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register')
                setError(null)
              }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-[#145da0] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Đăng ký mới
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-5 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium animate-fade-in flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-red-500 font-bold ml-2 hover:opacity-75"
              >
                ✕
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tên hiển thị (Username)
                </label>
                <div className="relative">
                  <UserIcon
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#145da0] focus:ring-2 focus:ring-[#145da0]/10 transition-all placeholder:text-slate-400 text-slate-800"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Địa chỉ Email
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="email"
                  required
                  placeholder="tenban@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#145da0] focus:ring-2 focus:ring-[#145da0]/10 transition-all placeholder:text-slate-400 text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Tối thiểu 6 ký tự"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#145da0] focus:ring-2 focus:ring-[#145da0]/10 transition-all placeholder:text-slate-400 text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nhập lại mật khẩu
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Xác nhận mật khẩu"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#145da0] focus:ring-2 focus:ring-[#145da0]/10 transition-all placeholder:text-slate-400 text-slate-800"
                  />
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div className="flex items-center text-xs pt-0.5 pb-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-[#145da0] focus:ring-0 cursor-pointer accent-[#145da0]"
                  />
                  <span>Ghi nhớ đăng nhập</span>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-[#145da0] hover:bg-[#10528e] active:scale-[0.99] text-white font-bold rounded-xl text-sm transition-all shadow-[0_4px_14px_rgba(20,93,160,0.25)] hover:shadow-lg disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Đang xử lý…</span>
                </>
              ) : mode === 'login' ? (
                <span>Đăng nhập vào Erumi</span>
              ) : (
                <span>Đăng ký tài khoản</span>
              )}
            </button>
          </form>

          {/* Guest access button */}
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={onGuestAccess}
              className="text-xs font-semibold text-slate-400 hover:text-[#145da0] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles size={13} />
              <span>Tiếp tục với tài khoản dùng thử (Khách)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Column: Deep Blue Canvas with Mascot Circle */}
      <div className="hidden md:flex flex-1 bg-[#145da0] items-center justify-center p-8 lg:p-12 relative overflow-hidden">
        {/* Subtle decorative glow or backdrop behind circle */}
        <div className="absolute w-[500px] h-[500px] bg-white/5 rounded-full filter blur-3xl pointer-events-none" />

        {/* Large White Circle with Mascot */}
        <div className="w-72 h-72 lg:w-96 lg:h-96 xl:w-[420px] xl:h-[420px] rounded-full bg-white flex items-center justify-center shadow-[0_25px_60px_rgba(0,0,0,0.25)] relative p-8 lg:p-12 transition-transform hover:scale-105 duration-300">
          <img
            src="/erumi-chatbot.png"
            alt="ERUMI Chatbot"
            className="w-full h-full object-contain pointer-events-none drop-shadow-sm select-none"
          />
        </div>
      </div>
    </div>
  )
}
