import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Botao, Campo } from '../components/ui'

export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    setErro(null)
    setEntrando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEntrando(false)
    if (error) {
      setErro(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message === 'Email not confirmed'
            ? 'Confirme seu e-mail pelo link enviado antes de entrar.'
            : error.message,
      )
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-noite p-12 text-papel lg:flex lg:flex-col">
        {/* Linhas de campo magnético */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.18]" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => (
            <ellipse key={i} cx="300" cy="430" rx={40 + i * 26} ry={120 + i * 34} fill="none" stroke="#f5f1e8" strokeWidth="1" />
          ))}
          <rect x="268" y="380" width="64" height="100" rx="10" fill="#2b3fd6" />
        </svg>
        <div className="relative">
          <span className="font-display text-4xl font-semibold italic">Magnética</span>
          <span className="ml-3 text-xs font-semibold uppercase tracking-[0.3em] text-papel/50">financeiro</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <p className="font-display text-3xl leading-snug">Cada real que entra e sai da agência, no lugar certo.</p>
          <p className="mt-4 text-sm text-papel/60">Recebimentos, pagamentos, CAC e cortesias — mês a mês.</p>
        </div>
      </div>

      <div className="fundo-livro flex items-center justify-center p-6">
        <form onSubmit={entrar} className="anima-subir w-full max-w-sm rounded-2xl border border-linha bg-folha p-8 shadow-xl">
          <div className="mb-6 lg:hidden">
            <span className="font-display text-3xl font-semibold italic">Magnética</span>
          </div>
          <h1 className="font-display text-2xl font-semibold">Entrar</h1>
          <p className="mt-1 text-sm text-tinta-2">Acesso restrito à equipe.</p>
          <div className="mt-6 space-y-4">
            <Campo rotulo="E-mail">
              <input className="campo" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Campo>
            <Campo rotulo="Senha">
              <input
                className="campo"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </Campo>
          </div>
          {erro && <p className="mt-4 rounded-lg bg-negativo/10 px-3 py-2 text-sm text-negativo">{erro}</p>}
          <Botao variante="primario" type="submit" disabled={entrando} className="mt-6 w-full py-2.5">
            {entrando ? 'Entrando…' : 'Entrar'}
          </Botao>
        </form>
      </div>
    </div>
  )
}
