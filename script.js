const expressionDisplay = document.querySelector('#expression');
const resultDisplay = document.querySelector('#result');
const fractionDisplay = document.querySelector('#fractionResult');
const modeIndicator = document.querySelector('#modeIndicator');
const angleReadout = document.querySelector('#angleReadout');
const shiftIndicator = document.querySelector('#shiftIndicator');
const alphaIndicator = document.querySelector('#alphaIndicator');
const memoryIndicator = document.querySelector('#memoryIndicator');
const setupPanel = document.querySelector('#setupPanel');

let expression = '';
let answer = 0;
let memory = 0;
let angleMode = 'DEG';
let shiftOn = false;
let alphaOn = false;
let justEvaluated = false;

const inverseFunctions = { sin: 'asin', cos: 'acos', tan: 'atan', sinh: 'asinh', cosh: 'acosh', tanh: 'atanh' };
const shiftedLabels = { log: '10ˣ', ln: 'eˣ', sin: 'sin⁻¹', cos: 'cos⁻¹', tan: 'tan⁻¹', sinh: 'sinh⁻¹', cosh: 'cosh⁻¹', tanh: 'tanh⁻¹' };
const unaryFunctions = new Set(['sqrt', 'cbrt', 'log', 'ln', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh']);

function render() {
  expressionDisplay.textContent = expression.replaceAll('*', '×').replaceAll('/', '÷').replaceAll('-', '−');
  modeIndicator.textContent = angleMode;
  angleReadout.textContent = angleMode;
  shiftIndicator.classList.toggle('lit', shiftOn);
  alphaIndicator.classList.toggle('lit', alphaOn);
  memoryIndicator.classList.toggle('lit', memory !== 0);
  document.querySelector('[data-action="shift"]').setAttribute('aria-pressed', String(shiftOn));
  document.querySelector('[data-action="alpha"]').setAttribute('aria-pressed', String(alphaOn));
}

function insert(value) {
  if (justEvaluated && /^[0-9.(πe]/.test(value)) expression = '';
  justEvaluated = false;
  expression += value;
  shiftOn = false;
  alphaOn = false;
  render();
}

function formatNumber(value) {
  if (!Number.isFinite(value)) throw new Error('Math error');
  if (Object.is(value, -0) || Math.abs(value) < 1e-14) value = 0;
  return String(Number(value.toPrecision(12))).replace('e+', 'e');
}

function gcd(left, right) {
  while (right) [left, right] = [right, left % right];
  return left || 1;
}

function approximateFraction(value) {
  if (Math.abs(value) < 1e-12 || Math.abs(value) > 1e9) return null;
  const sign = Math.sign(value);
  const target = Math.abs(value);
  let numerator = Math.round(target);
  let denominator = 1;
  let error = Math.abs(target - numerator);
  for (let candidateDenominator = 2; candidateDenominator <= 1000; candidateDenominator += 1) {
    const candidateNumerator = Math.round(target * candidateDenominator);
    const candidateError = Math.abs(target - candidateNumerator / candidateDenominator);
    if (candidateError < error) {
      numerator = candidateNumerator;
      denominator = candidateDenominator;
      error = candidateError;
      if (error < 1e-12) break;
    }
  }
  if (denominator === 1 || error > 1e-10) return null;
  const divisor = gcd(numerator, denominator);
  return [sign * numerator / divisor, denominator / divisor];
}

function showValue(value) {
  answer = value;
  resultDisplay.textContent = formatNumber(value);
  const fraction = approximateFraction(value);
  fractionDisplay.replaceChildren();
  fractionDisplay.classList.toggle('visible', Boolean(fraction));
  if (fraction) {
    const top = document.createElement('span');
    const line = document.createElement('span');
    const bottom = document.createElement('span');
    top.textContent = String(fraction[0]);
    line.className = 'fraction-line';
    bottom.textContent = String(fraction[1]);
    fractionDisplay.append(top, line, bottom);
  }
}

function tokenize(source) {
  const tokens = [];
  source = source.replaceAll('[', '(').replaceAll(']', ')');
  const pattern = /\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+\-]?\d+))?|([A-Za-z]+)|(π)|(\*\*|[+\-*/^(),%!]))/gy;
  let cursor = 0;
  while (cursor < source.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(source);
    if (!match) throw new Error('Check expression');
    cursor = pattern.lastIndex;
    if (match[1] !== undefined) tokens.push({ type: 'number', value: Number(`${match[1]}${match[2] ? `e${match[2]}` : ''}`) });
    else if (match[3]) tokens.push({ type: 'name', value: match[3] });
    else if (match[4]) tokens.push({ type: 'name', value: 'pi' });
    else tokens.push({ type: 'operator', value: match[5] });
  }
  tokens.push({ type: 'end', value: '' });
  return tokens;
}

