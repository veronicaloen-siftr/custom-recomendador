import { PRODUCTS } from './products.js';
import { getEligibleProductIds } from './quiz-flow.js';

const CHICKEN_PRODUCTS = new Set([
  'angus-beef',
  'angus-beef-puppy',
  'chicken-mini',
  'salmon-mini',
]);

const BEEF_PRODUCTS = new Set(['angus-beef', 'angus-beef-puppy']);

const FISH_PRODUCTS = new Set(['salmon', 'tuna', 'salmon-mini']);

const MINI_ONLY = new Set(['chicken-mini', 'salmon-mini']);

const ADULT_STANDARD = new Set([
  'angus-beef',
  'rabbit',
  'lamb',
  'salmon',
  'turkey',
  'tuna',
]);

/** Gama adulto estándar (mediana/grande) */
const ADULT_CATALOG = [
  'angus-beef',
  'rabbit',
  'lamb',
  'salmon',
  'turkey',
  'tuna',
];

const ENERGY_RECIPES = ['angus-beef', 'rabbit', 'lamb'];
const LIGHT_RECIPES = ['salmon', 'turkey', 'tuna'];

function isNormalHealthy(answers) {
  return (
    answers.conditions.length === 0 &&
    answers.bodyCondition !== 'overweight' &&
    answers.bodyCondition !== 'underweight'
  );
}

function getAdultCatalog(excluded, size) {
  if (size === 'mini') {
    return filterExcluded(excluded, ['chicken-mini', 'salmon-mini']);
  }
  return filterExcluded(excluded, ADULT_CATALOG);
}

/**
 * Perfil sano: elige 3 recetas de entrada desde toda la gama compatible,
 * priorizando actividad/edad pero sin excluir el resto del catálogo.
 */
function buildNormalRotation(answers, excluded) {
  const catalog = getAdultCatalog(excluded, answers.size);
  const energy = ENERGY_RECIPES.filter((id) => catalog.includes(id));
  const light = LIGHT_RECIPES.filter((id) => catalog.includes(id));
  const picked = [];

  const addFrom = (pool) => {
    for (const id of pool) {
      if (picked.length >= 3) break;
      if (!picked.includes(id)) picked.push(id);
    }
  };

  const preferLight =
    answers.age === 'senior' || answers.activity === 'low' || answers.neutered;

  if (preferLight) {
    addFrom(light);
    addFrom(energy);
  } else if (answers.activity === 'high') {
    addFrom(energy);
    addFrom(light);
  } else {
    addFrom(energy);
    addFrom(catalog);
    addFrom(light);
  }

  addFrom(catalog);

  return { primaryIds: picked.slice(0, 3), catalog };
}

/**
 * @typedef {Object} QuizAnswers
 * @property {string} [dogName]
 * @property {'puppy'|'adult'|'senior'} age
 * @property {'mini'|'medium'|'large'} size
 * @property {'low'|'medium'|'high'} activity
 * @property {'normal'|'overweight'|'underweight'} bodyCondition
 * @property {boolean} neutered
 * @property {string[]} conditions — 'none' | 'allergy' | 'digestive_mild' | 'digestive_diagnosed' | 'obesity_mild' | 'obesity_diagnosed' | 'skin_coat'
 * @property {string[]} allergies — ids from PROTEIN_ALLERGIES
 */

/**
 * @param {string[]} ids
 * @returns {import('./products.js').PRODUCTS[keyof typeof PRODUCTS][]}
 */
function pickProducts(ids) {
  return ids.map((id) => PRODUCTS[id]).filter(Boolean);
}

/**
 * @param {Set<string>} excluded
 * @param {string[]} candidates
 */
function filterExcluded(excluded, candidates) {
  return candidates.filter((id) => !excluded.has(id));
}

/**
 * @param {QuizAnswers} answers
 * @returns {{ excluded: Set<string>, alerts: string[], notes: string[] }}
 */
