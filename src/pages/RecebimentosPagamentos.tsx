import { useMemo } from 'react'
import { useDados } from '../context'
import { montarArvore, porCategoria, porGrupo, soma } from '../lib/agg'
import { fmtBRL, fmtPct } from '../lib/format'
import { Cabecalho, Carregando, Cartao, Indicador } from '../components/ui'
import { TabelaMensal } from '../components/TabelaMensal'

export function Recebimentos() {
  const { ano, lancamentos, carregando, erro } = useDados()
  const entradas = useMemo(() => lancamentos.filter((l) => l.tipo === 'entrada'), [lancamentos])
  const arvore = useMemo(() => montarArvore(entradas, [porGrupo, porCategoria]), [entradas])

  if (erro) return <p className="rounded-xl bg-negativo/10 p-4 text-negativo">{erro}</p>
  if (carregando) return <Carregando />

  const total = soma(entradas.map((l) => l.valor))
  const servicos = arvore.find((g) => g.label === 'Receitas de Serviços')
  const maior = servicos?.filhos?.[0]

  return (
    <>
      <Cabecalho titulo="Recebimentos" subtitulo={`Entradas de ${ano} por grupo e categoria (centro de custo). Clique em um valor para ver os lançamentos.`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Total recebido" valor={fmtBRL(total)} cor="var(--color-entrada)" />
        <Indicador
          rotulo="Receitas de serviços"
          valor={fmtBRL(servicos?.total ?? 0)}
          detalhe={total ? `${fmtPct((servicos?.total ?? 0) / total)} do total` : undefined}
          atraso={60}
        />
        <Indicador rotulo="Maior serviço" valor={maior ? fmtBRL(maior.total) : '—'} detalhe={maior?.label} atraso={120} />
      </div>
      <Cartao className="anima-subir overflow-hidden" style={{ animationDelay: '150ms' }}>
        <TabelaMensal linhas={arvore} rotuloColuna="Grupo / categoria" rotuloTotal="Total recebido" />
      </Cartao>
    </>
  )
}

export function Pagamentos() {
  const { ano, lancamentos, carregando, erro } = useDados()
  const saidas = useMemo(() => lancamentos.filter((l) => l.tipo === 'saida'), [lancamentos])
  const retiradas = useMemo(() => lancamentos.filter((l) => l.tipo === 'retirada'), [lancamentos])
  const arvore = useMemo(() => montarArvore(saidas, [porGrupo, porCategoria]), [saidas])
  const arvoreRet = useMemo(() => montarArvore(retiradas, [porCategoria]), [retiradas])

  if (erro) return <p className="rounded-xl bg-negativo/10 p-4 text-negativo">{erro}</p>
  if (carregando) return <Carregando />

  const total = soma(saidas.map((l) => l.valor))
  const maiorGrupo = arvore[0] && [...arvore].sort((a, b) => b.total - a.total)[0]
  const totalRet = soma(retiradas.map((l) => l.valor))

  return (
    <>
      <Cabecalho titulo="Pagamentos" subtitulo={`Saídas operacionais de ${ano} por grupo e categoria. A retirada de lucros aparece separada, abaixo.`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Total pago" valor={fmtBRL(total)} cor="var(--color-saida)" />
        <Indicador
          rotulo="Maior grupo"
          valor={maiorGrupo ? fmtBRL(maiorGrupo.total) : '—'}
          detalhe={maiorGrupo ? `${maiorGrupo.label} · ${fmtPct(maiorGrupo.total / (total || 1))}` : undefined}
          atraso={60}
        />
        <Indicador rotulo="Retirada de lucros" valor={fmtBRL(totalRet)} cor="var(--color-retirada)" detalhe="Fora do resultado" atraso={120} />
      </div>
      <Cartao className="anima-subir overflow-hidden" style={{ animationDelay: '150ms' }}>
        <TabelaMensal linhas={arvore} rotuloColuna="Grupo / categoria" rotuloTotal="Total pago" expandidoInicial={false} />
      </Cartao>

      <h2 className="mb-3 mt-10 font-display text-2xl font-semibold">Retirada de lucro</h2>
      <Cartao className="overflow-hidden">
        <TabelaMensal linhas={arvoreRet} rotuloColuna="Categoria" rotuloTotal="Total retirado" />
      </Cartao>
    </>
  )
}
