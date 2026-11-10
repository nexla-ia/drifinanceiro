import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Gift,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Settings2,
  Target,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useDados } from '../context'
import { situacao } from './Baixa'
import { supabase } from '../lib/supabase'

const NAV = [
  { to: '/', rotulo: 'Resumo mensal', icone: LayoutDashboard },
  { to: '/lancamentos', rotulo: 'Lançamentos', icone: ListOrdered },
  { to: '/contas', rotulo: 'A pagar e receber', icone: CalendarClock },
  { to: '/recebimentos', rotulo: 'Recebimentos', icone: ArrowDownToLine },
  { to: '/pagamentos', rotulo: 'Pagamentos', icone: ArrowUpFromLine },
  { to: '/analitico', rotulo: 'Analítico', icone: Users },
  { to: '/cac', rotulo: 'CAC', icone: Target },
  { to: '/cortesias', rotulo: 'Cortesias', icone: Gift },
  { to: '/cadastros', rotulo: 'Cadastros', icone: Settings2 },
  { to: '/importar', rotulo: 'Importar histórico', icone: Upload },
]

function Marca() {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-display text-[1.65rem] font-semibold italic leading-none tracking-tight">Magnética</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-papel/50">financeiro</span>
    </div>
  )
}

function SeletorAno() {
  const { ano, setAno } = useDados()
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-1">
      <button type="button" aria-label="Ano anterior" onClick={() => setAno(ano - 1)} className="rounded-lg p-1.5 text-papel/70 hover:bg-white/10 hover:text-papel">
        <ChevronLeft size={16} />
      </button>
      <div className="text-center">
        <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-papel/45">Exercício</div>
        <div className="num text-base font-medium leading-tight">{ano}</div>
      </div>
      <button type="button" aria-label="Próximo ano" onClick={() => setAno(ano + 1)} className="rounded-lg p-1.5 text-papel/70 hover:bg-white/10 hover:text-papel">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

export function Layout({ email }: { email: string }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const { pendentes } = useDados()
  const vencidas = pendentes.filter((l) => situacao(l) === 'vencida').length

  const lateral = (
    <div className="flex h-full flex-col gap-6 px-4 py-6">
      <div className="px-2">
        <Marca />
      </div>
      <SeletorAno />
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ to, rotulo, icone: Icone }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setMenuAberto(false)}
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-white/10 font-semibold text-papel' : 'text-papel/65 hover:bg-white/5 hover:text-papel'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute -left-4 top-1.5 bottom-1.5 w-1 rounded-r bg-cobalto" />}
                <Icone size={17} strokeWidth={isActive ? 2.25 : 1.75} />
                {rotulo}
                {to === '/contas' && vencidas > 0 && (
                  <span
                    className="num ml-auto rounded-full bg-negativo px-1.5 py-px text-[11px] font-semibold text-white"
                    title={`${vencidas} contas vencidas`}
                  >
                    {vencidas}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="truncate px-2 text-xs text-papel/50" title={email}>
          {email}
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-papel/65 hover:bg-white/5 hover:text-papel"
        >
          <LogOut size={15} /> Sair
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Lateral fixa (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-noite text-papel lg:block">{lateral}</aside>

      {/* Barra superior (celular) */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-noite px-4 py-3 text-papel lg:hidden">
        <Marca />
        <button type="button" aria-label="Abrir menu" onClick={() => setMenuAberto(true)} className="rounded-lg p-1.5 hover:bg-white/10">
          <Menu size={20} />
        </button>
      </div>
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-noite/50" onClick={() => setMenuAberto(false)} />
          <aside className="anima-modal absolute inset-y-0 left-0 w-72 bg-noite text-papel">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMenuAberto(false)}
              className="absolute right-3 top-5 rounded-lg p-1.5 text-papel/70 hover:bg-white/10"
            >
              <X size={18} />
            </button>
            {lateral}
          </aside>
        </div>
      )}

      <main className="fundo-livro min-h-screen px-4 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1400px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
