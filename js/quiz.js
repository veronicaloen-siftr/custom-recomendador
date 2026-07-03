import { PROTEIN_ALLERGIES } from './products.js';
import { getRecommendation } from './recommendation-engine.js';
import {
  STEP,
  buildStepQueue,
  canFinishEarly,
  getFlowContext,
  getDefaultsForSkippedSteps,
  isHealthComplete,
} from './quiz-flow.js';

const screens = {
  intro: document.querySelector('[data-screen="intro"]'),
  questions: document.querySelector('[data-screen="questions"]'),
  results: document.querySelector('[data-screen="results"]'),
};

const form = document.getElementById('quiz-form');
const stepElements = Object.fromEntries(
  [...document.querySelectorAll('.quiz-step[data-step-id]')].map((el) => [
    el.dataset.stepId,
    el,
  ])
);

const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const stepError = document.getElementById('step-error');
const flowContext = document.getElementById('flow-context');
const allergyPanel = document.getElementById('allergy-panel');
const allergyOptions = document.getElementById('allergy-options');

const btnPrev = document.querySelector('[data-action="prev"]');
const btnNext = document.querySelector('[data-action="next"]');
const btnSubmit = document.querySelector('[data-action="submit"]');

let queueIndex = 0;
let stepQueue = [STEP.NAME];

init();

function init() {
  renderAllergyOptions();

  document.querySelector('[data-action="start"]').addEventListener('click', () => {
    showScreen('questions');
    refreshFlow();
  });

  btnPrev.addEventListener('click', () => goRelative(-1));
  btnNext.addEventListener('click', () => {
    const stepId = stepQueue[queueIndex];
    if (!validateStep(stepId)) return;
    goRelative(1);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const stepId = stepQueue[queueIndex];
    if (!validateStep(stepId)) return;
    if (!isFlowComplete()) return;
    showResults(collectAnswers());
  });

  document.querySelector('[data-action="restart"]').addEventListener('click', restart);
  document.querySelector('[data-action="edit"]').addEventListener('click', backToQuestions);

  form.querySelectorAll('[name="conditions"]').forEach((input) => {
    input.addEventListener('change', () => {
      handleConditionsChange();
      refreshFlow();
    });
  });

  form.addEventListener('change', (e) => {
    hideError();
    if (e.target.name === 'age') {
      clearFieldsForSteps([STEP.SIZE, STEP.ACTIVITY, STEP.BODY]);
    }
    if (e.target.name === 'conditions' || e.target.name === 'allergies') {
      clearFieldsForSteps([STEP.SIZE, STEP.ACTIVITY, STEP.BODY]);
    }
    refreshFlow();
  });

  form.addEventListener('input', () => refreshFlow());
}

function renderAllergyOptions() {
  allergyOptions.innerHTML = PROTEIN_ALLERGIES.map(
    (item) => `
      <label class="checkbox-card">
        <input type="checkbox" name="allergies" value="${item.id}" />
        <span>${item.label}</span>
      </label>
    `
  ).join('');
}

function handleConditionsChange() {
  const conditionInputs = [...form.querySelectorAll('[name="conditions"]')];
  const noneInput = conditionInputs.find((i) => i.value === 'none');
  const allergyInput = conditionInputs.find((i) => i.value === 'allergy');
  const checked = conditionInputs.filter((i) => i.checked);

  if (noneInput?.checked && checked.length > 1) {
    conditionInputs.forEach((i) => {
      if (i !== noneInput) i.checked = false;
    });
  } else if (checked.some((i) => i.value !== 'none') && noneInput?.checked) {
    noneInput.checked = false;
  }

  const showAllergy = allergyInput?.checked;
  allergyPanel.hidden = !showAllergy;

  if (!showAllergy) {
    form.querySelectorAll('[name="allergies"]').forEach((i) => {
      i.checked = false;
    });
  }
}

