import { useMemo } from 'react'
import { ehCortesia, useDados } from '../context'
import { montarArvore, soma, type Nivel } from '../lib/agg'
import { MESES_LONGOS, fmtBRL, fmtData, fmtNum } from '../lib/format'
import type { Lancamento } from '../lib/types'
import { Cabecalho, Carregando, Cartao, ChipEtiqueta, Indicador, Vazio } from '../components/ui'
import { TabelaMensal } from '../components/TabelaMensal'

const porFinalidade: Nivel = (l) => {
  const fins = l.etiquetasObj.filter((e) => e.tipo === 'cortesia')
  if (!fins.length) return { key: 'sem', label: 'Sem finalidade marcada', ordem: 999, filtro: { categoria: l.categoria.id } }
  return fins.map((e) => ({ key: e.id, label: e.nome, filtro: { etiqueta: e.id } }))
}

export function Cortesias() {
  const { ano, lancamentos, carregando, erro } = useDados()
  const cortesias = useMemo(() => lancamentos.filter((l) => l.tipo !== 'entrada' && ehCortesia(l)), [lancamentos])
  const arvore = useMemo(() => montarArvore(cortesias, [porFinalidade]), [cortesias])

  const porMes = useMemo(() => {
    const m = new Map<number, Lancamento[]>()
    for (const l of [...cortesias].sort((a, b) => a.data.localeCompare(b.data))) m.set(l.mes, [...(m.get(l.mes) ?? []), l])
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [cortesias])

  if (erro) return <p className="rounded-xl bg-negativo/10 p-4 text-negativo">{erro}</p>
  if (carregando) return <Carregando />

  const total = soma(cortesias.map((l) => l.valor))
  const maior = arvore.filter((n) => n.key !== 'sem').sort((a, b) => b.total - a.total)[0]

  return (
    <>
      <Cabecalho
        titulo="Cortesias"
        subtitulo={`Mimos e brindes de ${ano}: lançamentos em “Despesas com Cortesias” ou “Brindes para Clientes”, ou marcados com uma etiqueta de finalidade.`}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Total em cortesias" valor={fmtBRL(total)} cor="var(--color-saida)" />
        <Indicador rotulo="Itens" valor={String(cortesias.length)} atraso={60} />
        <Indicador rotulo="Principal finalidade" valor={maior ? fmtBRL(maior.total) : '—'} detalhe={maior?.label} atraso={120} />
      </div>

      <Cartao className="anima-subir overflow-hidden" style={{ animationDelay: '150ms' }}>
        <div className="border-b border-linha px-5 py-4">
          <h2 className="font-display text-xl font-semibold">Por finalidade</h2>
          <p className="text-xs text-tinta-3">Um item com duas etiquetas aparece nas duas linhas; o total geral considera cada item uma vez só.</p>
        </div>
        <TabelaMensal linhas={arvore} rotuloColuna="Etiqueta" rotuloTotal="Soma das linhas" />
      </Cartao>

      <h2 className="mb-3 mt-10 font-display text-2xl font-semibold">Detalhamento mês a mês</h2>
      {porMes.length === 0 ? (
        <Cartao>
          <Vazio titulo="Nenhuma cortesia registrada neste ano." />
        </Cartao>
      ) : (
        <div className="space-y-4">
          {porMes.map(([mes, itens]) => (
            <Cartao key={mes} className="overflow-hidden">
              <div className="flex items-baseline justify-between border-b border-linha bg-papel/50 px-5 py-3">
                <h3 className="font-display text-lg font-semibold">{MESES_LONGOS[mes]}</h3>
                <span className="num text-sm font-semibold">{fmtBRL(soma(itens.map((l) => l.valor)))}</span>
              </div>
              <div className="rolagem overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-tinta-2">
                      <th className="w-28 px-5 py-2 text-left font-semibold">Data</th>
                      <th className="px-3 py-2 text-left font-semibold">Fornecedor</th>
                      <th className="px-3 py-2 text-left font-semibold">Descrição / finalidade</th>
                      <th className="px-3 py-2 text-left font-semibold">Etiqueta</th>
                      <th className="px-5 py-2 text-right font-semibold">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((l) => (
                      <tr key={l.id} className="border-t border-linha">
                        <td className="num px-5 py-2 text-[13px] text-tinta-2">{fmtData(l.data)}</td>
                        <td className="px-3 py-2">{l.fornecedor?.nome ?? <span className="text-tinta-3">—</span>}</td>
                        <td className="px-3 py-2 text-tinta-2">{l.descricao || l.categoria.nome}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {l.etiquetasObj.filter((e) => e.tipo === 'cortesia').map((e) => (
                              <ChipEtiqueta key={e.id} e={e} />
                            ))}
                          </div>
                        </td>
                        <td className="num px-5 py-2 text-right">{fmtNum(l.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Cartao>
          ))}
        </div>
      )}
    </>
  )
}
