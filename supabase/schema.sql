-- =====================================================================
-- Magnética · Sistema Financeiro
-- Rode este arquivo inteiro no Supabase: SQL Editor → New query → Run.
-- Pode ser executado mais de uma vez sem duplicar dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Controle de acesso: só e-mails cadastrados em "membros" enxergam dados
-- ---------------------------------------------------------------------
create table if not exists public.membros (
  email      text primary key,
  nome       text,
  criado_em  timestamptz not null default now()
);

create or replace function public.is_membro()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membros m
    where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Estrutura: Grupo → Categoria → Fornecedor  (+ Etiquetas)
-- ---------------------------------------------------------------------
create table if not exists public.grupos (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null,
  -- entrada  = recebimentos
  -- saida    = pagamentos operacionais (entram no Resultado)
  -- retirada = antecipação de lucros (fica fora do Resultado)
  tipo   text not null check (tipo in ('entrada', 'saida', 'retirada')),
  ordem  int  not null default 0,
  ativo  boolean not null default true,
  unique (nome, tipo)
);

create table if not exists public.categorias (
  id        uuid primary key default gen_random_uuid(),
  grupo_id  uuid not null references public.grupos (id) on delete restrict,
  nome      text not null,
  ordem     int  not null default 0,
  ativo     boolean not null default true,
  unique (grupo_id, nome)  -- mesma categoria pode existir em grupos diferentes
);

create table if not exists public.fornecedores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  funcao      text,
  tipo        text not null default 'fornecedor'
              check (tipo in ('fornecedor', 'prestador', 'cliente')),
  observacao  text,
  ativo       boolean not null default true
);
create unique index if not exists fornecedores_nome_funcao_uk
  on public.fornecedores (lower(nome), lower(coalesce(funcao, '')));

create table if not exists public.etiquetas (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null unique,
  -- cac      = custo de aquisição de clientes
  -- cortesia = finalidade de mimos/brindes (módulo Cortesias)
  tipo   text not null default 'geral' check (tipo in ('cac', 'cortesia', 'geral')),
  cor    text not null default '#85867c',
  ativo  boolean not null default true
);

