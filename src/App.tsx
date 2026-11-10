import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { AvisoProvider, DadosProvider } from './context'
import { Layout } from './components/Layout'
import { Botao, Carregando } from './components/ui'
import { Login } from './pages/Login'
import { Resumo } from './pages/Resumo'
import { Lancamentos } from './pages/Lancamentos'
import { Recebimentos, Pagamentos } from './pages/RecebimentosPagamentos'
import { Analitico } from './pages/Analitico'
import { CAC } from './pages/CAC'
import { Cortesias } from './pages/Cortesias'
import { CadastrosPagina } from './pages/Cadastros'
import { Contas } from './pages/Contas'
import { Importar } from './pages/Importar'

function SemAcesso({ email }: { email: string }) {
  return (
    <div className="fundo-livro flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-linha bg-folha p-8 text-center shadow-xl">
        <h1 className="font-display text-2xl font-semibold">Acesso pendente</h1>
        <p className="mt-3 text-sm text-tinta-2">
          O e-mail <strong>{email}</strong> entrou, mas ainda não foi liberado para ver os dados financeiros. Peça ao administrador para
          incluí-lo na tabela <code className="rounded bg-papel px-1">membros</code>.
        </p>
        <Botao className="mt-6" onClick={() => supabase.auth.signOut()}>
          Sair
        </Botao>
      </div>
    </div>
  )
}

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [membro, setMembro] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const usuarioId = sessao?.user.id
  useEffect(() => {
    if (!usuarioId) return setMembro(undefined)
    let ativo = true
    supabase.rpc('is_membro').then(({ data, error }) => ativo && setMembro(!error && data === true))
    return () => {
      ativo = false
    }
  }, [usuarioId])

  if (sessao === undefined || (sessao && membro === undefined)) return <Carregando />
  if (!sessao) return <Login />
  const email = sessao.user.email ?? ''
  if (!membro) return <SemAcesso email={email} />

  return (
    <AvisoProvider>
      <DadosProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout email={email} />}>
              <Route index element={<Resumo />} />
              <Route path="lancamentos" element={<Lancamentos />} />
              <Route path="contas" element={<Contas />} />
              <Route path="importar" element={<Importar />} />
              <Route path="recebimentos" element={<Recebimentos />} />
              <Route path="pagamentos" element={<Pagamentos />} />
              <Route path="analitico" element={<Analitico />} />
              <Route path="cac" element={<CAC />} />
              <Route path="cortesias" element={<Cortesias />} />
              <Route path="cadastros" element={<CadastrosPagina />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DadosProvider>
    </AvisoProvider>
  )
}
