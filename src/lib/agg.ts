import type { Lancamento } from './types'

export const zeros = (): number[] => Array(12).fill(0)

export function somaMensal(lancs: Lancamento[]): number[] {
  const v = zeros()
  for (const l of lancs) v[l.mes] += l.valor
  return v.map(arred)
}

export const soma = (v: number[]) => arred(v.reduce((a, b) => a + b, 0))
export const arred = (v: number) => Math.round(v * 100) / 100

/** Filtro que a célula leva para a tela de Lançamentos (drill-down). */
export type Filtro = Partial<Record<'grupo' | 'categoria' | 'fornecedor' | 'etiqueta' | 'tipo', string>>

export interface NoArvore {
  key: string
  label: string
  sub?: string
  valores: number[]
  total: number
  filtro: Filtro
  filhos?: NoArvore[]
}

export interface Chave {
  key: string
  label: string
  sub?: string
  ordem?: number
  filtro?: Filtro
}

export type Nivel = (l: Lancamento) => Chave | Chave[] | null

/**
 * Agrupa lançamentos em árvore (ex.: Grupo → Categoria) com valores por mês.
 * Um nível pode devolver várias chaves (ex.: um lançamento com duas etiquetas).
 */
export function montarArvore(lancs: Lancamento[], niveis: Nivel[], filtroPai: Filtro = {}): NoArvore[] {
  if (niveis.length === 0) return []
  const [nivel, ...resto] = niveis
  const mapa = new Map<string, { chave: Chave; itens: Lancamento[] }>()
  for (const l of lancs) {
    const r = nivel(l)
    if (!r) continue
    for (const chave of Array.isArray(r) ? r : [r]) {
      const atual = mapa.get(chave.key)
      if (atual) atual.itens.push(l)
      else mapa.set(chave.key, { chave, itens: [l] })
    }
  }
  const nos = [...mapa.values()].map(({ chave, itens }) => {
    const filtro = { ...filtroPai, ...chave.filtro }
    const valores = somaMensal(itens)
    return {
      ordem: chave.ordem,
      no: {
        key: chave.key,
        label: chave.label,
        sub: chave.sub,
        valores,
        total: soma(valores),
        filtro,
        filhos: resto.length ? montarArvore(itens, resto, filtro) : undefined,
      } satisfies NoArvore,
    }
  })
  nos.sort((a, b) => {
    if (a.ordem !== undefined && b.ordem !== undefined && a.ordem !== b.ordem) return a.ordem - b.ordem
    return b.no.total - a.no.total || a.no.label.localeCompare(b.no.label, 'pt-BR')
  })
  return nos.map((n) => n.no)
}

/* Níveis prontos */
export const porGrupo: Nivel = (l) => ({
  key: l.grupo.id,
  label: l.grupo.nome,
  ordem: l.grupo.ordem,
  filtro: { grupo: l.grupo.id },
})

export const porCategoria: Nivel = (l) => ({
  key: l.categoria.id,
  label: l.categoria.nome,
  filtro: { categoria: l.categoria.id },
})

export const porCategoriaComGrupo: Nivel = (l) => ({
  key: l.categoria.id,
  label: l.categoria.nome,
  sub: l.grupo.nome,
  filtro: { categoria: l.categoria.id },
})

export const porFornecedor: Nivel = (l) =>
  l.fornecedor
    ? { key: l.fornecedor.id, label: l.fornecedor.nome, sub: l.fornecedor.funcao ?? undefined, filtro: { fornecedor: l.fornecedor.id } }
    : { key: 'sem', label: 'Sem fornecedor informado', ordem: 9999, filtro: { fornecedor: 'sem' } }
