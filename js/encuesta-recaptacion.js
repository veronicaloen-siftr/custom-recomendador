import { SURVEY_WEBHOOK_URL } from './survey-config.js';

const form = document.getElementById('survey-form');
const errorEl = document.getElementById('survey-error');
const greetingEl = document.getElementById('greeting');
const emailField = document.getElementById('field-email');
const screens = {
  form: document.querySelector('[data-screen="form"]'),
  thanks: document.querySelector('[data-screen="thanks"]'),
};

let contactNombre = '';
let contactPerro = '';

const REASON_LABELS = {
  precio: 'Precio',
  otra_marca: 'Otra marca',
  digestion: 'Digestion o tolerancia',
  envio: 'Envio o disponibilidad',
  tienda_fisica: 'Compro en tienda',
  pausa: 'Solo una pausa',
  situacion: 'Cambio de situacion',
  otro: 'Otro motivo',
};

const INTENT_LABELS = {
  si_pronto: 'Si, pronto',
  quizas: 'Quizas',
  no: 'No por ahora',
};

init();

function init() {
  const params = new URLSearchParams(window.location.search);
  const nombre = params.get('nombre') || params.get('firstname') || '';
  const email = params.get('email') || '';
  const perro = params.get('perro') || params.get('dog') || '';
  const leadEl = document.getElementById('survey-lead');

  contactNombre = nombre;
  contactPerro = perro;

  if (nombre) {
    greetingEl.textContent = `Hola ${nombre}`;
  }

  if (perro && leadEl) {
    leadEl.textContent = `Queremos mejorar la experiencia de ${perro} y la tuya. Solo unas preguntas rapidas y sinceras.`;
  }

  if (email) {
    emailField.value = email;
  }

  form.addEventListener('submit', onSubmit);
  form.addEventListener('change', hideError);
}

function onSubmit(e) {
  e.preventDefault();
  hideError();

  const reason = form.querySelector('[name="reason"]:checked');
  const intent = form.querySelector('[name="intent"]:checked');

  if (!reason) {
    showError('Selecciona el motivo principal.');
    return;
  }

  if (!intent) {
    showError('Indica si te planteas volver a comprar.');
    return;
  }

  const payload = {
    source: 'encuesta-recaptacion',
    submittedAt: new Date().toISOString(),
    email: emailField.value || null,
    nombre: contactNombre || null,
    perro: contactPerro || null,
    reason: reason.value,
    reasonLabel: REASON_LABELS[reason.value] || reason.value,
    improvement: form.improvement.value.trim() || null,
    intent: intent.value,
    intentLabel: INTENT_LABELS[intent.value] || intent.value,
    pageUrl: window.location.href,
  };

  submitPayload(payload);
}

async function submitPayload(payload) {
  const params = new URLSearchParams(window.location.search);
  const webhook = params.get('webhook') || SURVEY_WEBHOOK_URL;

  if (!webhook) {
    console.warn('Encuesta: configura SURVEY_WEBHOOK_URL en js/survey-config.js');
    showThanks();
    return;
  }

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn('Encuesta: el webhook respondio con error', response.status);
    }
  } catch (error) {
    console.warn('Encuesta: no se pudo enviar al webhook', error);
  }

  showThanks();
}

function showThanks() {
  screens.form.classList.remove('is-active');
  screens.form.hidden = true;
  screens.thanks.classList.add('is-active');
  screens.thanks.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
  errorEl.hidden = true;
  errorEl.textContent = '';
}