function evaluate(source) {
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];

  function expect(value) {
    if (take().value !== value) throw new Error(`Expected ${value}`);
  }

  function parseExpression(minimumPower = 0) {
    const token = take();
    let left;
    if (token.type === 'number') left = token.value;
    else if (token.type === 'name' && token.value.toLowerCase() === 'ans') left = answer;
    else if (token.type === 'name' && token.value.toLowerCase() === 'pi') left = Math.PI;
    else if (token.type === 'name' && token.value.toLowerCase() === 'e') left = Math.E;
    else if (token.value === '+' || token.value === '-') left = (token.value === '-' ? -1 : 1) * parseExpression(35);
    else if (token.value === '(') {
      left = parseExpression();
      expect(')');
    } else if (token.type === 'name') {
      const name = token.value.toLowerCase();
      if (peek().value !== '(') throw new Error('Expected ( after function');
      take();
      const args = [];
      if (peek().value !== ')') {
        args.push(parseExpression());
        while (peek().value === ',') {
          take();
          args.push(parseExpression());
        }
      }
      expect(')');
      left = applyFunction(name, args);
    } else throw new Error('Check expression');

    while (true) {
      const next = peek();
      if (next.value === '%' || next.value === '!') {
        if (40 < minimumPower) break;
        take();
        left = next.value === '%' ? left / 100 : factorial(left);
        continue;
      }
      const implicitMultiply = next.type === 'number' || next.value === '(' ||
        (next.type === 'name' && !['npr', 'ncr'].includes(next.value.toLowerCase()));
      const binding = implicitMultiply ? [20, 21] : bindingPower(next);
      if (!binding || binding[0] < minimumPower) break;
      if (!implicitMultiply) take();
      const right = parseExpression(binding[1]);
      if (implicitMultiply) left *= right;
      else if (next.value === '+') left += right;
      else if (next.value === '-') left -= right;
      else if (next.value === '*') left *= right;
      else if (next.value === '/') left /= right;
      else if (next.value === '^' || next.value === '**') left **= right;
      else if (next.value.toLowerCase() === 'npr') left = permutation(left, right);
      else if (next.value.toLowerCase() === 'ncr') left = permutation(left, right) / factorial(right);
    }
    return left;
  }

  const result = parseExpression();
  if (peek().type !== 'end') throw new Error('Check expression');
  if (!Number.isFinite(result)) throw new Error('Math error');
  return result;
}

function bindingPower(token) {
  if (token.type === 'name' && ['npr', 'ncr'].includes(token.value.toLowerCase())) return [25, 26];
  if (token.value === '+' || token.value === '-') return [10, 11];
  if (token.value === '*' || token.value === '/') return [20, 21];
  if (token.value === '^' || token.value === '**') return [30, 30];
  return null;
}

function factorial(value) {
  if (!Number.isInteger(value) || value < 0 || value > 170) throw new Error('Factorial needs an integer from 0 to 170');
  let result = 1;
  for (let factor = 2; factor <= value; factor += 1) result *= factor;
  return result;
}

function permutation(n, r) {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) throw new Error('Use integers where n ≥ r');
  return factorial(n) / factorial(n - r);
}

function applyFunction(name, args) {
  const value = args[0];
  const toRadians = angleMode === 'DEG' ? Math.PI / 180 : 1;
  const inverseAngle = (radians) => angleMode === 'DEG' ? radians * 180 / Math.PI : radians;
  if (name === 'frac') {
    if (args.length !== 2 || args[1] === 0) throw new Error('Fraction needs a non-zero denominator');
    return args[0] / args[1];
  }
  if (name === 'npr' || name === 'ncr') {
    if (args.length !== 2) throw new Error(`${name} needs two values`);
    const result = permutation(args[0], args[1]);
    return name === 'npr' ? result : result / factorial(args[1]);
  }
  if (args.length !== 1 || !unaryFunctions.has(name)) throw new Error('Unknown function');
  const functions = {
    sqrt: () => Math.sqrt(value), cbrt: () => Math.cbrt(value), log: () => Math.log10(value), ln: () => Math.log(value),
    sin: () => Math.sin(value * toRadians), cos: () => Math.cos(value * toRadians), tan: () => Math.tan(value * toRadians),
    asin: () => inverseAngle(Math.asin(value)), acos: () => inverseAngle(Math.acos(value)), atan: () => inverseAngle(Math.atan(value)),
    sinh: () => Math.sinh(value), cosh: () => Math.cosh(value), tanh: () => Math.tanh(value),
    asinh: () => Math.asinh(value), acosh: () => Math.acosh(value), atanh: () => Math.atanh(value)
  };
  return functions[name]();
}

