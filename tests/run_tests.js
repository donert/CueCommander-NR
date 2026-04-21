#!/usr/bin/env node
/**
 * VocalNames test runner
 *
 * Usage:
 *   node tests/run_tests.js            # run all suites
 *   node tests/run_tests.js active     # run suites whose filename matches "active"
 *
 * Environment variables:
 *   NR_HOST    Node-RED base URL  (default: http://uacts-g001:1880)
 *   API_TOKEN  API auth token     (default: vn-api-changeme)
 */
'use strict';

const path = require('path');
const fs   = require('fs');
const api  = require('./api');

// ── Assertion helper ──────────────────────────────────────────────────────────
function makeAssert(testName) {
  return function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  };
}

// ── Test runner ───────────────────────────────────────────────────────────────
async function runSuite(name, cases) {
  console.log(`\n  Suite: ${name}`);
  let passed = 0, failed = 0;

  for (const tc of cases) {
    const assert = makeAssert(tc.name);

    // Save state before test so we can restore after
    let savedState;
    try {
      const { body } = await api.getState();
      savedState = body;
    } catch { savedState = null; }

    try {
      await tc.run(api, assert);
      console.log(`    ✓  ${tc.name}`);
      passed++;
    } catch (err) {
      console.log(`    ✗  ${tc.name}`);
      console.log(`       ${err.message}`);
      failed++;
    } finally {
      // Restore state (best effort)
      if (savedState) {
        try { await api.setState(savedState); } catch { /* ignore */ }
      }
    }
  }

  return { passed, failed };
}

async function main() {
  const filter = process.argv[2] || null;

  // ── Preflight: check Node-RED is up ───────────────────────────────────────
  console.log('Checking Node-RED connection...');
  try {
    const { status } = await api.ping();
    if (status === 401) {
      console.error('ERROR: Auth failed — check API_TOKEN env var matches the token in Node-RED');
      process.exit(1);
    }
    if (status !== 200) {
      console.error(`ERROR: Unexpected status ${status} from /api/state`);
      process.exit(1);
    }
    console.log('  Node-RED is up and API token is valid.\n');
  } catch (err) {
    console.error(`ERROR: Cannot reach Node-RED — ${err.message}`);
    console.error('  Make sure Node-RED is running on http://uacts-g001:1880');
    process.exit(1);
  }

  // ── Discover test suite files ─────────────────────────────────────────────
  const casesDir = path.join(__dirname, 'cases');
  const suiteFiles = fs.readdirSync(casesDir)
    .filter(f => f.endsWith('.js'))
    .filter(f => !filter || f.includes(filter))
    .sort();

  if (suiteFiles.length === 0) {
    console.log(filter
      ? `No test suites matching "${filter}" found in tests/cases/`
      : 'No test suites found in tests/cases/');
    process.exit(0);
  }

  // ── Run suites ────────────────────────────────────────────────────────────
  let totalPassed = 0, totalFailed = 0;

  for (const file of suiteFiles) {
    const suiteName = file.replace('.js', '');
    const cases = require(path.join(casesDir, file));
    const { passed, failed } = await runSuite(suiteName, cases);
    totalPassed += passed;
    totalFailed += failed;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = totalPassed + totalFailed;
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${totalPassed}/${total} passed`);
  if (totalFailed > 0) {
    console.log(`         ${totalFailed} FAILED`);
    process.exit(1);
  } else {
    console.log('         All tests passed.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Unexpected runner error:', err);
  process.exit(1);
});
