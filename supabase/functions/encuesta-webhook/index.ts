import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SurveyPayload = {
  source?: string;
  submittedAt?: string;
  email?: string | null;
  nombre?: string | null;
  perro?: string | null;
  reason?: string;
  reasonLabel?: string;
  improvement?: string | null;
  intent?: string;
  intentLabel?: string;
  pageUrl?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parseSubmittedAt(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  if (webhookSecret) {
    const provided =
      req.headers.get('x-webhook-secret') ||
      new URL(req.url).searchParams.get('secret');
    if (provided !== webhookSecret) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
  }

  let body: SurveyPayload;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.reason || !body.intent) {
    return jsonResponse({ error: 'Missing required fields: reason, intent' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await supabase.from('encuesta_recaptacion').insert({
    source: body.source ?? 'encuesta-recaptacion',
    submitted_at: parseSubmittedAt(body.submittedAt),
    email: body.email ?? null,
    nombre: body.nombre ?? null,
    perro: body.perro ?? null,
    reason: body.reason,
    reason_label: body.reasonLabel ?? null,
    improvement: body.improvement ?? null,
    intent: body.intent,
    intent_label: body.intentLabel ?? null,
    page_url: body.pageUrl ?? null,
  });

  if (error) {
    console.error('encuesta-webhook insert error:', error.message);
    return jsonResponse({ error: 'Failed to save response' }, 500);
  }

  return jsonResponse({ ok: true });
});