function showScreen(name) {
  Object.values(screens).forEach((el) => {
    el.classList.remove('is-active');
    el.hidden = true;
  });
  screens[name].classList.add('is-active');
  screens[name].hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getPartialAnswers() {
  const conditions = getCheckedValues('conditions');

  return {
    dogName: form.querySelector('#dog-name').value.trim(),
    age: form.querySelector('[name="age"]:checked')?.value,
    size: form.querySelector('[name="size"]:checked')?.value,
    activity: form.querySelector('[name="activity"]:checked')?.value,
    bodyCondition: form.querySelector('[name="bodyCondition"]:checked')?.value,
    neutered: form.querySelector('[name="neutered"]:checked')?.value === 'yes',
    conditions,
    allergies: getCheckedValues('allergies'),
  };
}

function refreshFlow() {
  const partial = getPartialAnswers();
  const previousStepId = stepQueue[queueIndex];
  stepQueue = buildStepQueue(partial);

  if (previousStepId && stepQueue.includes(previousStepId)) {
    queueIndex = stepQueue.indexOf(previousStepId);
  } else {
    queueIndex = Math.min(queueIndex, stepQueue.length - 1);
  }

  updateStepUI();
}

function goRelative(delta) {
  hideError();
  const partial = getPartialAnswers();
  stepQueue = buildStepQueue(partial);

  const nextIndex = queueIndex + delta;

  if (delta > 0 && nextIndex >= stepQueue.length) {
    if (isFlowComplete()) {
      showResults(collectAnswers());
    }
    return;
  }

  queueIndex = Math.max(0, Math.min(nextIndex, stepQueue.length - 1));
  syncStepPanels();
  updateStepUI();
  focusCurrentStep();
}

function updateStepUI() {
  const currentStepId = stepQueue[queueIndex];

  Object.entries(stepElements).forEach(([id, el]) => {
    el.classList.toggle('is-active', id === currentStepId);
  });

  const progress = ((queueIndex + 1) / stepQueue.length) * 100;
  progressFill.style.width = `${progress}%`;
  progressLabel.textContent = `Paso ${queueIndex + 1} de ${stepQueue.length}`;

  const legend = stepElements[currentStepId]?.querySelector('.step-legend');
  if (legend) {
    document.getElementById('step-title').textContent = legend.textContent;
  }

  const context = getFlowContext(getPartialAnswers());
  if (context) {
    flowContext.textContent = context;
    flowContext.hidden = false;
  } else {
    flowContext.hidden = true;
    flowContext.textContent = '';
  }

  syncStepPanels();
  updateNavButtons();
}

function syncStepPanels() {
  handleConditionsChange();
}

function focusCurrentStep() {
  const currentStepId = stepQueue[queueIndex];
  const stepEl = stepElements[currentStepId];
  if (!stepEl) return;

  const focusable = stepEl.querySelector(
    'input:not([type="hidden"]), select, textarea, button'
  );
  focusable?.focus({ preventScroll: true });
}

function backToQuestions() {
  hideError();
  showScreen('questions');

  const partial = getPartialAnswers();
  stepQueue = buildStepQueue(partial);
  queueIndex = Math.max(0, stepQueue.length - 1);

  syncStepPanels();
  updateStepUI();
  focusCurrentStep();
}

function isStepComplete(stepId) {
  if (stepId === STEP.NAME) return true;
  if (stepId === STEP.AGE) return Boolean(form.querySelector('[name="age"]:checked'));
  if (stepId === STEP.SIZE) return Boolean(form.querySelector('[name="size"]:checked'));
  if (stepId === STEP.ACTIVITY) return Boolean(form.querySelector('[name="activity"]:checked'));
  if (stepId === STEP.BODY) {
    return (
      Boolean(form.querySelector('[name="bodyCondition"]:checked')) &&
      Boolean(form.querySelector('[name="neutered"]:checked'))
    );
  }
  if (stepId === STEP.HEALTH) {
    return isHealthComplete(getPartialAnswers());
  }
  return false;
}

function isFlowComplete() {
  const partial = getPartialAnswers();
  stepQueue = buildStepQueue(partial);

  for (const stepId of stepQueue) {
    if (stepId === STEP.NAME) continue;
    if (!isStepComplete(stepId)) return false;
  }

  return true;
}

function isLastStepInQueue() {
  return queueIndex >= stepQueue.length - 1;
}

function toggleBtn(btn, visible) {
  btn.hidden = !visible;
  btn.style.display = visible ? 'inline-flex' : 'none';
}

function updateNavButtons() {
  const currentStepId = stepQueue[queueIndex];
  const currentReady = isStepComplete(currentStepId);
  const lastStep = isLastStepInQueue();
  const flowComplete = isFlowComplete();
  const earlyFinish = canFinishEarly(getPartialAnswers());

  toggleBtn(btnPrev, queueIndex > 0 && stepQueue.length > 1);

  if (lastStep && currentReady && (flowComplete || earlyFinish)) {
    toggleBtn(btnNext, false);
    toggleBtn(btnSubmit, true);
    return;
  }

  toggleBtn(btnSubmit, false);

  if (lastStep) {
    toggleBtn(btnNext, false);
    return;
  }

  toggleBtn(btnNext, currentReady);
}

function validateStep(stepId) {
  hideError();

  if (isStepComplete(stepId)) return true;

  if (stepId === STEP.AGE) return showError('Selecciona la etapa de vida de tu perro.');
  if (stepId === STEP.SIZE) return showError('Indica el tamaño de tu perro.');
  if (stepId === STEP.ACTIVITY) return showError('Selecciona su nivel de actividad.');

  if (stepId === STEP.BODY) {
    if (!form.querySelector('[name="bodyCondition"]:checked')) {
      return showError('Indica su condición corporal.');
    }
    return showError('Indica si está castrado o esterilizado.');
  }

  if (stepId === STEP.HEALTH) {
    const conditions = getCheckedValues('conditions');
    if (conditions.length === 0) {
      return showError('Marca al menos una opción de salud (puede ser «Ninguna»).');
    }
    if (conditions.includes('allergy') && getCheckedValues('allergies').length === 0) {
      return showError('Indica a qué proteína es alérgico o intolerante.');
    }
  }

  return true;
}

function getCheckedValues(name) {
  return [...form.querySelectorAll(`[name="${name}"]:checked`)].map((i) => i.value);
}

function clearFieldsForSteps(stepIds) {
  if (stepIds.includes(STEP.SIZE)) {
    form.querySelectorAll('[name="size"]').forEach((i) => {
      i.checked = false;
    });
  }
  if (stepIds.includes(STEP.ACTIVITY)) {
    form.querySelectorAll('[name="activity"]').forEach((i) => {
      i.checked = false;
    });
  }
  if (stepIds.includes(STEP.BODY)) {
    form.querySelectorAll('[name="bodyCondition"], [name="neutered"]').forEach((i) => {
      i.checked = false;
    });
  }
}

function showError(message) {
  stepError.textContent = message;
  stepError.hidden = false;
  return false;
}

function hideError() {
  stepError.hidden = true;
  stepError.textContent = '';
}

function collectAnswers() {
  const partial = getPartialAnswers();
  stepQueue = buildStepQueue(partial);
  const defaults = getDefaultsForSkippedSteps(partial, stepQueue);

  const conditions = partial.conditions.includes('none')
    ? []
    : partial.conditions.filter((c) => c !== 'none');

  return {
    dogName: partial.dogName,
    age: partial.age || 'adult',
    size: partial.size || defaults.size,
    activity: partial.activity || defaults.activity,
    bodyCondition: partial.bodyCondition || defaults.bodyCondition,
    neutered: partial.neutered ?? defaults.neutered,
    conditions,
    allergies: partial.allergies,
  };
}

function showResults(answers) {
  const result = getRecommendation(answers);

  document.getElementById('result-dog-name').textContent = result.dogName;
  document.getElementById('result-summary').textContent = result.summary;
  document.getElementById('result-rotation-label').textContent = result.rotationLabel;
  document.getElementById('result-highlight').textContent = result.highlight;

  renderProductCards(result.products, 'product-cards');
  renderAdditionalProductCards(result.additionalProducts || []);
  renderMessageStack('result-alerts', result.alerts, 'alert-item');
  renderMessageStack('result-notes', result.notes, 'note-item');

  showScreen('results');
}

function renderProductCards(products, containerId = 'product-cards') {
  const container = document.getElementById(containerId);
  container.innerHTML = products.map((p) => renderProductCardHtml(p)).join('');
}

function renderAdditionalProductCards(products) {
  const section = document.getElementById('product-cards-extra');
  const container = document.getElementById('product-cards-additional');

  if (!products.length) {
    section.hidden = true;
    container.innerHTML = '';
    return;
  }

  section.hidden = false;
  container.innerHTML = products
    .map((p) => renderProductCardHtml(p, { variant: 'additional' }))
    .join('');
}

function renderProductCardHtml(p, options = {}) {
  const { variant = 'primary' } = options;
  const cardClass =
    variant === 'additional'
      ? 'product-card product-card--additional'
      : `product-card ${p.isVet ? 'is-vet' : ''}`.trim();

  return `
    <article class="${cardClass}">
      <div class="product-card-header">
        <h3 class="product-name">${escapeHtml(p.name)}</h3>
        <span class="product-badge product-badge--role">${escapeHtml(p.suggestedRole)}</span>
      </div>
      ${p.isVet ? '<span class="product-badge product-badge--vet">Custom Vet</span>' : ''}
      <p class="product-desc">${escapeHtml(p.description)}</p>
      <div class="product-tags">
        ${(p.tags || []).map((t) => `<span class="tag">${formatTag(t)}</span>`).join('')}
        ${p.em ? `<span class="tag">${p.em.toLocaleString('es-ES')} kcal/kg</span>` : ''}
      </div>
      <a class="btn btn-primary product-link" href="${p.url}" target="_blank" rel="noopener">
        Ver producto
      </a>
    </article>
  `;
}

function renderMessageStack(elementId, messages, className) {
  const el = document.getElementById(elementId);
  if (!messages.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = messages.map((m) => `<div class="${className}">${escapeHtml(m)}</div>`).join('');
}

function formatTag(tag) {
  const map = {
    'grain-free': 'Grain free',
    'low-grain': 'Low grain',
    monoprotein: 'Monoproteína',
    hipoalergenico: 'Hipoalergénico',
    mini: 'Mini',
    puppy: 'Puppy',
    vet: 'Veterinaria',
    digestivo: 'Digestivo',
    'control-peso': 'Control de peso',
    'skin-coat': 'Skin & coat',
    energy: 'Energy',
    heart: 'Heart',
    'epa-dha': 'EPA/DHA',
  };
  return map[tag] || tag;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function restart() {
  form.reset();
  queueIndex = 0;
  stepQueue = [STEP.NAME];
  allergyPanel.hidden = true;
  flowContext.hidden = true;
  hideError();
  showScreen('intro');
}