create table if not exists public.lancamentos (
  id             uuid primary key default gen_random_uuid(),
  data           date not null,
  categoria_id   uuid not null references public.categorias (id) on delete restrict,
  fornecedor_id  uuid references public.fornecedores (id) on delete restrict,
  descricao      text,
  valor          numeric(14, 2) not null check (valor > 0),
  observacao     text,
  criado_por     uuid default auth.uid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists lancamentos_data_idx       on public.lancamentos (data);
create index if not exists lancamentos_categoria_idx  on public.lancamentos (categoria_id);
create index if not exists lancamentos_fornecedor_idx on public.lancamentos (fornecedor_id);

create table if not exists public.lancamento_etiquetas (
  lancamento_id  uuid not null references public.lancamentos (id) on delete cascade,
  etiqueta_id    uuid not null references public.etiquetas (id) on delete restrict,
  primary key (lancamento_id, etiqueta_id)
);
create index if not exists lancamento_etiquetas_etiqueta_idx
  on public.lancamento_etiquetas (etiqueta_id);

-- ---------------------------------------------------------------------
-- 3. Segurança (RLS): acesso total para membros, nada para os demais
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['grupos','categorias','fornecedores','etiquetas','lancamentos','lancamento_etiquetas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "membros acesso total" on public.%I', t);
    execute format(
      'create policy "membros acesso total" on public.%I for all to authenticated
         using (public.is_membro()) with check (public.is_membro())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table public.membros enable row level security;
drop policy if exists "membros leem membros" on public.membros;
create policy "membros leem membros" on public.membros
  for select to authenticated using (public.is_membro());
grant select on public.membros to authenticated;
revoke all on public.membros from anon;

-- ---------------------------------------------------------------------
-- 4. Salvar lançamento + etiquetas numa única transação
-- ---------------------------------------------------------------------
create or replace function public.salvar_lancamento(
  p_id            uuid,
  p_data          date,
  p_categoria_id  uuid,
  p_fornecedor_id uuid,
  p_descricao     text,
  p_valor         numeric,
  p_observacao    text,
  p_etiquetas     uuid[]
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
    insert into lancamentos (data, categoria_id, fornecedor_id, descricao, valor, observacao)
    values (p_data, p_categoria_id, p_fornecedor_id, nullif(trim(p_descricao), ''), p_valor, nullif(trim(p_observacao), ''))
    returning id into v_id;
  else
    update lancamentos set
      data          = p_data,
      categoria_id  = p_categoria_id,
      fornecedor_id = p_fornecedor_id,
      descricao     = nullif(trim(p_descricao), ''),
      valor         = p_valor,
      observacao    = nullif(trim(p_observacao), ''),
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

revoke execute on function public.is_membro() from public, anon;
revoke execute on function public.salvar_lancamento(uuid, date, uuid, uuid, text, numeric, text, uuid[]) from public, anon;
grant execute on function public.is_membro() to authenticated;
grant execute on function public.salvar_lancamento(uuid, date, uuid, uuid, text, numeric, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Plano de categorias (extraído do relatório Acountech)
-- ---------------------------------------------------------------------
insert into public.grupos (nome, tipo, ordem) values
  ('Receitas de Serviços',            'entrada',  1),
  ('Eventos',                         'entrada',  2),
  ('Outras Receitas e Entradas',      'entrada',  3),
  ('Rendimentos de Aplicações',       'entrada',  4),
  ('Despesas Administrativas',        'saida',   10),
  ('Despesas com Pessoal',            'saida',   11),
  ('Despesas de Vendas e Marketing',  'saida',   12),
  ('Despesas Operacionais',           'saida',   13),
  ('Despesas Financeiras',            'saida',   14),
  ('Eventos',                         'saida',   15),
  ('Impostos',                        'saida',   16),
  ('Outras Despesas e Saídas',        'saida',   17),
  ('Retirada de Lucro',               'retirada', 90)
on conflict (nome, tipo) do nothing;

insert into public.categorias (grupo_id, nome, ordem)
select g.id, c.nome, c.ordem
from (values
  -- Recebimentos
  ('Eventos', 'entrada', 'Impulse Med', 1),
  ('Eventos', 'entrada', 'Patrocínios Recebidos', 2),
  ('Outras Receitas e Entradas', 'entrada', 'Adiantamentos para Futuros Aumentos de Capital (AFAC)', 1),
  ('Outras Receitas e Entradas', 'entrada', 'Devoluções e Restituições', 2),
  ('Outras Receitas e Entradas', 'entrada', 'Receitas a Identificar', 3),
  ('Receitas de Serviços', 'entrada', 'Captação de Vídeo', 1),
  ('Receitas de Serviços', 'entrada', 'Curso: Instagram Estratégico', 2),
  ('Receitas de Serviços', 'entrada', 'Marketing Digital', 3),
  ('Receitas de Serviços', 'entrada', 'Plataforma de Atendimento CRM Med Mag', 4),
  ('Receitas de Serviços', 'entrada', 'Recortes Podcast', 5),
  ('Receitas de Serviços', 'entrada', 'Serviço Design', 6),
  ('Receitas de Serviços', 'entrada', 'Site', 7),
  ('Rendimentos de Aplicações', 'entrada', 'Receitas Financeiras', 1),
  -- Despesas Administrativas
  ('Despesas Administrativas', 'saida', 'Combustíveis', 1),
  ('Despesas Administrativas', 'saida', 'Computadores e Periféricos', 2),
  ('Despesas Administrativas', 'saida', 'Cursos e Treinamentos', 3),
  ('Despesas Administrativas', 'saida', 'Despesas com Cortesias', 4),
  ('Despesas Administrativas', 'saida', 'Ferramentas e Aplicativos', 5),
  ('Despesas Administrativas', 'saida', 'Fretes Pagos', 6),
  ('Despesas Administrativas', 'saida', 'Honorários Contábeis', 7),
  ('Despesas Administrativas', 'saida', 'INSS sobre Pró-labore (GPS)', 8),
  ('Despesas Administrativas', 'saida', 'Lanches e Refeições', 9),
  ('Despesas Administrativas', 'saida', 'Máquinas, Equipamentos e Instalações Industriais', 10),
  ('Despesas Administrativas', 'saida', 'Marcas e Patentes', 11),
  ('Despesas Administrativas', 'saida', 'Materiais de Escritório', 12),
  ('Despesas Administrativas', 'saida', 'Móveis, Utensílios e Instalações', 13),
  ('Despesas Administrativas', 'saida', 'Pró-labore', 14),
  ('Despesas Administrativas', 'saida', 'Serviço de Limpeza', 15),
  ('Despesas Administrativas', 'saida', 'Serviço de Terceiros', 16),
  ('Despesas Administrativas', 'saida', 'Taxas e Contribuições', 17),
  ('Despesas Administrativas', 'saida', 'Telefonia e Internet', 18),
  ('Despesas Administrativas', 'saida', 'Transporte Urbano (táxi, Uber)', 19),
  ('Despesas Administrativas', 'saida', 'Uso ou Consumo', 20),
  ('Despesas Administrativas', 'saida', 'Viagens e Representações', 21),
  -- Despesas com Pessoal
  ('Despesas com Pessoal', 'saida', 'Exames Médicos', 1),
  ('Despesas com Pessoal', 'saida', 'FGTS e Multa de FGTS', 2),
  ('Despesas com Pessoal', 'saida', 'INSS sobre Salários (GPS)', 3),
  ('Despesas com Pessoal', 'saida', 'Salários', 4),
  ('Despesas com Pessoal', 'saida', 'Uniformes', 5),
  -- Despesas de Vendas e Marketing
  ('Despesas de Vendas e Marketing', 'saida', 'Brindes para Clientes', 1),
  ('Despesas de Vendas e Marketing', 'saida', 'Marketing e Publicidade', 2),
  ('Despesas de Vendas e Marketing', 'saida', 'Tráfego Pago', 3),
  -- Despesas Financeiras
  ('Despesas Financeiras', 'saida', 'Tarifas de Boletos', 1),
  ('Despesas Financeiras', 'saida', 'Tarifas de Cartões de Crédito', 2),
  ('Despesas Financeiras', 'saida', 'Tarifas Kiwify', 3),
  ('Despesas Financeiras', 'saida', 'Tarifa Boleto – CA', 4),
  -- Despesas Operacionais
  ('Despesas Operacionais', 'saida', 'Ferramentas e Aplicativos', 1),
  ('Despesas Operacionais', 'saida', 'Imagem e Apresentação Profissional', 2),
  ('Despesas Operacionais', 'saida', 'Máquinas, Equipamentos e Instalações Industriais', 3),
  ('Despesas Operacionais', 'saida', 'Marcas e Patentes', 4),
  ('Despesas Operacionais', 'saida', 'Materiais Aplicados na Prestação de Serviços', 5),
  ('Despesas Operacionais', 'saida', 'Serviço de Terceiros', 6),
  ('Despesas Operacionais', 'saida', 'Sites e Hospedagens', 7),
  -- Demais grupos
  ('Eventos', 'saida', 'Eventos (geral)', 1),
  ('Impostos', 'saida', 'Simples Nacional (DAS)', 1),
  ('Outras Despesas e Saídas', 'saida', 'Reembolso de Clientes', 1),
  ('Retirada de Lucro', 'retirada', 'Antecipação de Lucros', 1)
) as c (grupo, tipo, nome, ordem)
join public.grupos g on g.nome = c.grupo and g.tipo = c.tipo
on conflict (grupo_id, nome) do nothing;

insert into public.fornecedores (nome, funcao, tipo)
select v.nome, v.funcao, v.tipo
from (values
  -- Ferramentas e Aplicativos
  ('Apple.com/Bill',          'Ferramenta / aplicativo', 'fornecedor'),
  ('Blow Up',                 'Ferramenta / aplicativo', 'fornecedor'),
  ('Claude',                  'Ferramenta / aplicativo', 'fornecedor'),
  ('Google',                  'Ferramenta / aplicativo', 'fornecedor'),
  ('iCloud',                  'Ferramenta / aplicativo', 'fornecedor'),
  ('Ikatec-Digisac',          'Ferramenta / aplicativo', 'fornecedor'),
  ('Nexla Automação e IA',    'Plataforma de atendimento', 'fornecedor'),
  ('Notion',                  'Ferramenta / aplicativo', 'fornecedor'),
  ('OpenAI (ChatGPT)',        'Ferramenta / aplicativo', 'fornecedor'),
  ('Pack de vídeos',          'Ferramenta / aplicativo', 'fornecedor'),
  ('Tactiq.io',               'Ferramenta / aplicativo', 'fornecedor'),
  ('Reportei',                'Ferramenta / aplicativo', 'fornecedor'),
  -- Marketing e Publicidade
  ('Papelaria',               'Marketing e publicidade', 'fornecedor'),
  ('Patrocínios',             'Marketing e publicidade', 'fornecedor'),
  -- Sites e Hospedagens
  ('Hostinger',               'Sites e hospedagens', 'fornecedor'),
  ('Spotify APM',             'Sites e hospedagens', 'fornecedor'),
  -- Serviço de Terceiros (prestadores)
  ('Acountech',               'BPO Financeiro', 'prestador'),
  ('Clarikésia',              'Editora de Reels', 'prestador'),
  ('Diversos',                null, 'prestador'),
  ('Gravação',                null, 'prestador'),
  ('Lavínia',                 'Social Media, Copy e Geral', 'prestador'),
  ('Mariana',                 'Gestora de Projetos', 'prestador'),
  ('Podcast',                 null, 'prestador'),
  ('Rafael',                  'Gestor de Tráfego', 'prestador'),
  ('Rafael',                  'Gravação', 'prestador'),
  ('Samuel',                  'Designer', 'prestador'),
  ('Talyta',                  'Social Media', 'prestador')
) as v (nome, funcao, tipo)
where not exists (
  select 1 from public.fornecedores f
  where lower(f.nome) = lower(v.nome)
    and lower(coalesce(f.funcao, '')) = lower(coalesce(v.funcao, ''))
);

insert into public.etiquetas (nome, tipo, cor) values
  ('CAC',                        'cac',      '#2b3fd6'),
  ('Mimo cliente',               'cortesia', '#e87ba4'),
  ('Mimo colaborador',           'cortesia', '#eda100'),
  ('Dia do Médico',              'cortesia', '#1baf7a'),
  ('Estratégia Ouro Branco',     'cortesia', '#eb6834'),
  ('Estratégia Google / bônus',  'cortesia', '#6250d6'),
  ('LTV (retenção)',             'cortesia', '#008300')
on conflict (nome) do nothing;

-- ---------------------------------------------------------------------
-- 6. LIBERE O ACESSO: troque pelos e-mails de quem vai usar o sistema.
--    A pessoa também precisa ter um usuário em Authentication → Users
--    com o mesmo e-mail.
-- ---------------------------------------------------------------------
-- insert into public.membros (email, nome) values
--   ('cliente@exemplo.com', 'Nome da cliente'),
--   ('voce@exemplo.com',    'Seu nome')
-- on conflict (email) do nothing;
