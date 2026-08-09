"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixCommanderHeuristic, sumBoard } = require("../shared.js");

test("sumBoard sums quantities and tolerates empty/undefined", () => {
  assert.equal(sumBoard({ a: 2, b: 3 }), 5);
  assert.equal(sumBoard({}), 0);
  assert.equal(sumBoard(undefined), 0);
});

test("fixCommanderHeuristic promotes a lone sideboard to the command zone (~100-card deck)", () => {
  const deck = { mainboard: mainOf(99), sideboard: { "Krenko, Mob Boss": 1 }, commanders: {} };
  fixCommanderHeuristic(deck);
  assert.deepEqual(deck.commanders, { "Krenko, Mob Boss": 1 });
  assert.deepEqual(deck.sideboard, {});
});

test("fixCommanderHeuristic accepts a 2-card partner command zone", () => {
  const deck = { mainboard: mainOf(98), sideboard: { "Tana": 1, "Tymna": 1 }, commanders: {} };
  fixCommanderHeuristic(deck);
  assert.equal(sumBoard(deck.commanders), 2);
  assert.deepEqual(deck.sideboard, {});
});

test("fixCommanderHeuristic leaves a real sideboard (60-card deck) untouched", () => {
  const deck = { mainboard: mainOf(60), sideboard: { "Rest in Peace": 2 }, commanders: {} };
  fixCommanderHeuristic(deck);
  assert.deepEqual(deck.commanders, {});
  assert.deepEqual(deck.sideboard, { "Rest in Peace": 2 });
});

test("fixCommanderHeuristic does not touch a deck that already has a commander", () => {
  const deck = { mainboard: mainOf(99), sideboard: { "Sol Ring": 1 }, commanders: { "Krenko, Mob Boss": 1 } };
  fixCommanderHeuristic(deck);
  assert.deepEqual(deck.commanders, { "Krenko, Mob Boss": 1 });
  assert.deepEqual(deck.sideboard, { "Sol Ring": 1 });
});

test("fixCommanderHeuristic ignores a 3+ card sideboard", () => {
  const deck = { mainboard: mainOf(99), sideboard: { a: 1, b: 1, c: 1 }, commanders: {} };
  fixCommanderHeuristic(deck);
  assert.deepEqual(deck.commanders, {});
  assert.equal(sumBoard(deck.sideboard), 3);
});

// helper: a mainboard whose quantities sum to n
function mainOf(n) {
  return { "Mountain": n };
}
