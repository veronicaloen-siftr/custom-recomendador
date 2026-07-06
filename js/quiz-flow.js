import { PRODUCTS } from './products.js';

const CHICKEN_PRODUCTS = new Set([
  'angus-beef',
  'angus-beef-puppy',
  'chicken-mini',
  'salmon-mini',
]);

const BEEF_PRODUCTS = new Set(['angus-beef', 'angus-beef-puppy']);

const FISH_PRODUCTS = new Set(['salmon', 'tuna', 'salmon-mini']);

const MINI_ONLY = new Set(['chicken-mini', 'salmon-mini']);

const ADULT_STANDARD = [
  'angus-beef',
  'rabbit',
  'lamb',
  'salmon',
  'turkey',
  'tuna',
];

const ALL_PRODUCT_IDS = Object.keys(PRODUCTS);

export function normalizeConditions(raw = []) {
  return raw.filter((c) => c !== 'none');
}

/**
 * @param {import('./recommendation-engine.js').QuizAnswers} answers
 */
function applyAllergyFilters(answers) {
  const excluded = new Set();
  const alerts = [];
  const notes = [];

  const hasAllergy =
    answers.conditions?.includes('allergy') && answers.allergies?.length > 0;

  if (!hasAllergy) return { excluded, alerts, notes };

  const allergies = new Set(answers.allergies);

  if (allergies.has('pollo')) {
    CHICKEN_PRODUCTS.forEach((id) => excluded.add(id));
  }
  if (allergies.has('ternera')) {
    BEEF_PRODUCTS.forEach((id) => excluded.add(id));
  }
  if (allergies.has('pescado')) {
    FISH_PRODUCTS.forEach((id) => excluded.add(id));
    excluded.add('turkey');
  }
  if (allergies.has('conejo')) excluded.add('rabbit');
  if (allergies.has('cordero')) excluded.add('lamb');
  if (allergies.has('pato')) {
    excluded.add('rabbit');
    excluded.add('lamb');
  }

  return { excluded, alerts, notes };
}

function filterExcluded(excluded, candidates) {
  return candidates.filter((id) => !excluded.has(id));
}

/**
 * Devuelve productos aún posibles con las respuestas parciales actuales.
 * @param {Partial<import('./recommendation-engine.js').QuizAnswers>} answers
 */
export function getEligibleProductIds(answers) {
  const conditions = normalizeConditions(answers.conditions || []);
  const { excluded } = applyAllergyFilters({ ...answers, conditions });

  if (conditions.includes('digestive_diagnosed')) {
    const ids = filterExcluded(excluded, ['gastrointestinal']);
    return {
      ids: new Set(ids),
      locked: true,
      reason: 'Problema digestivo diagnosticado → línea Gastrointestinal (Custom Vet)',
    };
  }

  if (conditions.includes('obesity_diagnosed')) {
    const ids = filterExcluded(excluded, ['obesity']);
    return {
      ids: new Set(ids),
      locked: true,
      reason: 'Obesidad diagnosticada → línea Obesity (Custom Vet)',
    };
  }

  if (answers.age === 'puppy') {
    if (!excluded.has('angus-beef-puppy')) {
      return {
        ids: new Set(['angus-beef-puppy']),
        locked: true,
        reason: 'Cachorro → Angus Beef Puppy (única receta puppy del catálogo)',
      };
    }

    const fallbacks = filterExcluded(excluded, [
      'salmon',
      'turkey',
      'rabbit',
      'lamb',
    ]);
    return {
      ids: new Set(fallbacks),
      locked: false,
      reason:
        'Las alergias descartan Angus Beef Puppy. Necesitamos afinar con un par de datos más.',
    };
  }

  let ids = new Set(filterExcluded(excluded, ALL_PRODUCT_IDS));
  ids.delete('angus-beef-puppy');
  ids.delete('gastrointestinal');
  ids.delete('obesity');

  if (answers.size === 'mini') {
    const miniIds = filterExcluded(excluded, ['chicken-mini', 'salmon-mini']);
    ids = new Set(miniIds.length ? miniIds : filterExcluded(excluded, ['salmon', 'turkey']));
  } else if (answers.size) {
    MINI_ONLY.forEach((id) => ids.delete(id));
  }

  if (conditions.includes('allergy') && answers.allergies?.length) {
    ids = new Set([...ids].filter((id) => !excluded.has(id)));
  }

  if (conditions.includes('skin_coat') && answers.size === 'mini') {
    const skinMini = filterExcluded(excluded, ['salmon-mini', 'chicken-mini']);
    if (skinMini.length) ids = new Set(skinMini);
  } else if (conditions.includes('skin_coat')) {
    const skinAdult = filterExcluded(excluded, ['salmon', 'turkey', 'tuna']);
    if (skinAdult.length) ids = new Set(skinAdult);
  } else if (conditions.includes('digestive_mild')) {
    const digest = filterExcluded(excluded, ['salmon', 'turkey', 'tuna']);
    if (digest.length) ids = new Set(digest);
  } else if (conditions.includes('obesity_mild')) {
    const light = filterExcluded(excluded, ['salmon', 'turkey', 'tuna']);
    if (light.length) ids = new Set(light);
  } else if (conditions.includes('allergy')) {
    const hypo = filterExcluded(excluded, ['salmon', 'turkey', 'rabbit', 'lamb', 'tuna']);
    if (hypo.length) ids = new Set(hypo);
  }

  if (ids.size === 0) {
    ids = new Set(filterExcluded(excluded, ADULT_STANDARD));
  }

  return { ids, locked: false, reason: null };
}

