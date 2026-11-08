'use strict';
// Genera public/version.js dalla versione in package.json.
// Viene eseguito in automatico da `npm version <patch|minor|major>`.
const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');
const out = path.join(__dirname, '..', 'public', 'version.js');
fs.writeFileSync(out, `// Generato da scripts/sync-version.js: non modificare a mano.\nself.SPORTA_VERSION = '${version}';\n`);
console.log('public/version.js ->', version);
