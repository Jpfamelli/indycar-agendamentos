-- Agenda — rodada 3 (13/10/2026). Migração `ag_consultor_perfil` (só aditiva).
-- Liga (opcionalmente) um consultor a um login da equipe (perfis): é isso que
-- permite "Minha agenda", tarefa automática para o consultor certo e a
-- notificação de atraso para quem vai atender.
alter table public.consultores
  add column if not exists perfil_id uuid references public.perfis(id) on delete set null;
-- um login vira no máximo UM consultor (evita "minha agenda" ambígua); serve de índice da FK
create unique index if not exists consultores_perfil_uk on public.consultores (perfil_id) where perfil_id is not null;
-- (a carga por consultor no dia já usa agendamentos_slot_uk (consultor_id, data, hora))
