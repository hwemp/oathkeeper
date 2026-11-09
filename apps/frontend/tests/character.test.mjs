import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abilities, newCharacter, calculate, modifier, proficiencyBonus, parseCharacter, serializeCharacter } from '../app/character/character.ts';

test('2014 modifier and proficiency boundaries', () => {
  assert.deepEqual([1, 8, 9, 10, 11, 12, 20, 30].map(modifier), [-5, -1, -1, 0, 0, 1, 5, 10]);
  assert.deepEqual([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus), [2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
});
test('score and level edits update dependent values while retaining adjustments', () => {
  const character = newCharacter();
  character.abilities.Dexterity = { score: 14, proficient: true, saveAdjustment: -1 };
  character.initiativeAdjustment = 3;
  assert.equal(calculate(character).saves.Dexterity, 3);
  assert.equal(calculate(character).initiative, 5);
  character.abilities.Dexterity.score = 18;
  character.level = 5;
  const before = structuredClone(character);
  assert.equal(calculate(character).saves.Dexterity, 6);
  assert.equal(calculate(character).initiative, 7);
  assert.equal(calculate(character).saves.Strength, 0);
  assert.deepEqual(character, before);
  character.abilities.Dexterity.proficient = false;
  assert.equal(calculate(character).saves.Dexterity, 3);
});
test('save round trip preserves every field, manual values and Unicode', () => {
  const character = newCharacter();
  Object.assign(character, { name: 'Éowyn 🐉', className: 'Custom class', ancestry: 'Manual option', notes: 'Feature +2\nA note', initiativeAdjustment: -2, level: 17 });
  abilities.forEach((name, index) => character.abilities[name] = { score: 9 + index, proficient: index % 2 === 0, saveAdjustment: index - 3 });
  assert.deepEqual(parseCharacter(serializeCharacter(character)), character);
});
test('malformed, unsupported and out-of-range files are rejected', () => {
  for (const text of ['bad', 'null', '[]', '{}']) assert.throws(() => parseCharacter(text));
  for (const patch of [{ version: 2 }, { rules: '5e-2024' }, { level: 0 }, { level: 21 }, { level: 1.5 }, { notes: null }, { initiativeAdjustment: 101 }, { futureField: 'keep me' }, { abilities: {} }]) {
    assert.throws(() => parseCharacter(JSON.stringify({ ...newCharacter(), ...patch })));
  }
  for (const patch of [{ score: 0 }, { score: 31 }, { score: '12' }, { proficient: 1 }, { saveAdjustment: null }, { extra: 2 }]) {
    const character = newCharacter();
    Object.assign(character.abilities.Strength, patch);
    assert.throws(() => parseCharacter(JSON.stringify(character)));
  }
});