function applyAllergyFilters(answers) {
  const excluded = new Set();
  const alerts = [];
  const notes = [];

  const hasAllergy =
    answers.conditions.includes('allergy') && answers.allergies.length > 0;

  if (!hasAllergy) return { excluded, alerts, notes };

  const allergies = new Set(answers.allergies);

  if (allergies.has('pollo')) {
    CHICKEN_PRODUCTS.forEach((id) => excluded.add(id));
    alerts.push(
      'Evitamos recetas con pollo: Angus Beef, Angus Beef Puppy, Chicken Mini y Salmon Mini (contiene pollo pese al nombre).'
    );
  }

  if (allergies.has('ternera')) {
    BEEF_PRODUCTS.forEach((id) => excluded.add(id));
    notes.push('Sin ternera: descartamos Angus Beef y Angus Beef Puppy.');
  }

  if (allergies.has('pescado')) {
    FISH_PRODUCTS.forEach((id) => excluded.add(id));
    excluded.add('turkey');
    alerts.push(
      'Evitamos pescado y derivados. Turkey también se descarta por llevar aceite de salmón (5%).'
    );
  }

  if (allergies.has('conejo')) {
    excluded.add('rabbit');
  }

  if (allergies.has('cordero')) {
    excluded.add('lamb');
  }

  if (allergies.has('pato')) {
    excluded.add('rabbit');
    excluded.add('lamb');
    notes.push('Rabbit y Lamb incluyen pato en su composición.');
  }

  if (allergies.has('desconocida')) {
    notes.push(
      'Con alergia sin confirmar, priorizamos proteínas poco habituales (Rabbit, Lamb) o monoproteína (Salmon, Turkey). Consulta con tu veterinario antes de cambiar.'
    );
  }

  if (
    allergies.size === 1 &&
    !allergies.has('desconocida') &&
    !allergies.has('pato')
  ) {
    notes.push(
      'Para alergias confirmadas, Salmon y Turkey son las opciones más monoproteicas. En alergia severa a pescado, valora Turkey con tu veterinario por el aceite de salmón.'
    );
  }

  alerts.push(
    'En alergias o dietas de eliminación, recomendamos consultar con tu veterinario antes de introducir nuevas recetas.'
  );

  return { excluded, alerts, notes };
}

/**
 * @param {QuizAnswers} answers
 * @returns {import('./recommendation-engine.js').RecommendationResult}
 */
