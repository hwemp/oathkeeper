export const abilities = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"] as const;
export type Ability = typeof abilities[number];
export type AbilityEntry = { score: number; proficient: boolean; saveAdjustment: number };
export type Character = {
  version: 1;
  rules: "5e-2014";
  name: string;
  level: number;
  className: string;
  ancestry: string;
  notes: string;
  initiativeAdjustment: number;
  abilities: Record<Ability, AbilityEntry>;
};

export function newCharacter(): Character {
  return {
    version: 1, rules: "5e-2014", name: "", level: 1, className: "", ancestry: "", notes: "",
    initiativeAdjustment: 0,
    abilities: Object.fromEntries(abilities.map(name => [name, { score: 10, proficient: false, saveAdjustment: 0 }])) as Character["abilities"],
  };
}

export const modifier = (score: number) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level: number) => 2 + Math.floor((level - 1) / 4);
export const signed = (value: number) => value >= 0 ? `+${value}` : String(value);

export function calculate(character: Character) {
  const proficiency = proficiencyBonus(character.level);
  return {
    proficiency,
    initiative: modifier(character.abilities.Dexterity.score) + character.initiativeAdjustment,
    saves: Object.fromEntries(abilities.map(name => {
      const entry = character.abilities[name];
      return [name, modifier(entry.score) + (entry.proficient ? proficiency : 0) + entry.saveAdjustment];
    })) as Record<Ability, number>,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a character save object.");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error("This save contains unsupported fields. Keep the original file; it cannot be restored here without losing data.");
}
function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  return value;
}

export function parseCharacter(text: string): Character {
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw new Error("This is not a valid JSON save file. Choose an Oathkeeper .json file; PDF import is not available yet."); }
  const data = record(input);
  if (data.version !== 1 || data.rules !== "5e-2014") throw new Error("This save version or rules edition is not supported.");
  exactKeys(data, Object.keys(newCharacter()));
  const scores = record(data.abilities);
  exactKeys(scores, [...abilities]);
  const parsed = newCharacter();
  for (const name of abilities) {
    const entry = record(scores[name]);
    exactKeys(entry, ["score", "proficient", "saveAdjustment"]);
    if (typeof entry.proficient !== "boolean") throw new Error(`${name} proficiency must be true or false.`);
    parsed.abilities[name] = {
      score: integer(entry.score, 1, 30, `${name} score`),
      proficient: entry.proficient,
      saveAdjustment: integer(entry.saveAdjustment, -100, 100, `${name} adjustment`),
    };
  }
  return { ...parsed,
    name: string(data.name, "Name"), className: string(data.className, "Class"),
    ancestry: string(data.ancestry, "Race / ancestry"), notes: string(data.notes, "Notes"),
    level: integer(data.level, 1, 20, "Level"),
    initiativeAdjustment: integer(data.initiativeAdjustment, -100, 100, "Initiative adjustment"),
  };
}

export function serializeCharacter(character: Character): string {
  // Validate at the save boundary as well as on restore.
  return JSON.stringify(parseCharacter(JSON.stringify(character)), null, 2);
}
