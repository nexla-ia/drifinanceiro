import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { ArrowRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ehCAC, useDados } from '../context'
import { situacao } from '../components/Baixa'
import { soma, somaMensal } from '../lib/agg'
import { MESES, MESES_LONGOS, fmtBRL, fmtBRLSinal, fmtCompacto, fmtNum, fmtNumSinal, fmtPct } from '../lib/format'
import { Botao, Cabecalho, Carregando, Cartao, Indicador } from '../components/ui'
import { FormLancamento, type RascunhoLancamento } from '../components/FormLancamento'

interface LinhaResumo {
  mes: string
  recebimentos: number
  pagamentos: number
  resultado: number
  retirada: number
  saldo: number
}

function DicaGrafico({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const l = payload[0].payload as LinhaResumo
  return (
    <div className="min-w-48 rounded-xl border border-linha bg-folha px-3.5 py-3 text-sm shadow-lg">
      <div className="mb-2 font-display font-semibold">{MESES_LONGOS[MESES.indexOf(String(label))]}</div>
      <LinhaDica cor="var(--color-entrada)" rotulo="Recebimentos" valor={l.recebimentos} />
      <LinhaDica cor="var(--color-saida)" rotulo="Pagamentos" valor={l.pagamentos} />
      <div className="mt-2 border-t border-linha pt-2">
        <LinhaDica rotulo="Resultado" valor={l.resultado} sinal />
      </div>
    </div>
  )
}

function LinhaDica({ cor, rotulo, valor, sinal }: { cor?: string; rotulo: string; valor: number; sinal?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-2 text-tinta-2">
        {cor && <span className="size-2.5 rounded-sm" style={{ background: cor }} />}
        {rotulo}
      </span>
      <span className={`num ${sinal && valor < 0 ? 'text-negativo' : ''}`}>{sinal ? fmtBRLSinal(valor) : fmtBRL(valor)}</span>
    </div>
  )
}

export function Resumo() {
  const { ano, lancamentos, pendentes, carregando, erro } = useDados()
  const [rascunho, setRascunho] = useState<RascunhoLancamento | null>(null)

  const { linhas, totais, cacTotal } = useMemo(() => {
    const rec = somaMensal(lancamentos.filter((l) => l.tipo === 'entrada'))
    const pag = somaMensal(lancamentos.filter((l) => l.tipo === 'saida'))
    const ret = somaMensal(lancamentos.filter((l) => l.tipo === 'retirada'))
    const linhas: LinhaResumo[] = MESES.map((mes, i) => {
      const resultado = rec[i] - pag[i]
      return { mes, recebimentos: rec[i], pagamentos: pag[i], resultado, retirada: ret[i], saldo: resultado - ret[i] }
    })
    const t = { recebimentos: soma(rec), pagamentos: soma(pag), retirada: soma(ret), resultado: 0, saldo: 0 }
    t.resultado = t.recebimentos - t.pagamentos
    t.saldo = t.resultado - t.retirada
    const cacTotal = soma(lancamentos.filter(ehCAC).map((l) => l.valor))
    return { linhas, totais: t, cacTotal }
  }, [lancamentos])

  if (erro) return <p className="rounded-xl bg-negativo/10 p-4 text-negativo">{erro}</p>
  if (carregando) return <Carregando />

  const aReceber = soma(pendentes.filter((l) => l.tipo === 'entrada').map((l) => l.valor))
  const aPagar = soma(pendentes.filter((l) => l.tipo !== 'entrada').map((l) => l.valor))
  const vencidas = pendentes.filter((l) => situacao(l) === 'vencida').length
  const margem = totais.recebimentos ? totais.resultado / totais.recebimentos : 0
  const mesesComMovimento = linhas.filter((l) => l.recebimentos || l.pagamentos || l.retirada).length

  return (
    <>
      <Cabecalho
        titulo={`Resumo de ${ano}`}
        subtitulo="Só o que já foi pago ou recebido. Resultado = Recebimentos − Pagamentos; a retirada de lucros é descontada depois, no Saldo."
        acoes={
          <Botao variante="primario" onClick={() => setRascunho({})}>
            <Plus size={16} /> Novo lançamento
          </Botao>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Indicador rotulo="Recebimentos" valor={fmtBRL(totais.recebimentos)} cor="var(--color-entrada)" atraso={0} />
        <Indicador rotulo="Pagamentos" valor={fmtBRL(totais.pagamentos)} cor="var(--color-saida)" atraso={60} />
        <Indicador
          rotulo="Resultado"
          valor={fmtBRLSinal(totais.resultado)}
          detalhe={totais.recebimentos ? `Margem de ${fmtPct(margem)}` : undefined}
          atraso={120}
        />
        <Indicador rotulo="Retirada" valor={fmtBRL(totais.retirada)} cor="var(--color-retirada)" detalhe="Antecipação de lucros" atraso={180} />
        <Indicador
          rotulo="Saldo"
          valor={fmtBRLSinal(totais.saldo)}
          detalhe={cacTotal ? `CAC no ano: ${fmtBRL(cacTotal)}` : 'Resultado − Retirada'}
          destaque
          atraso={240}
        />
      </div>

      {pendentes.length > 0 && (
        <Link
          to="/contas"
          className="anima-subir mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-linha bg-folha/70 px-4 py-2.5 text-sm transition-colors hover:border-cobalto"
          style={{ animationDelay: '300ms' }}
        >
          <span className="font-semibold">Previsto</span>
          <span className="text-tinta-2">
            A receber <span className="num font-medium text-tinta">{fmtBRL(aReceber)}</span>
          </span>
          <span className="text-tinta-2">
            A pagar <span className="num font-medium text-tinta">{fmtBRL(aPagar)}</span>
          </span>
          {vencidas > 0 && (
            <span className="font-medium text-negativo">
              ! {vencidas} {vencidas === 1 ? 'conta vencida' : 'contas vencidas'}
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-cobalto">
            Ver contas <ArrowRight size={14} />
          </span>
        </Link>
      )}

      <Cartao className="anima-subir mt-6 p-5" style={{ animationDelay: '200ms' }}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Entradas e saídas por mês</h2>
          <div className="flex items-center gap-4 text-xs text-tinta-2">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-entrada" /> Recebimentos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-saida" /> Pagamentos
            </span>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={linhas} barGap={2} barCategoryGap="22%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-linha)" />
              <XAxis dataKey="mes" tickLine={false} axisLine={{ stroke: 'var(--color-linha-forte)' }} tick={{ fill: 'var(--color-tinta-2)', fontSize: 12 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fill: 'var(--color-tinta-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                tickFormatter={(v: number) => (v ? fmtCompacto(v) : '0')}
              />
              <Tooltip content={DicaGrafico} cursor={{ fill: 'rgb(43 63 214 / 0.06)' }} />
              <Bar dataKey="recebimentos" name="Recebimentos" fill="var(--color-entrada)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="pagamentos" name="Pagamentos" fill="var(--color-saida)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Cartao>

      <Cartao className="anima-subir mt-6 overflow-hidden" style={{ animationDelay: '280ms' }}>
        <div className="flex items-center justify-between border-b border-linha px-5 py-4">
          <h2 className="font-display text-xl font-semibold">Mês a mês</h2>
          <span className="text-xs text-tinta-3">{mesesComMovimento} de 12 meses com movimento</span>
        </div>
        <div className="rolagem overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-tinta-2">
                <th className="px-5 py-2.5 text-left font-semibold">Mês</th>
                <th className="px-4 py-2.5 text-right font-semibold">Recebimentos</th>
                <th className="px-4 py-2.5 text-right font-semibold">Pagamentos</th>
                <th className="px-4 py-2.5 text-right font-semibold">Resultado</th>
                <th className="px-4 py-2.5 text-right font-semibold">Retirada</th>
                <th className="px-5 py-2.5 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const vazio = !l.recebimentos && !l.pagamentos && !l.retirada
                return (
                  <tr key={l.mes} className={`border-t border-linha ${vazio ? 'text-tinta-3/60' : ''}`}>
                    <td className="px-5 py-2.5 font-medium">{MESES_LONGOS[i]}</td>
                    <td className="num px-4 py-2.5 text-right">{fmtNum(l.recebimentos)}</td>
                    <td className="num px-4 py-2.5 text-right">{fmtNum(l.pagamentos)}</td>
                    <td className={`num px-4 py-2.5 text-right ${l.resultado < 0 ? 'text-negativo' : ''}`}>
                      {fmtNumSinal(l.resultado)}
                    </td>
                    <td className="num px-4 py-2.5 text-right">{fmtNum(l.retirada)}</td>
                    <td className={`num px-5 py-2.5 text-right font-semibold ${l.saldo < 0 ? 'text-negativo' : ''}`}>
                      {fmtNumSinal(l.saldo)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-tinta bg-noite text-papel">
                <td className="px-5 py-3 font-semibold">Total do período</td>
                <td className="num px-4 py-3 text-right">{fmtNum(totais.recebimentos)}</td>
                <td className="num px-4 py-3 text-right">{fmtNum(totais.pagamentos)}</td>
                <td className="num px-4 py-3 text-right">{fmtNumSinal(totais.resultado)}</td>
                <td className="num px-4 py-3 text-right">{fmtNum(totais.retirada)}</td>
                <td className="num px-5 py-3 text-right font-semibold">{fmtNumSinal(totais.saldo)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Cartao>

      <FormLancamento rascunho={rascunho} onFechar={() => setRascunho(null)} />
    </>
  )
}