export function getRecommendation(answers) {
  const alerts = [];
  const notes = [];
  let primaryIds = [];
  let rotationLabel = '';
  let summary = '';

  const { excluded, alerts: allergyAlerts, notes: allergyNotes } =
    applyAllergyFilters(answers);
  alerts.push(...allergyAlerts);
  notes.push(...allergyNotes);

  // Filtro 1 — Patología (prioridad máxima)
  if (answers.conditions.includes('digestive_diagnosed')) {
    primaryIds = ['gastrointestinal'];
    rotationLabel = 'Plan veterinario digestivo';
    summary =
      'Ante problemas digestivos diagnosticados, la línea Gastrointestinal ofrece proteína hidrolizada, prebióticos y botánicos. Si tu veterinario lo autoriza, puedes complementar con recetas ligeras de la gama adulto.';
    alerts.push(
      'Gastrointestinal es una fórmula veterinaria. No sustituye el seguimiento clínico ni una dieta de eliminación estricta sin supervisión.'
    );

    const complement = filterExcluded(excluded, ['salmon', 'turkey']);
    if (complement.length >= 2) {
      primaryIds = ['gastrointestinal', ...complement.slice(0, 2)];
      notes.push(
        'Como complemento opcional para rotación (solo si tu vet lo aprueba): ' +
          complement
            .slice(0, 2)
            .map((id) => PRODUCTS[id].name)
            .join(' + ') +
          '.'
      );
    }

    return buildResult(primaryIds, rotationLabel, summary, alerts, notes, answers);
  }

  if (answers.conditions.includes('obesity_diagnosed')) {
    primaryIds = ['obesity'];
    rotationLabel = 'Plan veterinario control de peso';
    summary =
      'Obesity está formulada para la pérdida de peso con L-carnitina, alta fibra y la menor densidad calórica de la gama (2.614 kcal/kg).';
    alerts.push(
      'Obesity requiere seguimiento veterinario para ajustar raciones según fase de pérdida o mantenimiento.'
    );
    return buildResult(primaryIds, rotationLabel, summary, alerts, notes, answers);
  }

  // Filtro 2 — Edad: cachorro
  if (answers.age === 'puppy') {
    if (!excluded.has('angus-beef-puppy')) {
      primaryIds = ['angus-beef-puppy'];
      rotationLabel = 'Base de crecimiento';
      summary =
        'Angus Beef Puppy es nuestra receta de ternera Angus para cachorros: EPA/DHA, calcio y fósforo reforzados para el crecimiento.';
      if (
        answers.conditions.includes('allergy') ||
        excluded.has('angus-beef-puppy')
      ) {
        alerts.push(
          'Angus Beef Puppy combina ternera, salmón y pollo. Si hay sospecha de alergia, consulta con tu veterinario — es la única receta puppy del catálogo.'
        );
      }
      notes.push(
        'Al pasar a adulto, podrás ampliar la rotación aprovechando el diferenciador Custom Diet: cambio de sabor sin transición.'
      );
      return buildResult(primaryIds, rotationLabel, summary, alerts, notes, answers);
    }

    alerts.push(
      'Las opciones puppy están limitadas por las alergias indicadas. Consulta con tu veterinario la mejor alternativa.'
    );
    primaryIds = filterExcluded(excluded, ['salmon', 'turkey', 'rabbit', 'lamb']).slice(
      0,
      2
    );
    return buildResult(
      primaryIds.length ? primaryIds : ['salmon'],
      'Opciones limitadas',
      'No hay una receta puppy compatible con todas las restricciones. Priorizamos las opciones más seguras disponibles.',
      alerts,
      notes,
      answers
    );
  }

  // Filtro 3 — Tamaño mini
  const isMini = answers.size === 'mini';

  if (isMini) {
    if (isNormalHealthy(answers)) {
      const { primaryIds: normalIds, catalog } = buildNormalRotation(
        answers,
        excluded
      );
      primaryIds = normalIds;
      rotationLabel = 'Rotación mini sin transición';
      summary =
        'Estas recetas Mini están formuladas para rotarse entre sí: puedes alternarlas libremente en el día a día, sin transición.';
      const catalogNames = catalog.map((id) => PRODUCTS[id].name);
      notes.push(
        `Toda la gama Mini es compatible: ${catalogNames.join(', ')}.`
      );
      return finalizeWithActivity(
        primaryIds,
        rotationLabel,
        summary,
        alerts,
        notes,
        answers,
        excluded
      );
    }

    const miniCandidates = filterExcluded(excluded, [
      'chicken-mini',
      'salmon-mini',
    ]);

    if (answers.conditions.includes('skin_coat') && !excluded.has('salmon-mini')) {
      primaryIds = filterExcluded(excluded, ['salmon-mini', 'chicken-mini']);
      if (primaryIds.length < 2) {
        primaryIds = miniCandidates.length ? miniCandidates : ['chicken-mini'];
      }
      rotationLabel = 'Rotación mini — piel y pelaje';
      summary =
        'Para mini con pelo apagado, alternamos Salmon Mini (skin & coat) con Chicken Mini para variedad y digestión ligera.';
      if (!excluded.has('salmon-mini')) {
        notes.push(
          'Salmon Mini contiene pollo (caldo + hígado). No recomendar si hay alergia a pollo.'
        );
      }
    } else if (miniCandidates.length >= 2) {
      primaryIds = miniCandidates.slice(0, 2);
      rotationLabel = 'Rotación mini';
      summary =
        'Recetas formuladas para razas pequeñas, con nutrientes y kibble adaptados a su metabolismo.';
    } else if (miniCandidates.length === 1) {
      primaryIds = miniCandidates;
      rotationLabel = 'Receta mini recomendada';
      summary = `Para tu mini, ${PRODUCTS[miniCandidates[0]].name} es la opción más adecuada del catálogo.`;
    } else {
      primaryIds = filterExcluded(excluded, ['salmon', 'turkey']);
      rotationLabel = 'Alternativas para mini';
      summary =
        'Las líneas Mini no son compatibles con tus restricciones. Sugerimos recetas adulto ligeras en raciones ajustadas a su peso.';
      notes.push(
        'Consulta la tabla de dosificación Mini en la ficha de producto para ajustar gramos/día.'
      );
    }

    return finalizeWithActivity(
      primaryIds,
      rotationLabel,
      summary,
      alerts,
      notes,
      answers,
      excluded
    );
  }

  // Perfil sano adulto/senior: toda la gama compatible, sin acotar a 3 fijas
  if (isNormalHealthy(answers)) {
    const { primaryIds: normalIds, catalog } = buildNormalRotation(
      answers,
      excluded
    );
    primaryIds = normalIds;
    rotationLabel = 'Plan de rotación sin transición';
    summary =
      'Estas recetas están formuladas para rotarse entre sí: puedes alternarlas libremente en el día a día, sin los 7–10 días de transición que exige el resto del mercado y sin miedo al desajuste digestivo.';

    const catalogNames = catalog.map((id) => PRODUCTS[id].name);
    notes.push(
      `Toda la gama adulto es compatible en tu perfil (${catalogNames.join(', ')}). Las 3 recetas destacadas son un punto de partida; el resto aparece abajo para ampliar la rotación.`
    );

    if (answers.activity === 'high') {
      notes.push(
        'Con mucha actividad priorizamos recetas energéticas (Angus Beef, Rabbit, Lamb), alternando con opciones ligeras para la cena.'
      );
    } else if (answers.activity === 'medium') {
      notes.push(
        'Actividad media: mezclamos recetas energéticas y ligeras para equilibrar aporte calórico y digestión.'
      );
    } else if (answers.activity === 'low' || answers.neutered) {
      notes.push(
        'Actividad baja o castrado: priorizamos recetas ligeras, pero cualquier sabor de la gama adulto sigue siendo válido para rotar.'
      );
    }

    if (answers.age === 'senior') {
      notes.push(
        'En senior conviene incluir opciones ligeras con omega 3 (Salmon, Turkey, Tuna), pero no estás limitado solo a ellas.'
      );
    }

    return finalizeWithActivity(
      primaryIds,
      rotationLabel,
      summary,
      alerts,
      notes,
      answers,
      excluded
    );
  }

  // Adulto / senior con condiciones — construir rotación según actividad y estado
  let energyIds = [];
  let lightIds = [];

  if (answers.activity === 'high') {
    energyIds = filterExcluded(excluded, ['angus-beef', 'rabbit', 'lamb']);
    lightIds = filterExcluded(excluded, ['salmon', 'turkey', 'tuna']);
  } else if (answers.activity === 'medium') {
    energyIds = filterExcluded(excluded, ['rabbit', 'lamb', 'angus-beef']);
    lightIds = filterExcluded(excluded, ['salmon', 'turkey', 'tuna']);
  } else {
    energyIds = filterExcluded(excluded, ['rabbit', 'lamb']);
    lightIds = filterExcluded(excluded, ['salmon', 'turkey', 'tuna']);
  }

  // Senior → priorizar ligeras
  if (answers.age === 'senior') {
    primaryIds = lightIds.slice(0, 2);
    if (primaryIds.length < 2) {
      primaryIds = filterExcluded(excluded, [
        ...lightIds,
        ...energyIds,
      ]).slice(0, 3);
    }
    rotationLabel = 'Rotación senior — digestiva y ligera';
    summary =
      'En senior priorizamos recetas ligeras (Salmon, Turkey, Tuna) que cuidan la digestión y aportan omega 3 para articulaciones e inmunidad.';
    notes.push(
      'La gama adulto incluye glucosamina/condroitina (1.520 mg/kg) — relevante para articulaciones en razas grandes y edad avanzada.'
    );
  }

  // Sobrepeso leve
  else if (
    answers.bodyCondition === 'overweight' ||
    answers.conditions.includes('obesity_mild')
  ) {
    primaryIds = lightIds.slice(0, 3);
    rotationLabel = 'Rotación ligera — control de peso';
    summary =
      'Sin diagnóstico veterinario de obesidad, recomendamos las recetas más ligeras de la gama adulto: Salmon, Turkey y Tuna.';
    if (answers.neutered) {
      notes.push(
        'Al estar castrado, conviene vigilar el peso y priorizar recetas ligeras en la rotación.'
      );
    }
  }

  // Bajo peso
  else if (answers.bodyCondition === 'underweight') {
    primaryIds = filterExcluded(excluded, ['angus-beef', 'rabbit', 'lamb']).slice(
      0,
      2
    );
    rotationLabel = 'Rotación energética';
    summary =
      'Para ganar masa muscular, Angus Beef aporta la mayor densidad calórica (4.375 kcal/kg), alternando con Rabbit o Lamb.';
  }

  // Piel/pelo (adulto)
  else if (answers.conditions.includes('skin_coat')) {
    primaryIds = filterExcluded(excluded, ['salmon', 'turkey', 'tuna']).slice(
      0,
      3
    );
    rotationLabel = 'Rotación piel y pelaje';
    summary =
      'Salmon y Turkey aportan omega 3 y grasa moderada para recuperar brillo del pelaje sin sobrecargar la digestión.';
  }

  // Alergia confirmada — monoproteína
  else if (
    answers.conditions.includes('allergy') &&
    answers.allergies.length > 0 &&
    !answers.allergies.includes('desconocida')
  ) {
    primaryIds = filterExcluded(excluded, ['salmon', 'turkey']).slice(0, 2);
    if (primaryIds.length < 2) {
      primaryIds = filterExcluded(excluded, [
        'salmon',
        'turkey',
        'rabbit',
        'lamb',
        'tuna',
      ]).slice(0, 2);
    }
    rotationLabel = 'Rotación hipoalergénica';
    summary =
      'Alternamos recetas monoproteicas compatibles con tus restricciones. Tuna combina 4 especies de pescado — no apta para eliminación de una sola especie.';
  }

  // Alergia sospechada sin confirmar
  else if (
    answers.conditions.includes('allergy') &&
    answers.allergies.includes('desconocida')
  ) {
    primaryIds = filterExcluded(excluded, ['rabbit', 'lamb', 'salmon']).slice(
      0,
      3
    );
    rotationLabel = 'Rotación de exploración segura';
    summary =
      'Rabbit y Lamb usan proteínas poco habituales; Salmon es monoproteica real. Ideal para probar sin exponer a pollo o ternera de forma repetida.';
  }

  // Digestión leve (no diagnosticada)
  else if (answers.conditions.includes('digestive_mild')) {
    primaryIds = filterExcluded(excluded, ['salmon', 'turkey', 'tuna']).slice(
      0,
      3
    );
    rotationLabel = 'Rotación digestiva suave';
    summary =
      'Las recetas ligeras y monoproteicas suelen sentar mejor en digestiones sensibles. Los probióticos de toda la gama ayudan a equilibrar la microbiota en 40 días.';
  }

  // Perfil con condiciones — rotación acotada según actividad
  else {
    const activityKey = answers.activity || 'medium';
    let template;
    if (activityKey === 'high') {
      template = ['angus-beef', 'rabbit', 'salmon'];
    } else if (activityKey === 'low') {
      template = ['salmon', 'turkey', 'tuna'];
    } else {
      template = ['angus-beef', 'rabbit', 'turkey'];
    }
    primaryIds = filterExcluded(excluded, template);

    if (primaryIds.length < 2) {
      primaryIds = filterExcluded(excluded, ADULT_CATALOG).slice(0, 3);
    }

    rotationLabel = 'Plan de rotación sin transición';
    summary =
      'Estas recetas están formuladas para rotarse entre sí: puedes alternarlas libremente en el día a día, sin los 7–10 días de transición que exige el resto del mercado y sin miedo al desajuste digestivo.';

    if (answers.activity === 'high') {
      notes.push(
        'Desayuno/comida: Angus Beef y Rabbit (recetas energéticas). Cena: Salmon.'
      );
    } else if (answers.activity === 'medium') {
      notes.push(
        'Desayuno: Angus Beef (la más energética). Comida: Rabbit. Cena: Turkey (la más ligera).'
      );
    } else if (answers.activity === 'low' || answers.neutered) {
      notes.push(
        'Actividad baja: priorizamos recetas ligeras (Salmon, Turkey, Tuna).'
      );
    }
  }

  return finalizeWithActivity(
    primaryIds,
    rotationLabel,
    summary,
    alerts,
    notes,
    answers,
    excluded
  );
}

