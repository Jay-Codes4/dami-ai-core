const assert = require("node:assert/strict");
const test = require("node:test");

const { parseWakeUtterance } = require("./wake.cjs");

test("recognizes a wake-only request", () => {
  assert.deepEqual(parseWakeUtterance("Hey Dami"), { heard: "Hey Dami", command: "" });
});

test("extracts a one-shot wake command", () => {
  assert.equal(
    parseWakeUtterance("Hey Dami, give me five marriage laws in Nigeria")?.command,
    "give me five marriage laws in Nigeria",
  );
});

test("accepts common Windows recognition variants", () => {
  for (const phrase of ["hey dummy", "Hey Danny", "OK Dami", "hey day me", "Dami"]) {
    assert.ok(parseWakeUtterance(phrase), phrase);
  }
});

test("does not activate for ordinary speech", () => {
  assert.equal(parseWakeUtterance("Please explain Nigerian marriage law"), null);
  assert.equal(parseWakeUtterance("I spoke to Dami yesterday"), null);
});
