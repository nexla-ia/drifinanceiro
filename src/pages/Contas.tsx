import { useMemo, useState } from 'react'
import { CheckCheck, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAviso, useDados } from '../context'
import { excluirLancamento } from '../lib/data'
import { soma } from '../lib/agg'
import { fmtBRL, fmtBRLSinal, fmtData, fmtNum } from '../lib/format'
import { mensagemErro } from '../lib/supabase'
import type { Lancamento } from '../lib/types'
import { Botao, BotaoIcone, Cabecalho, Carregando, Cartao, Indicador, PillTipo, Vazio } from '../components/ui'
import { FormLancamento, type RascunhoLancamento } from '../components/FormLancamento'
import { ModalBaixa, PillPendente, situacao } from '../components/Baixa'

type Visao = 'todas' | 'pagar' | 'receber'

const SECOES = [
  { id: 'vencida', titulo: 'Vencidas' },
  { id: 'proximas', titulo: 'Hoje e próximos 7 dias' },
  { id: 'futura', titulo: 'Mais adiante' },
] as const

export function Contas() {
  const { pendentes, carregando, erro, recarregar } = useDados()
  const avisar = useAviso()
  const [visao, setVisao] = useState<Visao>('todas')
  const [rascunho, setRascunho] = useState<RascunhoLancamento | null>(null)
  const [baixando, setBaixando] = useState<Lancamento | null>(null)

  const lista = useMemo(
    () =>
      pendentes.filter((l) => (visao === 'pagar' ? l.tipo !== 'entrada' : visao === 'receber' ? l.tipo === 'entrada' : true)),
    [pendentes, visao],
  )

  const resumo = useMemo(() => {
    const somar = (f: (l: Lancamento) => boolean) => soma(pendentes.filter(f).map((l) => l.valor))
    const vencidas = pendentes.filter((l) => situacao(l) === 'vencida')
    return {
      aReceber: somar((l) => l.tipo === 'entrada'),
      aPagar: somar((l) => l.tipo !== 'entrada'),
      vencidasQtd: vencidas.length,
      vencidasValor: soma(vencidas.map((l) => l.valor)),
      semana: somar((l) => ['hoje', 'semana'].includes(situacao(l)) && l.tipo !== 'entrada'),
    }
  }, [pendentes])

  const excluir = async (l: Lancamento) => {
    if (!window.confirm(`Excluir “${l.descricao || l.categoria.nome}” de ${fmtBRL(l.valor)}?`)) return
    try {
      await excluirLancamento(l.id)
      await recarregar()
      avisar('Conta excluída.')
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    }
  }

  if (erro) return <p className="rounded-xl bg-negativo/10 p-4 text-negativo">{erro}</p>
  if (carregando) return <Carregando />

  const grupos = {
    vencida: lista.filter((l) => situacao(l) === 'vencida'),
    proximas: lista.filter((l) => ['hoje', 'semana'].includes(situacao(l))),
    futura: lista.filter((l) => situacao(l) === 'futura'),
  }

  return (
    <>
      <Cabecalho
        titulo="A pagar e receber"
        subtitulo="Contas previstas, de qualquer ano. Ao confirmar o pagamento ou recebimento, o valor passa a contar nos relatórios na data informada."
        acoes={
          <Botao variante="primario" onClick={() => setRascunho({ status: 'pendente', tipo: visao === 'receber' ? 'entrada' : 'saida' })}>
            <Plus size={16} /> Nova conta
          </Botao>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="A receber" valor={fmtBRL(resumo.aReceber)} cor="var(--color-entrada)" />
        <Indicador rotulo="A pagar" valor={fmtBRL(resumo.aPagar)} cor="var(--color-saida)" atraso={60} />
        <Indicador
          rotulo="Vencidas"
          valor={fmtBRL(resumo.vencidasValor)}
          detalhe={resumo.vencidasQtd ? `${resumo.vencidasQtd} ${resumo.vencidasQtd === 1 ? 'conta' : 'contas'} em atraso` : 'Nada em atraso'}
          atraso={120}
        />
        <Indicador
          rotulo="Saldo previsto"
          valor={fmtBRLSinal(resumo.aReceber - resumo.aPagar)}
          detalhe={`A pagar nos próximos 7 dias: ${fmtBRL(resumo.semana)}`}
          destaque
          atraso={180}
        />
      </div>

      <div role="tablist" className="mb-4 inline-flex gap-1 rounded-xl border border-linha bg-folha p-1">
        {(
          [
            ['todas', 'Todas'],
            ['pagar', 'A pagar'],
            ['receber', 'A receber'],
          ] as [Visao, string][]
        ).map(([id, rotulo]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={visao === id}
            onClick={() => setVisao(id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${visao === id ? 'bg-noite text-papel' : 'text-tinta-2 hover:bg-papel'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <Cartao>
          <Vazio titulo="Nenhuma conta pendente.">
            Ao criar um lançamento, escolha “A pagar” ou “A receber”. Para contas fixas, use “Repetir nos meses seguintes”.
          </Vazio>
        </Cartao>
      ) : (
        <div className="space-y-6">
          {SECOES.map(({ id, titulo }) => {
            const itens = grupos[id]
            if (!itens.length) return null
            return (
              <Cartao key={id} className="overflow-hidden">
                <div className="flex items-baseline justify-between border-b border-linha bg-papel/50 px-5 py-3">
                  <h2 className={`font-display text-lg font-semibold ${id === 'vencida' ? 'text-negativo' : ''}`}>
                    {titulo} <span className="ml-1 text-sm font-normal text-tinta-3">({itens.length})</span>
                  </h2>
                  <span className="num text-sm font-semibold">{fmtBRL(soma(itens.map((l) => l.valor)))}</span>
                </div>
                <div className="rolagem overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-tinta-2">
                        <th className="w-28 px-5 py-2 text-left font-semibold">Vencimento</th>
                        <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                        <th className="px-3 py-2 text-left font-semibold">Descrição</th>
                        <th className="px-3 py-2 text-left font-semibold">Fornecedor / cliente</th>
                        <th className="px-3 py-2 text-right font-semibold">Valor</th>
                        <th className="w-56 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((l) => (
                        <tr key={l.id} className="group border-t border-linha hover:bg-cobalto-claro/25">
                          <td className="num px-5 py-2.5 text-[13px]">{fmtData(l.data)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1">
                              <PillTipo tipo={l.tipo} />
                              <PillPendente l={l} />
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium">{l.descricao || l.categoria.nome}</div>
                            <div className="text-xs text-tinta-3">
                              {l.categoria.nome} · {l.grupo.nome}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-tinta-2">{l.fornecedor?.nome ?? '—'}</td>
                          <td className="num px-3 py-2.5 text-right font-medium">{fmtNum(l.valor)}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center justify-end gap-1">
                              <Botao pequeno variante="secundario" onClick={() => setBaixando(l)}>
                                <CheckCheck size={14} /> {l.tipo === 'entrada' ? 'Recebido' : 'Pago'}
                              </Botao>
                              <BotaoIcone rotulo="Editar" onClick={() => setRascunho(l)}>
                                <Pencil size={14} />
                              </BotaoIcone>
                              <BotaoIcone rotulo="Excluir" className="hover:!text-negativo" onClick={() => excluir(l)}>
                                <Trash2 size={14} />
                              </BotaoIcone>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Cartao>
            )
          })}
        </div>
      )}

      <FormLancamento rascunho={rascunho} onFechar={() => setRascunho(null)} />
      <ModalBaixa lancamento={baixando} onFechar={() => setBaixando(null)} />
    </>
  )
}
