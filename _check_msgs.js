const fs = require('fs');
const code = fs.readFileSync('src/components/tw-feedback-modal/feedback-modal.jsx', 'utf8');

const defRe = /id:\s*'(tw\.[a-zA-Z0-9_.]+)'/g;
const defined = new Set();
let m;
while ((m = defRe.exec(code))) defined.add(m[1]);

const useRe = /messages\.([a-zA-Z0-9_]+)/g;
const used = new Set();
while ((m = useRe.exec(code))) used.add(m[1]);

const block = code.slice(code.indexOf('const messages = defineMessages'));
const nameToId = {};
const nameRe = /(\w+):\s*\{\s*id:\s*'(tw\.[a-zA-Z0-9_.]+)'/g;
while ((m = nameRe.exec(block))) nameToId[m[1]] = m[2];

const missing = [];
for (const n of used) {
  if (!nameToId[n]) missing.push(n + '(no id)');
  else if (!defined.has(nameToId[n])) missing.push(n + '(' + nameToId[n] + ')');
}

console.log('defined ids:', defined.size, '| used names:', used.size);
console.log('MISSING:', missing.length ? missing.join(', ') : 'none');
