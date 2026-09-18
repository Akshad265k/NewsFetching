const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('scratch/app.js', 'utf8');

const doc = {
  getElementById: () => ({ style: {}, classList: { add() {}, remove() {} } }),
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
  addEventListener: () => {},
  body: { appendChild() {} },
  head: { appendChild() {} },
};

const win = {
  document: doc,
  addEventListener: () => {},
  matchMedia: () => ({ matches: false }),
  location: { pathname: '', search: '' },
  navigator: {},
  requestAnimationFrame: () => {},
  setTimeout: () => {},
  clearTimeout: () => {},
};

const ctx = vm.createContext({
  window: win,
  document: doc,
  console: console,
  setTimeout: () => {},
  clearTimeout: () => {},
  requestAnimationFrame: () => {},
  navigator: {},
  location: win.location,
});

try {
  vm.runInContext(code, ctx);
  console.log('Successfully executed app.js in sandbox!');
  console.log('0x6ee:', ctx._0x4bd6(0x6ee));
  console.log('0x585:', ctx._0x4bd6(0x585));
  console.log('0x77b:', ctx._0x4bd6(0x77b));
  console.log('0x164:', ctx._0x4bd6(0x164));
  console.log('0x66a:', ctx._0x4bd6(0x66a));
  const full = ctx._0x4bd6(0x24d) + ctx._0x4bd6(0x28d) + ctx._0x4bd6(0x21e) + ctx._0x4bd6(0x29e) + ctx._0x4bd6(0x7ac) + ctx._0x4bd6(0x26b);
  console.log('Full alphabet:', full);
  console.log('Reversed:', full.split('').reverse().join(''));
} catch (e) {
  console.error('Error running app.js:', e);
}
