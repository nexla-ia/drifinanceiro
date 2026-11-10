import { useMemo, useState } from 'react'
import { useDados } from '../context'
import { montarArvore, porCategoriaComGrupo, porFornecedor } from '../lib/agg'
import type { TipoGrupo } from '../lib/types'
import { Cabecalho, Carregando, Cartao } from '../components/ui'
import { TabelaMensal } from '../components/TabelaMensal'

export function Analitico() {
  const { ano, cadastros, lancamentos, carregando, erro } = useDados()
  const [tipo, setTipo] = useState<TipoGrupo>('saida')
  const [categoria, setCategoria] = useState('')

  // Categorias que de fato têm lançamentos no ano, para o filtro
  const categoriasUsadas = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; grupo: string }>()
    for (const l of lancamentos)
      if (l.tipo === tipo) m.set(l.categoria.id, { id: l.categoria.id, nome: l.categoria.nome, grupo: l.grupo.nome })
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [lancamentos, tipo])

  const arvore = useMemo(() => {
    const base = lancamentos.filter((l) => l.tipo === tipo && (!categoria || l.categoria.id === categoria))
    return montarArvore(base, categoria ? [porFornecedor] : [porFornecedor, porCategoriaComGrupo])
  }, [lancamentos, tipo, categoria])

  if (erro) return <p className="rounded-xl bg-negativo/10 p-4 text-negativo">{erro}</p>
  if (carregando) return <Carregando />

  return (
    <>
      <Cabecalho
        titulo="Analítico"
        subtitulo={`Quanto foi para cada fornecedor e prestador em ${ano}, mês a mês. Expanda um nome para ver em quais categorias o valor caiu.`}
        acoes={
          <>
            <select
              className="campo w-auto"
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoGrupo)
                setCategoria('')
              }}
              aria-label="Tipo"
            >
              <option value="saida">Pagamentos</option>
              <option value="entrada">Recebimentos (por cliente)</option>
              <option value="retirada">Retiradas</option>
            </select>
            <select className="campo w-auto min-w-56" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {categoriasUsadas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} — {c.grupo}
                </option>
              ))}
            </select>
          </>
        }
      />
      <Cartao className="anima-subir overflow-hidden" style={{ animationDelay: '80ms' }}>
        <TabelaMensal
          key={`${tipo}-${categoria}`}
          linhas={arvore}
          rotuloColuna={tipo === 'entrada' ? 'Cliente / origem' : 'Fornecedor / prestador'}
          expandidoInicial={false}
        />
      </Cartao>
      {cadastros.fornecedores.length > 0 && arvore.some((n) => n.key === 'sem') && (
        <p className="mt-3 text-xs text-tinta-3">
          “Sem fornecedor informado” reúne lançamentos sem fornecedor. Edite-os em Lançamentos para deixar o analítico completo.
        </p>
      )}
    </>
  )
}
