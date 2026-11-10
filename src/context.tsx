import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { carregarCadastros, carregarLancamentosAno, carregarPendentes } from './lib/data'
import { mensagemErro } from './lib/supabase'
import type { Cadastros, Categoria, Etiqueta, Fornecedor, Grupo, Lancamento, LancamentoRow } from './lib/types'

/* ------------------------------------------------------------------ */
/* Avisos (toasts)                                                    */
/* ------------------------------------------------------------------ */
interface Aviso {
  id: number
  texto: string
  tipo: 'ok' | 'erro'
}
const AvisoCtx = createContext<(texto: string, tipo?: Aviso['tipo']) => void>(() => {})
export const useAviso = () => useContext(AvisoCtx)

export function AvisoProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const avisar = useCallback((texto: string, tipo: Aviso['tipo'] = 'ok') => {
    const id = Date.now() + Math.random()
    setAvisos((a) => [...a, { id, texto, tipo }])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 6000 : 3000)
  }, [])
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2" aria-live="polite">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={`anima-modal pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg ${
              a.tipo === 'erro' ? 'bg-negativo text-white' : 'bg-noite text-papel'
            }`}
          >
            {a.texto}
          </div>
        ))}
      </div>
    </AvisoCtx.Provider>
  )
}

/* ------------------------------------------------------------------ */
/* Dados do sistema                                                   */
/* ------------------------------------------------------------------ */
interface Mapas {
  grupo: Map<string, Grupo>
  categoria: Map<string, Categoria>
  fornecedor: Map<string, Fornecedor>
  etiqueta: Map<string, Etiqueta>
}

interface Dados {
  ano: number
  setAno: (a: number) => void
  cadastros: Cadastros
  mapas: Mapas
  /** Só o que já foi pago/recebido no ano — base de todos os relatórios. */
  lancamentos: Lancamento[]
  /** Tudo do ano, inclusive pendentes (tela de Lançamentos). */
  todos: Lancamento[]
  /** Contas a pagar/receber de qualquer ano, ordenadas por vencimento. */
  pendentes: Lancamento[]
  carregando: boolean
  erro: string | null
  recarregar: () => Promise<void>
  recarregarCadastros: () => Promise<void>
}

const DadosCtx = createContext<Dados | null>(null)
export function useDados(): Dados {
  const d = useContext(DadosCtx)
  if (!d) throw new Error('useDados fora do DadosProvider')
  return d
}

const VAZIO: Cadastros = { grupos: [], categorias: [], fornecedores: [], etiquetas: [] }

function anoInicial(): number {
  try {
    const salvo = Number(localStorage.getItem('ano'))
    if (salvo > 2000 && salvo < 2100) return salvo
  } catch {
    /* sem storage */
  }
  return new Date().getFullYear()
}

export function DadosProvider({ children }: { children: ReactNode }) {
  const [ano, setAnoState] = useState(anoInicial)
  const [cadastros, setCadastros] = useState<Cadastros>(VAZIO)
  const [linhas, setLinhas] = useState<LancamentoRow[]>([])
  const [linhasPendentes, setLinhasPendentes] = useState<LancamentoRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const setAno = useCallback((a: number) => {
    setAnoState(a)
    try {
      localStorage.setItem('ano', String(a))
    } catch {
      /* sem storage */
    }
  }, [])

  const recarregarCadastros = useCallback(async () => {
    try {
      setCadastros(await carregarCadastros())
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [])

  const recarregar = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([carregarLancamentosAno(ano), carregarPendentes()])
      setLinhas(l)
      setLinhasPendentes(p)
      setErro(null)
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [ano])

  useEffect(() => {
    recarregarCadastros()
    carregarPendentes()
      .then(setLinhasPendentes)
      .catch((e) => setErro(mensagemErro(e)))
  }, [recarregarCadastros])

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    carregarLancamentosAno(ano)
      .then((l) => ativo && (setLinhas(l), setErro(null)))
      .catch((e) => ativo && setErro(mensagemErro(e)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [ano])

  const mapas = useMemo<Mapas>(
    () => ({
      grupo: new Map(cadastros.grupos.map((x) => [x.id, x])),
      categoria: new Map(cadastros.categorias.map((x) => [x.id, x])),
      fornecedor: new Map(cadastros.fornecedores.map((x) => [x.id, x])),
      etiqueta: new Map(cadastros.etiquetas.map((x) => [x.id, x])),
    }),
    [cadastros],
  )

  const todos = useMemo(() => enriquecer(linhas, mapas), [linhas, mapas])
  const lancamentos = useMemo(() => todos.filter((l) => l.status === 'pago'), [todos])
  const pendentes = useMemo(() => enriquecer(linhasPendentes, mapas), [linhasPendentes, mapas])

  const valor: Dados = {
    ano,
    setAno,
    cadastros,
    mapas,
    lancamentos,
    todos,
    pendentes,
    carregando: carregando || cadastros === VAZIO,
    erro,
    recarregar,
    recarregarCadastros,
  }
  return <DadosCtx.Provider value={valor}>{children}</DadosCtx.Provider>
}

function enriquecer(linhas: LancamentoRow[], mapas: Mapas): Lancamento[] {
  const out: Lancamento[] = []
  for (const l of linhas) {
    const categoria = mapas.categoria.get(l.categoria_id)
    const grupo = categoria && mapas.grupo.get(categoria.grupo_id)
    if (!categoria || !grupo) continue
    out.push({
      ...l,
      mes: Number(l.data.slice(5, 7)) - 1,
      tipo: grupo.tipo,
      grupo,
      categoria,
      fornecedor: l.fornecedor_id ? mapas.fornecedor.get(l.fornecedor_id) ?? null : null,
      etiquetasObj: l.etiquetas.map((id) => mapas.etiqueta.get(id)).filter((x): x is Etiqueta => !!x),
    })
  }
  return out
}

/** Cortesia = lançamento com etiqueta de finalidade, ou nas categorias de mimos/brindes. */
const CATEGORIAS_CORTESIA = ['despesas com cortesias', 'brindes para clientes']
export const ehCortesia = (l: Lancamento) =>
  l.etiquetasObj.some((e) => e.tipo === 'cortesia') || CATEGORIAS_CORTESIA.includes(l.categoria.nome.toLowerCase())

export const ehCAC = (l: Lancamento) => l.etiquetasObj.some((e) => e.tipo === 'cac')
