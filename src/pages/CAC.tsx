import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ehCAC, useAviso, useDados } from '../context'
import { montarArvore, porCategoriaComGrupo, soma, somaMensal } from '../lib/agg'
import { carregarClientesNovos, salvarClientesNovos } from '../lib/data'
import { MESES, fmtBRL, fmtNum, fmtPct } from '../lib/format'
import { mensagemErro } from '../lib/supabase'
import { Cabecalho, Carregando, Cartao, Indicador } from '../components/ui'
import { TabelaMensal } from '../components/TabelaMensal'

/** Linha editável: quantos clientes novos entraram em cada mês. */
function ClientesNovos({ ano, cacMensal, onMudar }: { ano: number; cacMensal: number[]; onMudar: (v: number[]) => void }) {
  const avisar = useAviso()
  const [valores, setValores] = useState<number[] | null>(null)
  const [textos, setTextos] = useState<string[]>(Array(12).fill(''))

  useEffect(() => {
    let ativo = true
    setValores(null)
    carregarClientesNovos(ano)
      .then((v) => {
        if (!ativo) return
        setValores(v)
        setTextos(v.map((x) => (x ? String(x) : '')))
        onMudar(v)
      })
      .catch((e) => avisar(mensagemErro(e), 'erro'))
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano])

  const salvar = async (mes: number) => {
    if (!valores) return
    const n = Math.max(0, Math.floor(Number(textos[mes].replace(/\D/g, '')) || 0))
    if (n === valores[mes]) return
    try {
      await salvarClientesNovos(ano, mes, n)
      const novo = valores.map((x, i) => (i === mes ? n : x))
      setValores(novo)
      onMudar(novo)
    } catch (e) {
      avisar(mensagemErro(e), 'erro')
    }
  }

  const totalClientes = valores ? soma(valores) : 0
  const totalCAC = soma(cacMensal)

  return (
    <div className="rolagem overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-tinta-2">
            <th className="sticky left-0 z-[1] min-w-[240px] border-r border-linha bg-folha px-3 py-2.5 text-left font-semibold" />
            {MESES.map((m) => (
              <th key={m} className="min-w-[92px] px-3 py-2.5 text-right font-semibold">
                {m}
              </th>
            ))}
            <th className="min-w-[110px] border-l border-linha bg-papel/40 px-3 py-2.5 text-right font-semibold">Ano</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-linha">
            <th scope="row" className="sticky left-0 z-[1] border-r border-linha bg-folha px-3 py-2 text-left text-[13px] font-semibold">
              Clientes novos
              <div className="text-[11px] font-normal text-tinta-3">Digite e saia do campo para salvar</div>
            </th>
            {textos.map((t, i) => (
              <td key={i} className="px-1 py-1">
                <input
                  aria-label={`Clientes novos em ${MESES[i]}`}
                  inputMode="numeric"
                  disabled={!valores}
                  value={t}
                  placeholder="0"
                  onChange={(e) => setTextos((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
                  onBlur={() => salvar(i)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="num w-full rounded-md border border-dashed border-linha-forte bg-papel/40 px-2 py-1 text-right text-[13px] outline-none focus:border-solid focus:border-cobalto focus:bg-folha"
                />
              </td>
            ))}
            <td className="num border-l border-linha bg-papel/40 px-3 py-2 text-right text-[13px] font-semibold">{totalClientes || '—'}</td>
          </tr>
          <tr className="border-t-2 border-tinta bg-noite text-papel">
            <th scope="row" className="sticky left-0 z-[1] border-r border-white/10 bg-noite px-3 py-2.5 text-left text-[13px] font-semibold">
              CAC por cliente
            </th>
            {cacMensal.map((v, i) => {
              const n = valores?.[i] ?? 0
              return (
                <td key={i} className="num px-3 py-2.5 text-right text-[13px]">
                  {n && v ? fmtNum(v / n) : <span className="text-papel/35">—</span>}
                </td>
              )
            })}
            <td className="num border-l border-white/10 px-3 py-2.5 text-right text-[13px] font-semibold">
              {totalClientes && totalCAC ? fmtNum(totalCAC / totalClientes) : '—'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function CAC() {
  const { ano, cadastros, lancamentos, carregando, erro } = useDados()
  const [clientes, setClientes] = useState<number[]>(Array(12).fill(0))
  const cac = useMemo(() => lancamentos.filter(ehCAC), [lancamentos])
  const arvore = useMemo(() => montarArvore(cac, [porCategoriaComGrupo]), [cac])
  const mensal = useMemo(() => somaMensal(cac), [cac])

  if (erro) return <p className="rounded-xl bg-negativo/10 p-4 text-negativo">{erro}</p>
  if (carregando) return <Carregando />

  const total = soma(mensal)
  const totalClientes = soma(clientes)
  const pagamentos = soma(lancamentos.filter((l) => l.tipo === 'saida').map((l) => l.valor))
  const etiquetaCAC = cadastros.etiquetas.find((e) => e.tipo === 'cac')

  return (
    <>
      <Cabecalho
        titulo="CAC"
        subtitulo={
          <>
            Custo de aquisição de clientes em {ano}: todo lançamento pago marcado com a etiqueta{' '}
            <strong>{etiquetaCAC?.nome ?? 'CAC'}</strong>, seja combustível, tráfego pago, podcast ou viagem.
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="CAC no ano" valor={fmtBRL(total)} cor="var(--color-cobalto)" />
        <Indicador rotulo="Clientes novos" valor={String(totalClientes)} detalhe="Informados na tabela abaixo" atraso={60} />
        <Indicador
          rotulo="CAC por cliente"
          valor={totalClientes ? fmtBRL(total / totalClientes) : '—'}
          detalhe={totalClientes ? 'Investimento ÷ clientes novos' : 'Informe os clientes novos'}
          destaque
          atraso={120}
        />
        <Indicador rotulo="% dos pagamentos" valor={pagamentos ? fmtPct(total / pagamentos) : '—'} atraso={180} />
      </div>

      <Cartao className="anima-subir mb-6 overflow-hidden" style={{ animationDelay: '120ms' }}>
        <div className="border-b border-linha px-5 py-4">
          <h2 className="font-display text-xl font-semibold">Custo por cliente novo</h2>
        </div>
        <ClientesNovos ano={ano} cacMensal={mensal} onMudar={setClientes} />
      </Cartao>

      <Cartao className="anima-subir overflow-hidden" style={{ animationDelay: '180ms' }}>
        <div className="border-b border-linha px-5 py-4">
          <h2 className="font-display text-xl font-semibold">Onde o investimento foi</h2>
        </div>
        <TabelaMensal linhas={arvore} rotuloColuna="Categoria" rotuloTotal="Total CAC" />
      </Cartao>
      {cac.length === 0 && (
        <p className="mt-3 text-sm text-tinta-3">
          Para algo entrar aqui, marque a etiqueta “{etiquetaCAC?.nome ?? 'CAC'}” ao criar ou editar o lançamento em{' '}
          <Link className="text-cobalto hover:underline" to="/lancamentos">
            Lançamentos
          </Link>
          .
        </p>
      )}
    </>
  )
}
