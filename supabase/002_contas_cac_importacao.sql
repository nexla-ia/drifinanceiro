-- =====================================================================
-- Magnética · Atualização 002
--   • Contas a pagar / a receber (status pago × pendente)
--   • Novos clientes por mês (CAC por cliente)
--   • Importação de histórico em lote, com opção de desfazer
-- Rode no SQL Editor depois do schema.sql. Pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Status do lançamento
--    pago     = já entrou/saiu do caixa (entra nos relatórios)
--    pendente = previsto: a receber / a pagar (data = vencimento)
-- ---------------------------------------------------------------------
alter table public.lancamentos
  add column if not exists status text not null default 'pago';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lancamentos_status_ck') then
    alter table public.lancamentos
      add constraint lancamentos_status_ck check (status in ('pago', 'pendente'));
  end if;
end $$;

create index if not exists lancamentos_pendentes_idx
  on public.lancamentos (data) where status = 'pendente';

-- Lote de importação (permite desfazer uma importação inteira)
alter table public.lancamentos
  add column if not exists lote_importacao uuid;
create index if not exists lancamentos_lote_idx
  on public.lancamentos (lote_importacao) where lote_importacao is not null;

-- ---------------------------------------------------------------------
-- 2. salvar_lancamento agora recebe o status
-- ---------------------------------------------------------------------
drop function if exists public.salvar_lancamento(uuid, date, uuid, uuid, text, numeric, text, uuid[]);

create or replace function public.salvar_lancamento(
  p_id            uuid,
  p_data          date,
  p_categoria_id  uuid,
  p_fornecedor_id uuid,
  p_descricao     text,
  p_valor         numeric,
  p_observacao    text,
  p_etiquetas     uuid[],
  p_status        text default 'pago'
)
returns uuid
language plpgsql security invoker
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_membro() then
    raise exception 'Acesso negado';
  end if;

  if p_id is null then
    insert into lancamentos (data, categoria_id, fornecedor_id, descricao, valor, observacao, status)
    values (p_data, p_categoria_id, p_fornecedor_id, nullif(trim(p_descricao), ''), p_valor,
            nullif(trim(p_observacao), ''), coalesce(p_status, 'pago'))
    returning id into v_id;
  else
    update lancamentos set
      data          = p_data,
      categoria_id  = p_categoria_id,
      fornecedor_id = p_fornecedor_id,
      descricao     = nullif(trim(p_descricao), ''),
      valor         = p_valor,
      observacao    = nullif(trim(p_observacao), ''),
      status        = coalesce(p_status, 'pago'),
      atualizado_em = now()
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Lançamento não encontrado';
    end if;
    delete from lancamento_etiquetas where lancamento_id = v_id;
  end if;

  insert into lancamento_etiquetas (lancamento_id, etiqueta_id)
  select distinct v_id, e from unnest(coalesce(p_etiquetas, '{}'::uuid[])) as e;

  return v_id;
end $$;

revoke execute on function public.salvar_lancamento(uuid, date, uuid, uuid, text, numeric, text, uuid[], text) from public, anon;
grant execute on function public.salvar_lancamento(uuid, date, uuid, uuid, text, numeric, text, uuid[], text) to authenticated;

-- Dar baixa (marcar como pago/recebido) informando a data efetiva
create or replace function public.baixar_lancamento(p_id uuid, p_data date)
returns void
language plpgsql security invoker
set search_path = public
as $$
begin
  if not public.is_membro() then
    raise exception 'Acesso negado';
  end if;
  update lancamentos
     set status = 'pago', data = p_data, atualizado_em = now()
   where id = p_id;
end $$;

revoke execute on function public.baixar_lancamento(uuid, date) from public, anon;
grant execute on function public.baixar_lancamento(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Novos clientes por mês (para CAC por cliente)
-- ---------------------------------------------------------------------
create table if not exists public.clientes_novos (
  ano         int not null check (ano between 2000 and 2100),
  mes         int not null check (mes between 1 and 12),
  quantidade  int not null default 0 check (quantidade >= 0),
  primary key (ano, mes)
);

alter table public.clientes_novos enable row level security;
drop policy if exists "membros acesso total" on public.clientes_novos;
create policy "membros acesso total" on public.clientes_novos for all to authenticated
  using (public.is_membro()) with check (public.is_membro());
grant select, insert, update, delete on public.clientes_novos to authenticated;
revoke all on public.clientes_novos from anon;

-- ---------------------------------------------------------------------
-- 4. Importação em lote (tudo ou nada) e histórico de importações
--    p_itens: [{data, categoria_id, fornecedor_id, descricao, valor,
--               observacao, status, etiquetas: [uuid]}]
-- ---------------------------------------------------------------------
create or replace function public.importar_lancamentos(p_itens jsonb)
returns uuid
language plpgsql security invoker
set search_path = public
as $$
declare
  v_lote uuid := gen_random_uuid();
  v_id   uuid;
  r      jsonb;
begin
  if not public.is_membro() then
    raise exception 'Acesso negado';
  end if;

  for r in select * from jsonb_array_elements(p_itens) loop
    insert into lancamentos (data, categoria_id, fornecedor_id, descricao, valor, observacao, status, lote_importacao)
    values (
      (r ->> 'data')::date,
      (r ->> 'categoria_id')::uuid,
      nullif(r ->> 'fornecedor_id', '')::uuid,
      nullif(trim(r ->> 'descricao'), ''),
      (r ->> 'valor')::numeric,
      nullif(trim(r ->> 'observacao'), ''),
      coalesce(nullif(r ->> 'status', ''), 'pago'),
      v_lote
    )
    returning id into v_id;

    insert into lancamento_etiquetas (lancamento_id, etiqueta_id)
    select distinct v_id, x::uuid
    from jsonb_array_elements_text(coalesce(r -> 'etiquetas', '[]'::jsonb)) as x;
  end loop;

  return v_lote;
end $$;

create or replace function public.listar_importacoes()
returns table (lote uuid, quantidade bigint, total numeric, data_inicio date, data_fim date, importado_em timestamptz)
language sql stable security invoker
set search_path = public
as $$
  select lote_importacao, count(*), sum(valor), min(data), max(data), min(criado_em)
  from lancamentos
  where lote_importacao is not null
  group by lote_importacao
  order by min(criado_em) desc
  limit 50;
$$;

revoke execute on function public.importar_lancamentos(jsonb) from public, anon;
revoke execute on function public.listar_importacoes() from public, anon;
grant execute on function public.importar_lancamentos(jsonb) to authenticated;
grant execute on function public.listar_importacoes() to authenticated;