function finalizeWithActivity(primaryIds, rotationLabel, summary, alerts, notes, answers, excluded) {
  primaryIds = unique(primaryIds.filter((id) => id && !excluded.has(id)));

  if (primaryIds.length === 1 && answers.age !== 'puppy') {
    const extra = filterExcluded(
      excluded,
      ['salmon', 'turkey', 'tuna', 'rabbit', 'lamb', 'angus-beef']
    ).filter((id) => id !== primaryIds[0] && !MINI_ONLY.has(id));
    if (extra.length) primaryIds.push(extra[0]);
  }

  const primarySet = new Set(primaryIds.slice(0, 3));
  primaryIds = [...primarySet];

  return buildResult(primaryIds, rotationLabel, summary, alerts, notes, answers);
}

function buildResult(primaryIds, rotationLabel, summary, alerts, notes, answers) {
  const products = assignRoles(pickProducts(primaryIds), answers);

  const { ids: eligibleIds } = getEligibleProductIds(answers);
  const additionalIds = [...eligibleIds].filter((id) => !primaryIds.includes(id));
  const additionalProducts = assignRoles(pickProducts(additionalIds), answers, {
    isAdditional: true,
  });

  return {
    dogName: answers.dogName || 'tu perro',
    rotationLabel,
    summary,
    products,
    additionalProducts,
    alerts: uniqueStrings(alerts),
    notes: uniqueStrings(notes),
    highlight:
      'Con Custom Diet puedes rotar de sabor sin transición — 20 millones de probióticos/kg protegen su microbiota.',
  };
}

function assignRoles(products, answers, options = {}) {
  const { isAdditional = false } = options;
  const roleOrder =
    answers.activity === 'high'
      ? ['desayuno', 'comida', 'cena']
      : ['base', 'comida', 'cena'];

  return products.map((product, index) => {
    if (isAdditional) {
      return { ...product, suggestedRole: 'También compatible' };
    }

    let role = product.role;
    if (products.length > 1) {
      if (product.isVet) role = 'base';
      else if (product.em >= 3700) role = 'desayuno / comida';
      else if (product.em <= 2950) role = 'cena';
      else role = roleOrder[index] || 'rotación';
    }

    return { ...product, suggestedRole: role };
  });
}

function unique(arr) {
  return [...new Set(arr)];
}

function uniqueStrings(arr) {
  return [...new Set(arr.filter(Boolean))];
}

/**
 * @typedef {Object} RecommendationResult
 * @property {string} dogName
 * @property {string} rotationLabel
 * @property {string} summary
 * @property {Array} products
 * @property {Array} additionalProducts
 * @property {string[]} alerts
 * @property {string[]} notes
 * @property {string} highlight
 */

export { PRODUCTS };
