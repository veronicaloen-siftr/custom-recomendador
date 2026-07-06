-- Consultas utiles en Supabase SQL Editor

-- Ultimas respuestas
select
  created_at,
  nombre,
  email,
  reason_label,
  intent_label,
  improvement
from public.encuesta_recaptacion
order by created_at desc
limit 50;

-- Motivos mas frecuentes
select reason_label, count(*) as total
from public.encuesta_recaptacion
group by reason_label
order by total desc;

-- Contactos que volverian pronto
select nombre, email, reason_label, improvement, created_at
from public.encuesta_recaptacion
where intent = 'si_pronto'
order by created_at desc;
