#!/usr/bin/env node
/**
 * validate-manifest.mjs
 *
 * Validates manifest.json against the bundled manifest.schema.json using AJV.
 * Exit 0 = valid. Exit 1 = invalid (prints error list).
 *
 * Usage:
 *   node scripts/validate-manifest.mjs                      # validates ./manifest.json
 *   node scripts/validate-manifest.mjs path/to/manifest.json
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Paths
const schemaPath = resolve(repoRoot, 'manifest.schema.json');
const manifestPath = resolve(repoRoot, process.argv[2] ?? 'manifest.json');

// Load files
let schema, manifest;
try {
  schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
} catch (err) {
  console.error(`\x1b[31m✖ Could not load schema: ${schemaPath}\x1b[0m`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (err) {
  console.error(`\x1b[31m✖ Could not load manifest: ${manifestPath}\x1b[0m`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

// Set up AJV (draft 2020-12)
const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: true,
});
addFormats(ajv);

// Compile and validate
let validate;
try {
  validate = ajv.compile(schema);
} catch (err) {
  console.error(`\x1b[31m✖ Schema compilation failed\x1b[0m`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

const valid = validate(manifest);

if (valid) {
  const name = manifest.name ?? '(unnamed)';
  const slug = manifest.slug ?? '(no slug)';
  const version = manifest.version ?? '(no version)';
  console.log(`\x1b[32m✔ Manifest valid\x1b[0m  ${name}  slug=${slug}  v${version}`);
  console.log(`  Schema:   ${schemaPath}`);
  console.log(`  Manifest: ${manifestPath}`);
  process.exit(0);
} else {
  console.error(`\x1b[31m✖ Manifest invalid\x1b[0m  ${validate.errors.length} error(s) in ${manifestPath}\n`);

  for (const err of validate.errors) {
    const field = err.instancePath || '(root)';
    const msg = formatError(err);
    console.error(`  \x1b[33m${field}\x1b[0m  ${msg}`);
  }

  console.error(`\nFix the errors above, then re-run: \x1b[36mnpm run validate\x1b[0m`);
  process.exit(1);
}

/** Format a single AJV error into a human-readable string */
function formatError(err) {
  switch (err.keyword) {
    case 'required':
      return `missing required field "${err.params.missingProperty}"`;
    case 'enum':
      return `must be one of: ${err.params.allowedValues.map(v => JSON.stringify(v)).join(', ')}`;
    case 'minLength':
      return `too short — minimum ${err.params.limit} character(s)`;
    case 'maxLength':
      return `too long — maximum ${err.params.limit} character(s)`;
    case 'minimum':
      return `must be ≥ ${err.params.limit}`;
    case 'maximum':
      return `must be ≤ ${err.params.limit}`;
    case 'pattern':
      return `does not match pattern ${err.params.pattern}`;
    case 'format':
      return `invalid ${err.params.format} format`;
    case 'type':
      return `must be ${err.params.type}`;
    case 'additionalProperties':
      return `unknown field "${err.params.additionalProperty}" — remove it or check the schema`;
    case 'anyOf':
      return `must satisfy at least one of the sub-schemas (check required contact fields)`;
    default:
      return err.message ?? `${err.keyword} violation`;
  }
}
