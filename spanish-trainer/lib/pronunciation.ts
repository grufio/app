/**
 * Convert a vocab term's Spanish text into what should be *spoken*.
 *
 * The textbook writes adjectives/possessives with a gender shorthand like
 * "vuestro, -a". Read literally, speech synthesis says "vuestro, minus a".
 * Expand it to both full forms so the speaker says "vuestro, vuestra".
 */
export function spanishSpeechText(es: string): string {
  const match = es.match(/^(.+?),\s*-a$/);
  if (!match) return es;
  const masculine = match[1].trim();
  return `${masculine}, ${feminineForm(masculine)}`;
}

function feminineForm(masculine: string): string {
  // o → a (vuestro → vuestra); otherwise append a (español → española).
  if (masculine.endsWith("o")) return `${masculine.slice(0, -1)}a`;
  return `${masculine}a`;
}
