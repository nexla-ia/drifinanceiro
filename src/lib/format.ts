import type { Fornecedor, TipoEtiqueta, TipoFornecedor, TipoGrupo } from './types'

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
export const MESES_LONGOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

export const fmtBRL = (v: number) => brl.format(v)
export const fmtNum = (v: number) => num.format(v)
export const fmtCompacto = (v: number) => compacto.format(v)
export const fmtPct = (v: number) => pct.format(v)

/** Valor com sinal de menos explícito (para não depender só da cor). */
export const fmtNumSinal = (v: number) => (v < 0 ? `−${num.format(-v)}` : num.format(v))
export const fmtBRLSinal = (v: number) => (v < 0 ? `−${brl.format(-v)}` : brl.format(v))

export function fmtData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function hojeISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Mesma data no mês seguinte (31/01 → 28/02). */
export function proximoMes(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const ultimo = new Date(ny, nm, 0).getDate()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${ny}-${p(nm)}-${p(Math.min(d, ultimo))}`
}

/** Aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234". */
export function parseValor(entrada: string): number | null {
  let s = entrada.replace(/[R$\s]/g, '')
  if (!s) return null
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    const partes = s.split('.')
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) s = partes.join('')
  }
  const v = Number(s)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
}

export const fmtValorCampo = (v: number) => num.format(v)

export function nomeFornecedor(f: Fornecedor | null | undefined): string {
  if (!f) return '—'
  return f.funcao ? `${f.nome} · ${f.funcao}` : f.nome
}

export const TIPO_GRUPO: Record<TipoGrupo, string> = {
  entrada: 'Recebimento',
  saida: 'Pagamento',
  retirada: 'Retirada',
}

export const TIPO_FORNECEDOR: Record<TipoFornecedor, string> = {
  fornecedor: 'Fornecedor',
  prestador: 'Prestador',
  cliente: 'Cliente',
}

export const TIPO_ETIQUETA: Record<TipoEtiqueta, string> = {
  cac: 'CAC',
  cortesia: 'Cortesia / finalidade',
  geral: 'Geral',
}

export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
