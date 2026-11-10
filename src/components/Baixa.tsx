import { useState, type FormEvent } from 'react'
import { useAviso, useDados } from '../context'
import { baixarLancamento } from '../lib/data'
import { fmtBRL, fmtData, hojeISO } from '../lib/format'
import { mensagemErro } from '../lib/supabase'
import type { Lancamento } from '../lib/types'
import { Botao, Campo, Modal } from './ui'

/** Marca uma conta pendente como paga/recebida, informando a data efetiva. */
export function ModalBaixa({ lancamento, onFechar }: { lancamento: Lancamento | null; onFechar: () => void }) {
  const { recarregar } = useDados()
  const avisar = useAviso()
  const [data, setData] = useState(hojeISO())
  const [aberto, setAberto] = useState<Lancamento | null>(null)
  const [salvando, setSalvando] = useState(false)

  if (lancamento !== aberto) {
    setAberto(lancamento)
    setData(hojeISO())
  }

  const recebimento = lancamento?.tipo === 'entrada'

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!lancamento || !data) return
    setSalvando(true)
    try {
      await baixarLancamento(lancamento.id, data)
      await recarregar()
      avisar(recebimento ? 'Recebimento confirmado.' : 'Pagamento confirmado.')
      onFechar()
    } catch (err) {
      avisar(mensagemErro(err), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={recebimento ? 'Confirmar recebimento' : 'Confirmar pagamento'}
      aberto={!!lancamento}
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" type="submit" form="form-baixa" disabled={salvando}>
            {salvando ? 'Salvando…' : recebimento ? 'Confirmar recebimento' : 'Confirmar pagamento'}
          </Botao>
        </>
      }
    >
      {lancamento && (
        <form id="form-baixa" onSubmit={enviar} className="space-y-4">
          <div className="rounded-xl border border-linha bg-papel/60 px-4 py-3 text-sm">
            <div className="font-medium">{lancamento.descricao || lancamento.categoria.nome}</div>
            <div className="text-tinta-3">
              {lancamento.fornecedor?.nome ?? lancamento.categoria.nome} · vencimento {fmtData(lancamento.data)}
            </div>
            <div className="num mt-1 text-lg font-semibold">{fmtBRL(lancamento.valor)}</div>
          </div>
          <Campo rotulo={recebimento ? 'Recebido em' : 'Pago em'} dica="Essa data passa a valer nos relatórios.">
            <input type="date" className="campo" value={data} onChange={(e) => setData(e.target.value)} required autoFocus />
          </Campo>
        </form>
      )}
    </Modal>
  )
}

/** Situação de uma conta pendente, em relação a hoje. */
export function situacao(l: Lancamento): 'vencida' | 'hoje' | 'semana' | 'futura' {
  const hoje = hojeISO()
  if (l.data < hoje) return 'vencida'
  if (l.data === hoje) return 'hoje'
  const em7 = new Date()
  em7.setDate(em7.getDate() + 7)
  const lim = `${em7.getFullYear()}-${String(em7.getMonth() + 1).padStart(2, '0')}-${String(em7.getDate()).padStart(2, '0')}`
  return l.data <= lim ? 'semana' : 'futura'
}

export function PillPendente({ l }: { l: Lancamento }) {
  const s = situacao(l)
  const rotulo = s === 'vencida' ? 'Vencida' : s === 'hoje' ? 'Vence hoje' : l.tipo === 'entrada' ? 'A receber' : 'A pagar'
  const cls =
    s === 'vencida'
      ? 'bg-negativo/10 text-negativo'
      : s === 'hoje'
        ? 'bg-[#eda100]/15 text-[#8a5a00]'
        : 'bg-tinta/5 text-tinta-2'
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <span aria-hidden>{s === 'vencida' ? '!' : '◷'}</span>
      {rotulo}
    </span>
  )
}
