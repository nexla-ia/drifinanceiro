import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { soma, zeros, type Filtro, type NoArvore } from '../lib/agg'
import { MESES, fmtNum } from '../lib/format'
import { Vazio } from './ui'

function linkLancamentos(filtro: Filtro, mes?: number) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(filtro)) if (v) p.set(k, v)
  if (mes !== undefined) p.set('mes', String(mes + 1))
  return `/lancamentos?${p.toString()}`
}

function Celula({ v, onClick, forte }: { v: number; onClick?: () => void; forte?: boolean }) {
  if (!v) return <td className="px-3 py-2 text-right text-tinta-3/50">—</td>
  return (
    <td className="px-1 py-1 text-right">
      <button
        type="button"
        onClick={onClick}
        title="Ver lançamentos"
        className={`num w-full rounded-md px-2 py-1 text-right text-[13px] transition-colors hover:bg-cobalto-claro hover:text-cobalto-escuro ${forte ? 'font-semibold' : ''}`}
      >
        {fmtNum(v)}
      </button>
    </td>
  )
}

/**
 * Tabela Grupo/Categoria/Fornecedor × 12 meses + total.
 * Clicar num valor abre a lista de lançamentos já filtrada.
 */
export function TabelaMensal({
  linhas,
  rotuloColuna,
  rotuloTotal = 'Total',
  expandidoInicial = true,
}: {
  linhas: NoArvore[]
  rotuloColuna: string
  rotuloTotal?: string
  expandidoInicial?: boolean
}) {
  const navegar = useNavigate()
  const [fechados, setFechados] = useState<Set<string>>(() =>
    expandidoInicial ? new Set() : new Set(linhas.map((l) => l.key)),
  )

  if (linhas.length === 0) return <Vazio titulo="Nenhum lançamento neste ano.">Os valores aparecem aqui assim que houver lançamentos.</Vazio>

  const totalMes = zeros().map((_, i) => soma(linhas.map((l) => l.valores[i])))
  const totalGeral = soma(totalMes)
  const alternar = (k: string) =>
    setFechados((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const todosFechados = linhas.every((l) => !l.filhos?.length || fechados.has(l.key))
  const temFilhos = linhas.some((l) => l.filhos?.length)

  const renderLinha = (no: NoArvore, nivel: number, caminho: string) => {
    const chave = `${caminho}/${no.key}`
    const aberto = !fechados.has(no.key)
    const pai = !!no.filhos?.length
    return (
      <Fragment key={chave}>
        <tr className={`group border-t border-linha ${nivel === 0 && pai ? 'bg-papel/50' : ''} hover:bg-cobalto-claro/30`}>
          <th
            scope="row"
            className={`sticky left-0 z-[1] min-w-[240px] max-w-[320px] border-r border-linha bg-folha px-3 py-2 text-left font-normal group-hover:bg-[#f6f6fa] ${
              nivel === 0 && pai ? '!bg-[#faf7f0]' : ''
            }`}
            style={{ paddingLeft: 12 + nivel * 22 }}
          >
            <div className="flex items-center gap-1.5">
              {pai ? (
                <button
                  type="button"
                  onClick={() => alternar(no.key)}
                  aria-expanded={aberto}
                  className="-ml-1 rounded p-0.5 text-tinta-3 hover:bg-tinta/5 hover:text-tinta"
                >
                  <ChevronRight size={15} className={`transition-transform ${aberto ? 'rotate-90' : ''}`} />
                </button>
              ) : (
                nivel > 0 && <span className="w-1" />
              )}
              <div className="min-w-0">
                <div className={`truncate text-[13px] ${nivel === 0 && pai ? 'font-semibold' : ''}`} title={no.label}>
                  {no.label}
                </div>
                {no.sub && <div className="truncate text-[11px] text-tinta-3">{no.sub}</div>}
              </div>
            </div>
          </th>
          {no.valores.map((v, i) => (
            <Celula key={i} v={v} forte={nivel === 0 && pai} onClick={() => navegar(linkLancamentos(no.filtro, i))} />
          ))}
          <td className="border-l border-linha bg-papel/40 px-1 py-1 text-right">
            <button
              type="button"
              onClick={() => navegar(linkLancamentos(no.filtro))}
              className="num w-full rounded-md px-2 py-1 text-right text-[13px] font-semibold hover:bg-cobalto-claro hover:text-cobalto-escuro"
            >
              {fmtNum(no.total)}
            </button>
          </td>
        </tr>
        {pai && aberto && no.filhos!.map((f) => renderLinha(f, nivel + 1, chave))}
      </Fragment>
    )
  }

  return (
    <div>
      {temFilhos && (
        <div className="flex justify-end border-b border-linha px-3 py-2">
          <button
            type="button"
            className="text-xs font-medium text-cobalto hover:underline"
            onClick={() => setFechados(todosFechados ? new Set() : new Set(linhas.map((l) => l.key)))}
          >
            {todosFechados ? 'Expandir tudo' : 'Recolher tudo'}
          </button>
        </div>
      )}
      <div className="rolagem overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-tinta-2">
              <th scope="col" className="sticky left-0 z-[1] border-r border-linha bg-folha px-3 py-2.5 text-left font-semibold">
                {rotuloColuna}
              </th>
              {MESES.map((m) => (
                <th key={m} scope="col" className="min-w-[92px] px-3 py-2.5 text-right font-semibold">
                  {m}
                </th>
              ))}
              <th scope="col" className="min-w-[110px] border-l border-linha bg-papel/40 px-3 py-2.5 text-right font-semibold">
                Total
              </th>
            </tr>
          </thead>
          <tbody>{linhas.map((l) => renderLinha(l, 0, ''))}</tbody>
          <tfoot>
            <tr className="border-t-2 border-tinta bg-noite text-papel">
              <th scope="row" className="sticky left-0 z-[1] border-r border-white/10 bg-noite px-3 py-2.5 text-left text-[13px] font-semibold">
                {rotuloTotal}
              </th>
              {totalMes.map((v, i) => (
                <td key={i} className="num px-3 py-2.5 text-right text-[13px]">
                  {v ? fmtNum(v) : <span className="text-papel/35">—</span>}
                </td>
              ))}
              <td className="num border-l border-white/10 px-3 py-2.5 text-right text-[13px] font-semibold">{fmtNum(totalGeral)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
