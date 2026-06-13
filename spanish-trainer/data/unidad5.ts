import type { VocabItem } from "@/lib/types";

/**
 * Unidad 5 — Vokabeln (Buchseiten 216–217).
 *
 * Direkt aus dem Foto der Vokabelseiten übernommen: spanischer Eintrag,
 * deutsche Übersetzung und – wo im Buch vorhanden – ein Beispielsatz (wird
 * vom Hinweis genutzt). Letztes Wort der Unidad ist „según“; der danach
 * folgende Block „Unidad 6 / Primer paso“ (Monate) ist NICHT enthalten.
 *
 * Zusätzlich zu den Buchvokabeln sind die Präsens-Konjugationen der in dieser
 * Unidad eingeführten Verben enthalten (Stammwechsel: querer, preferir,
 * empezar; unregelmäßig: dar), da Konjugationen mitgelernt werden sollen.
 */
const PERSONS = ["yo", "tú", "él/ella", "nosotros", "vosotros", "ellos/ellas"];

function conjugation(
  infinitive: string,
  tense: string,
  forms: [string, string][],
): VocabItem[] {
  return forms.map(([es, de], i) => ({
    id: `${infinitive}-${PERSONS[i].replace(/\W+/g, "")}`,
    es,
    de,
    type: "conjugation",
    infinitive,
    person: PERSONS[i],
    tense,
    unit: 5,
  }));
}