export const STEP = {
  NAME: 'name',
  AGE: 'age',
  HEALTH: 'health',
  SIZE: 'size',
  ACTIVITY: 'activity',
  BODY: 'body',
};

export function isNormalProfile(answers) {
  return normalizeConditions(answers.conditions || []).length === 0;
}

export function isHealthComplete(answers) {
  const raw = answers.conditions || [];
  if (raw.length === 0) return false;
  if (raw.includes('none') && normalizeConditions(raw).length === 0) return true;

  const conditions = normalizeConditions(raw);
  if (conditions.includes('allergy')) {
    return (answers.allergies || []).length > 0;
  }
  return conditions.length > 0;
}

/**
 * Cola dinámica de pasos según respuestas parciales.
 * @param {Partial<import('./recommendation-engine.js').QuizAnswers>} answers
 */
export function buildStepQueue(answers) {
  const queue = [STEP.NAME, STEP.AGE];

  if (!answers.age) return queue;

  queue.push(STEP.HEALTH);

  if (!isHealthComplete(answers)) return queue;

  const { locked } = getEligibleProductIds(answers);

  if (locked) return queue;

  // Perfil sano: recorrer todo el cuestionario para afinar, sin acortar pasos
  if (isNormalProfile(answers) && answers.age !== 'puppy') {
    queue.push(STEP.SIZE, STEP.ACTIVITY, STEP.BODY);
    return queue;
  }

  if (answers.age === 'puppy') {
    queue.push(STEP.SIZE);
    return queue;
  }

  queue.push(STEP.SIZE, STEP.ACTIVITY, STEP.BODY);
  return queue;
}

export function canFinishEarly(answers) {
  if (!answers.age || !isHealthComplete(answers)) return false;
  const { locked } = getEligibleProductIds(answers);
  return locked;
}

export function getFlowContext(answers) {
  if (!answers.age) return null;

  const { ids, locked, reason } = getEligibleProductIds(answers);

  if (!isHealthComplete(answers)) {
    if (answers.age === 'puppy') {
      return 'En cachorros, nuestra receta específica es Angus Beef Puppy. Cuéntanos si hay alguna condición de salud.';
    }
    return null;
  }

  if (locked && reason) return reason;

  const conditions = normalizeConditions(answers.conditions || []);

  if (
    answers.bodyCondition === 'overweight' &&
    !conditions.includes('obesity_diagnosed')
  ) {
    return 'Sobrepeso leve: priorizamos recetas ligeras (Salmon, Turkey, Tuna). Si tu veterinario ha diagnosticado obesidad, vuelve atrás y marca «Obesidad diagnosticada → línea Obesity (Custom Vet)».';
  }

  if (isNormalProfile(answers) && answers.age !== 'puppy') {
    return 'Perfil sano: toda la gama adulto es compatible para rotar. Ajustamos el plan según tamaño, actividad y peso.';
  }

  if (ids.size <= 6) {
    const names = [...ids].map((id) => PRODUCTS[id]?.name).filter(Boolean);
    return `Opciones compatibles: ${names.join(', ')}.`;
  }

  return null;
}

export function getDefaultsForSkippedSteps(answers, queue) {
  /** @type {Partial<import('./recommendation-engine.js').QuizAnswers>} */
  const defaults = {};

  if (!queue.includes(STEP.SIZE)) defaults.size = 'medium';
  if (!queue.includes(STEP.ACTIVITY)) defaults.activity = 'medium';
  if (!queue.includes(STEP.BODY)) {
    defaults.bodyCondition = 'normal';
    defaults.neutered = false;
  }

  return defaults;
}

export function getEligibleProductNames(answers) {
  const { ids } = getEligibleProductIds(answers);
  return [...ids].map((id) => PRODUCTS[id]?.name).filter(Boolean);
}
