-- Respuestas de la encuesta de recaptacion (landing encuesta-recaptacion.html)
create table if not exists public.encuesta_recaptacion (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  source text not null default 'encuesta-recaptacion',
  email text,
  nombre text,
  perro text,
  reason text not null,
  reason_label text,
  improvement text,
  intent text not null,
  intent_label text,
  page_url text
);

create index if not exists encuesta_recaptacion_created_at_idx
  on public.encuesta_recaptacion (created_at desc);

create index if not exists encuesta_recaptacion_email_idx
  on public.encuesta_recaptacion (email);

create index if not exists encuesta_recaptacion_reason_idx
  on public.encuesta_recaptacion (reason);

create index if not exists encuesta_recaptacion_intent_idx
  on public.encuesta_recaptacion (intent);

alter table public.encuesta_recaptacion enable row level security;

-- Sin politicas publicas: solo la Edge Function (service_role) inserta filas.