export const unidad5: VocabItem[] = [
  // ── Seite 216, Spalte 1 ───────────────────────────────────────────────
  {
    id: "persona",
    es: "la persona",
    de: "die Person",
    type: "noun",
    article: "la",
    unit: 5,
    example: {
      es: "En el barrio de Salamanca viven muchas personas importantes.",
      de: "Im Stadtteil Salamanca leben viele wichtige Leute.",
    },
  },
  { id: "desconocido", es: "desconocido, -a", de: "unbekannt", type: "adjective", unit: 5 },
  {
    id: "dar",
    es: "dar algo a alguien",
    de: "jdm. etwas geben",
    type: "verb",
    infinitive: "dar",
    unit: 5,
  },
  {
    id: "mano",
    es: "la mano",
    de: "die Hand",
    type: "noun",
    article: "la",
    unit: 5,
    example: {
      es: "Tienes que lavarte las manos antes de comer.",
      de: "Vor dem Essen musst du dir die Hände waschen.",
    },
  },
  {
    id: "zapato",
    es: "el zapato",
    de: "der Schuh",
    type: "noun",
    article: "el",
    unit: 5,
    example: {
      es: "Voy a comprar zapatos nuevos para las vacaciones.",
      de: "Für den Urlaub werde ich mir neue Schuhe kaufen.",
    },
  },
  {
    id: "para-hacer-algo",
    es: "para hacer algo",
    de: "um etwas zu tun",
    type: "phrase",
    unit: 5,
    example: {
      es: "¿Vais al centro comercial para comprar el regalo de Blanca?",
      de: "Fahrt ihr ins Einkaufszentrum, um das Geschenk für Blanca zu kaufen?",
    },
  },
  {
    id: "entrar",
    es: "entrar",
    de: "(hinein)gehen; hereinkommen",
    type: "verb",
    infinitive: "entrar",
    unit: 5,
    example: {
      es: "¡Cuidado! ¡Los gatos entran en la cocina!",
      de: "Vorsicht! Die Katzen gehen in die Küche!",
    },
  },
  { id: "llevar", es: "llevar algo", de: "etwas tragen", type: "verb", infinitive: "llevar", unit: 5 },
  {
    id: "sin",
    es: "sin",
    de: "ohne",
    type: "phrase",
    unit: 5,
    example: {
      es: "Mi abuelo tiene 92 años. Siempre va de compras sin dinero.",
      de: "Mein Großvater ist 92 Jahre alt. Er geht immer ohne Geld einkaufen.",
    },
  },
  { id: "con", es: "con", de: "mit", type: "phrase", unit: 5 },
  {
    id: "agujero",
    es: "el agujero",
    de: "das Loch",
    type: "noun",
    article: "el",
    unit: 5,
    example: {
      es: "Mira, tu pijama tiene agujeros muy grandes.",
      de: "Guck mal, dein Schlafanzug hat riesige Löcher.",
    },
  },
  {
    id: "desayuno",
    es: "el desayuno",
    de: "das Frühstück",
    type: "noun",
    article: "el",
    unit: 5,
    example: {
      es: "¿Qué hay hoy de desayuno?",
      de: "Was gibt es heute zum Frühstück?",
    },
  },
  { id: "desayunar", es: "desayunar", de: "frühstücken", type: "verb", infinitive: "desayunar", unit: 5 },
  { id: "cereales", es: "los cereales", de: "das Müsli; die Frühstücksflocken", type: "noun", article: "los", unit: 5 },
  {
    id: "fruta",
    es: "la fruta",
    de: "das Obst",
    type: "noun",
    article: "la",
    unit: 5,
    example: {
      es: "Por la noche solo ceno fruta.",
      de: "Abends esse ich nur Obst.",
    },
  },
  {
    id: "pan",
    es: "el pan",
    de: "das Brot",
    type: "noun",
    article: "el",
    unit: 5,
    example: {
      es: "Mi familia come mucho pan.",
      de: "Meine Familie isst viel Brot.",
    },
  },
  {
    id: "queso",
    es: "el queso",
    de: "der Käse",
    type: "noun",
    article: "el",
    unit: 5,
    example: {
      es: "—¿Qué comes? —Un bocadillo de queso.",
      de: "– Was isst du? – Ein belegtes Käsebrötchen.",
    },
  },
  { id: "mantequilla", es: "la mantequilla", de: "die Butter", type: "noun", article: "la", unit: 5 },
  {
    id: "mermelada",
    es: "la mermelada",
    de: "die Marmelade",
    type: "noun",
    article: "la",
    unit: 5,
    example: {
      es: "Me gusta mucho el pan con mantequilla y mermelada.",
      de: "Ich esse gerne Brot mit Butter und Marmelade.",
    },
  },
  {
    id: "quedarse",
    es: "quedarse",
    de: "bleiben",
    type: "verb",
    infinitive: "quedarse",
    unit: 5,
    example: {
      es: "Hoy no vamos a la playa. Nos quedamos en casa.",
      de: "Heute gehen wir nicht an den Strand. Wir bleiben zu Hause.",
    },
  },

  // ── Seite 216, Spalte 2 ───────────────────────────────────────────────
  {
    id: "fiambre",
    es: "el fiambre",
    de: "die Wurstwaren; der Aufschnitt",
    type: "noun",
    article: "el",
    unit: 5,
    example: {
      es: "Para los bocadillos tenemos que comprar queso y fiambre.",
      de: "Wir müssen Käse und Wurst für die belegten Brötchen kaufen.",
    },
  },
  {
    id: "arriba",
    es: "¡Arriba!",
    de: "Aufstehen!",
    type: "phrase",
    unit: 5,
    example: { es: "¡Arriba! ¡Son las ocho!", de: "Aufstehen! Es ist acht Uhr!" },
  },
  {
    id: "creer",
    es: "creer algo",
    de: "etwas glauben; etwas meinen",
    type: "verb",
    infinitive: "creer",
    unit: 5,
    example: {
      es: "Creo que Miguel está en casa.",
      de: "Ich glaube, dass Miguel zu Hause ist.",
    },
  },
  { id: "que", es: "que", de: "dass", type: "phrase", unit: 5 },
  {
    id: "dificil",
    es: "difícil",
    de: "schwierig; schwer",
    type: "adjective",
    unit: 5,
    example: {
      es: "Levantarse de la cama el domingo a las cinco de la mañana es muy difícil.",
      de: "Es ist sehr schwer, sonntagmorgens um 5 Uhr aufzustehen.",
    },
  },
  {
    id: "temprano",
    es: "temprano",
    de: "früh",
    type: "adjective",
    unit: 5,
    example: {
      es: "Mi padre se levanta siempre muy temprano, a las seis de la mañana.",
      de: "Mein Vater steht immer sehr früh auf, schon um sechs Uhr morgens.",
    },
  },
  {
    id: "necesitar",
    es: "necesitar algo",
    de: "etwas brauchen",
    type: "verb",
    infinitive: "necesitar",
    unit: 5,
    example: {
      es: "Necesito una bicicleta para ir al instituto.",
      de: "Ich brauche ein Fahrrad, um ins Gymnasium zu kommen.",
    },
  },
  {
    id: "preparar",
    es: "preparar algo",
    de: "etwas zubereiten; etwas vorbereiten",
    type: "verb",
    infinitive: "preparar",
    unit: 5,
    example: {
      es: "¿Preparas tú hoy el desayuno?",
      de: "Bereitest du heute das Frühstück vor?",
    },
  },
  {
    id: "recreo",
    es: "el recreo",
    de: "die Pause",
    type: "noun",
    article: "el",
    unit: 5,
    example: {
      es: "En el recreo mis amigas y yo siempre quedamos.",
      de: "In der Pause sind meine Freundinnen und ich immer verabredet.",
    },
  },
  { id: "cambiar-el-chip", es: "cambiar el chip", de: "umdenken", type: "phrase", unit: 5 },
  {
    id: "pregunta",
    es: "la pregunta",
    de: "die Frage",
    type: "noun",
    article: "la",
    unit: 5,
    example: {
      es: "Mi hermano pequeño siempre tiene muchas preguntas.",
      de: "Mein kleiner Bruder hat immer viele Fragen.",
    },
  },
  { id: "saludo", es: "el saludo", de: "der Gruß", type: "noun", article: "el", unit: 5 },
  {
    id: "estar-de-acuerdo",
    es: "estar de acuerdo con algo/alguien",
    de: "mit etwas/jdm. einverstanden sein",
    type: "phrase",
    unit: 5,
  },

  // Bloque B
  {
    id: "pizarra",
    es: "la pizarra",
    de: "die Tafel",
    type: "noun",
    article: "la",
    unit: 5,
    example: {
      es: "Mi profesora de Inglés escribe mucho en la pizarra.",
      de: "Meine Englischlehrerin schreibt viel an die Tafel.",
    },
  },
  {
    id: "aula",
    es: "el aula",
    de: "das Klassenzimmer",
    type: "noun",
    article: "el",
    unit: 5,
    example: {
      es: "El profesor está esperando en el aula.",
      de: "Der Lehrer wartet schon im Klassenzimmer.",
    },
  },
  { id: "laboratorio", es: "el laboratorio", de: "das Labor", type: "noun", article: "el", unit: 5 },
  { id: "biblioteca", es: "la biblioteca", de: "die Bibliothek; die Bücherei", type: "noun", article: "la", unit: 5 },
  { id: "informatica", es: "la Informática", de: "die Informatik", type: "noun", article: "la", unit: 5 },

  // ── Seite 217, Spalte 1 ───────────────────────────────────────────────
  {
    id: "aula-informatica",
    es: "el aula de Informática",
    de: "der Computerraum",
    type: "noun",
    article: "el",
    unit: 5,
    example: {
      es: "Me encanta trabajar en el aula de Informática.",
      de: "Ich arbeite sehr gerne im Computerraum.",
    },
  },
  {
    id: "secretaria",
    es: "la secretaría",
    de: "das Sekretariat",
    type: "noun",
    article: "la",
    unit: 5,
    example: {
      es: "El aula de Informática está al lado de la secretaría.",
      de: "Der Computerraum ist neben dem Sekretariat.",
    },
  },
  {
    id: "patio",
    es: "el patio",
    de: "der Schulhof",
    type: "noun",
    article: "el",
    unit: 5,
    example: {
      es: "Siempre voy al patio en el recreo.",
      de: "In der Pause gehe ich immer auf den Schulhof.",
    },
  },
  {
    id: "nuestro",
    es: "nuestro, -a",
    de: "unser, unsere",
    type: "phrase",
    unit: 5,
    example: {
      es: "Nuestra profesora de Francés se llama Florence.",
      de: "Unsere Französischlehrerin heißt Florence.",
    },
  },
  {
    id: "vuestro",
    es: "vuestro, -a",
    de: "euer, eu(e)re",
    type: "phrase",
    unit: 5,
    example: {
      es: "¿Cómo se llama vuestro instituto?",
      de: "Wie heißt euer Gymnasium?",
    },
  },
  { id: "su", es: "su", de: "sein, -e; ihr, -e; Ihr, -e", type: "phrase", unit: 5 },
  { id: "economia", es: "la Economía", de: "Wirtschaft (Schulfach)", type: "noun", article: "la", unit: 5 },
  { id: "matematicas", es: "las Matemáticas", de: "Mathematik (Schulfach)", type: "noun", article: "las", unit: 5 },
  { id: "educacion-fisica", es: "la Educación Física", de: "Sport (Schulfach)", type: "noun", article: "la", unit: 5 },
  {
    id: "lengua-literatura",
    es: "la Lengua y Literatura",
    de: "Spanisch (Schulfach)",
    type: "noun",
    article: "la",
    unit: 5,
    example: {
      es: "En Lengua y Literatura estamos leyendo Don Quijote de Cervantes.",
      de: "In Spanisch lesen wir gerade „Don Quijote“ von Cervantes.",
    },
  },
  { id: "historia", es: "la Historia", de: "Geschichte (Schulfach)", type: "noun", article: "la", unit: 5 },
  { id: "dibujo", es: "el Dibujo", de: "Zeichnen; Kunst (Schulfach)", type: "noun", article: "el", unit: 5 },
  { id: "filosofia", es: "la Filosofía", de: "Philosophie (Schulfach)", type: "noun", article: "la", unit: 5 },
  {
    id: "asignatura",
    es: "la asignatura",
    de: "das Unterrichtsfach",
    type: "noun",
    article: "la",
    unit: 5,
    example: {
      es: "El Dibujo y la Historia son mis asignaturas favoritas.",
      de: "Zeichnen und Geschichte sind meine Lieblingsfächer.",
    },
  },
  { id: "horario", es: "el horario", de: "der Stundenplan", type: "noun", article: "el", unit: 5 },
  {
    id: "querer",
    es: "querer algo",
    de: "etwas wollen",
    type: "verb",
    infinitive: "querer",
    unit: 5,
    example: {
      es: "Mis padres no quieren mascotas en casa.",
      de: "Meine Eltern wollen keine Tiere im Haus.",
    },
  },
  { id: "cambiar", es: "cambiar algo", de: "etwas ändern", type: "verb", infinitive: "cambiar", unit: 5 },
  {
    id: "cosa",
    es: "la cosa",
    de: "die Sache; das Ding",
    type: "noun",
    article: "la",
    unit: 5,
    example: {
      es: "Me gustaría cambiar muchas cosas en mi horario.",
      de: "Ich würde gerne vieles in meinem Stundenplan ändern.",
    },
  },
  {
    id: "empezar",
    es: "empezar",
    de: "anfangen; beginnen",
    type: "verb",
    infinitive: "empezar",
    unit: 5,
    example: {
      es: "Las clases empiezan a las ocho de la mañana.",
      de: "Der Unterricht beginnt um acht Uhr.",
    },
  },

  // ── Seite 217, Spalte 2 (bis „según“) ─────────────────────────────────
  {
    id: "terminar",
    es: "terminar",
    de: "(be)enden; zu Ende sein",
    type: "verb",
    infinitive: "terminar",
    unit: 5,
    example: {
      es: "La película termina a las once.",
      de: "Der Film ist um elf Uhr zu Ende.",
    },
  },
  {
    id: "preferir",
    es: "preferir algo",
    de: "etwas lieber mögen",
    type: "verb",
    infinitive: "preferir",
    unit: 5,
    example: {
      es: "No me gustan los perros. Prefiero los gatos.",
      de: "Ich mag keine Hunde. Ich mag lieber Katzen.",
    },
  },
  {
    id: "examen",
    es: "el examen",
    de: "die Prüfung; die Klassenarbeit",
    type: "noun",
    article: "el",
    unit: 5,
    example: {
      es: "Mi hermano estudia para un examen de Inglés.",
      de: "Mein Bruder lernt für eine Klassenarbeit in Englisch.",
    },
  },
  {
    id: "por-supuesto",
    es: "por supuesto",
    de: "natürlich",
    type: "phrase",
    unit: 5,
    example: {
      es: "¡Por supuesto, el fin de semana vamos a la discoteca!",
      de: "Natürlich gehen wir am Wochenende in die Diskothek!",
    },
  },
  { id: "conexion", es: "la conexión", de: "der Anschluss", type: "noun", article: "la", unit: 5 },
  {
    id: "internet",
    es: "Internet",
    de: "das Internet",
    type: "noun",
    unit: 5,
    example: {
      es: "En la casa de vacaciones no tenemos conexión a Internet.",
      de: "Im Ferienhaus haben wir keinen Internetanschluss.",
    },
  },
  {
    id: "asi",
    es: "así",
    de: "so; auf diese Weise",
    type: "phrase",
    unit: 5,
    example: {
      es: "Yo estudio así: en el sofá y con el ordenador.",
      de: "Ich lerne so: auf dem Sofa und mit dem Computer.",
    },
  },
  {
    id: "segun",
    es: "según",
    de: "laut; nach (Präposition)",
    type: "phrase",
    unit: 5,
    example: {
      es: "Según Carlos, hoy no tenemos clase de Alemán.",
      de: "Carlos meint, heute hätten wir kein Deutsch.",
    },
  },

  // ── Konjugationen (Präsens) — in dieser Unidad eingeführte Verben ──────
  // querer (e→ie)
  ...conjugation("querer", "presente", [
    ["quiero", "ich will"],
    ["quieres", "du willst"],
    ["quiere", "er/sie will"],
    ["queremos", "wir wollen"],
    ["queréis", "ihr wollt"],
    ["quieren", "sie wollen"],
  ]),
  // preferir (e→ie)
  ...conjugation("preferir", "presente", [
    ["prefiero", "ich mag lieber"],
    ["prefieres", "du magst lieber"],
    ["prefiere", "er/sie mag lieber"],
    ["preferimos", "wir mögen lieber"],
    ["preferís", "ihr mögt lieber"],
    ["prefieren", "sie mögen lieber"],
  ]),
  // empezar (e→ie)
  ...conjugation("empezar", "presente", [
    ["empiezo", "ich fange an"],
    ["empiezas", "du fängst an"],
    ["empieza", "er/sie fängt an"],
    ["empezamos", "wir fangen an"],
    ["empezáis", "ihr fangt an"],
    ["empiezan", "sie fangen an"],
  ]),
  // dar (unregelmäßig)
  ...conjugation("dar", "presente", [
    ["doy", "ich gebe"],
    ["das", "du gibst"],
    ["da", "er/sie gibt"],
    ["damos", "wir geben"],
    ["dais", "ihr gebt"],
    ["dan", "sie geben"],
  ]),
];