function calculate() {
  if (!expression.trim()) return;
  try {
    const completedExpression = closeOpenParentheses(expression);
    const value = evaluate(completedExpression);
    showValue(value);
    expression = formatNumber(value);
    justEvaluated = true;
  } catch (error) {
    resultDisplay.textContent = error.message || 'Math error';
    fractionDisplay.replaceChildren();
    fractionDisplay.classList.remove('visible');
    justEvaluated = false;
  }
  render();
}

function closeOpenParentheses(source) {
  let openCount = 0;
  for (const character of source) {
    if (character === '(') openCount += 1;
    else if (character === ')') openCount -= 1;
  }
  if (openCount < 0) return source;
  return source + ')'.repeat(openCount);
}

function clearAll() {
  expression = '';
  resultDisplay.textContent = '0';
  fractionDisplay.replaceChildren();
  fractionDisplay.classList.remove('visible');
  justEvaluated = false;
  shiftOn = false;
  alphaOn = false;
  render();
}

function deleteLast() {
  expression = expression.slice(0, -1);
  justEvaluated = false;
  render();
}

function memoryAction(action) {
  try {
    const value = expression ? evaluate(expression) : answer;
    if (action === 'memory-add') memory += value;
    if (action === 'memory-subtract') memory -= value;
    if (action === 'memory-clear') memory = 0;
    if (action === 'memory-recall') insert(formatNumber(memory));
    else render();
  } catch {
    resultDisplay.textContent = 'Check expression';
  }
}

function handleAction(action) {
  if (action === 'shift') {
    shiftOn = !shiftOn;
    alphaOn = false;
    document.querySelectorAll('[data-function]').forEach((button) => {
      const base = button.dataset.function;
      button.textContent = shiftOn ? (shiftedLabels[base] || `${base}⁻¹`) : base;
    });
  } else if (action === 'alpha') {
    alphaOn = !alphaOn;
    shiftOn = false;
  } else if (action === 'mode') angleMode = angleMode === 'DEG' ? 'RAD' : 'DEG';
  else if (action === 'setup') setupPanel.hidden = !setupPanel.hidden;
  else if (action === 'root') insert(shiftOn ? 'cbrt(' : 'sqrt(');
  else if (action === 'square') insert(shiftOn ? '^3' : '^2');
  else if (action === 'angle-deg' || action === 'angle-rad') {
    angleMode = action === 'angle-deg' ? 'DEG' : 'RAD';
    setupPanel.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.action === action)));
  } else if (action === 'calc' || action === 'equals') calculate();
  else if (action === 'delete') deleteLast();
  else if (action === 'clear') clearAll();
  else if (action.startsWith('memory-')) memoryAction(action);
  else if (action === 'history') insert('Ans');
  render();
}

document.querySelector('.keypad').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.action) handleAction(button.dataset.action);
  else if (button.dataset.function) {
    const base = button.dataset.function;
    if (shiftOn && base === 'log') insert('10^(');
    else if (shiftOn && base === 'ln') insert('e^(');
    else insert(`${shiftOn ? inverseFunctions[base] : base}(`);
  } else if (button.dataset.insert !== undefined) {
    insert(alphaOn && button.dataset.insert === 'Ans' ? 'π' : button.dataset.insert);
  }
});

document.querySelector('.utility-row').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button?.dataset.action) handleAction(button.dataset.action);
});
setupPanel.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button?.dataset.action) handleAction(button.dataset.action);
});
document.querySelector('#historyButton').addEventListener('click', () => handleAction('history'));

document.addEventListener('keydown', (event) => {
  if (/^[0-9.+\-*/^(),%\[\]]$/.test(event.key)) {
    event.preventDefault();
    insert(event.key);
  } else if (event.key === 'Enter' || event.key === '=') {
    event.preventDefault();
    calculate();
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    deleteLast();
  } else if (event.key === 'Delete' || event.key === 'Escape') {
    event.preventDefault();
    clearAll();
  } else if (/^[a-z]$/i.test(event.key)) {
    event.preventDefault();
    insert(event.key);
  }
});

render();