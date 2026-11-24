import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAst } from 'rollup/parseAst'

const SRC_ROOT = fileURLToPath(new URL('../src', import.meta.url))

function walkJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkJs(p, out)
    else if (p.endsWith('.js') && !name.endsWith('.min.js')) out.push(p)
  }
  return out
}

const KNOWN_GLOBALS = new Set([
  // ECMAScript / JS built-ins
  'Array', 'ArrayBuffer', 'BigInt', 'Boolean', 'DataView', 'Date', 'Error', 'EvalError',
  'Float32Array', 'Float64Array', 'Function', 'Infinity', 'Int8Array', 'Int16Array', 'Int32Array',
  'Intl', 'JSON', 'Map', 'Math', 'NaN', 'Number', 'Object', 'Promise', 'Proxy', 'RangeError',
  'ReadableStream', 'ReferenceError', 'Reflect', 'RegExp', 'Set', 'SharedArrayBuffer', 'String',
  'Symbol', 'SyntaxError', 'TypeError', 'URIError', 'Uint8Array', 'Uint8ClampedArray', 'Uint16Array',
  'Uint32Array', 'WeakMap', 'WeakSet', 'decodeURI', 'decodeURIComponent', 'encodeURI',
  'encodeURIComponent', 'eval', 'globalThis', 'isFinite', 'isNaN', 'parseFloat', 'parseInt',
  'structuredClone', 'undefined',
  // Node / Electron globals
  'Buffer', 'process', '__dirname', '__filename', 'setImmediate', 'clearImmediate',
  // Web / Browser / Renderer globals
  'AbortController', 'AbortSignal', 'AnalyserNode', 'Audio', 'AudioBuffer', 'AudioContext',
  'AudioWorkletNode', 'Blob', 'BroadcastChannel', 'CSS', 'CanvasGradient', 'ClipboardEvent',
  'CloseEvent', 'CustomEvent', 'DOMParser', 'DataTransfer', 'Document', 'DragEvent', 'Element',
  'ErrorEvent', 'Event', 'EventSource', 'File', 'FileList', 'FileReader', 'FocusEvent',
  'FormData', 'HTMLCanvasElement', 'HTMLElement', 'Headers', 'History', 'Image', 'InputEvent',
  'IntersectionObserver', 'KeyboardEvent', 'Location', 'MediaRecorder', 'MediaStream',
  'MessageChannel', 'MessageEvent', 'MouseEvent', 'MutationObserver', 'Navigator', 'Node',
  'Notification', 'Option', 'Path2D', 'PointerEvent', 'Request', 'ResizeObserver', 'Response',
  'SVGElement', 'Screen', 'SpeechSynthesisUtterance', 'Storage', 'SubmitEvent', 'TextDecoder',
  'TextEncoder', 'URL', 'URLSearchParams', 'WebAssembly', 'WebGLRenderingContext', 'WebSocket',
  'WheelEvent', 'Worker', 'XMLSerializer', 'alert', 'atob', 'btoa', 'cancelAnimationFrame',
  'clearInterval', 'clearTimeout', 'confirm', 'console', 'crypto', 'document', 'fetch',
  'getComputedStyle', 'history', 'localStorage', 'location', 'matchMedia', 'navigator',
  'performance', 'prompt', 'queueMicrotask', 'requestAnimationFrame', 'screen', 'sessionStorage',
  'setInterval', 'setTimeout', 'speechSynthesis', 'window', 'webkitAudioContext',
  // Libraries injected via <script> tag
  'THREE', 'PIXI', 'Live2DCubismCore'
])

function findUndeclaredIdentifiers(filePath) {
  const code = readFileSync(filePath, 'utf8')
  const ast = parseAst(code)
  const scopes = [new Set()]
  const issues = []

  const bindPattern = (pat, scope) => {
    if (!pat) return
    if (pat.type === 'Identifier') scope.add(pat.name)
    else if (pat.type === 'ArrayPattern') pat.elements.forEach((e) => bindPattern(e, scope))
    else if (pat.type === 'ObjectPattern') {
      pat.properties.forEach((p) => bindPattern(p.type === 'RestElement' ? p.argument : p.value, scope))
    } else if (pat.type === 'RestElement') bindPattern(pat.argument, scope)
    else if (pat.type === 'AssignmentPattern') bindPattern(pat.left, scope)
  }

  const hoistVars = (node, fnScope) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach((n) => hoistVars(n, fnScope))
      return
    }
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) return
    if (node.type === 'VariableDeclaration' && node.kind === 'var') {
      node.declarations.forEach((d) => bindPattern(d.id, fnScope))
    }
    for (const k of Object.keys(node)) {
      if (k !== 'loc' && k !== 'start' && k !== 'end') hoistVars(node[k], fnScope)
    }
  }

  const declareLexicalInBody = (stmts, scope) => {
    for (const s of stmts) {
      if (s.type === 'FunctionDeclaration' && s.id) scope.add(s.id.name)
      else if (s.type === 'ClassDeclaration' && s.id) scope.add(s.id.name)
      else if (s.type === 'VariableDeclaration' && s.kind !== 'var') {
        s.declarations.forEach((d) => bindPattern(d.id, scope))
      }
    }
  }

  const isDeclared = (name) => {
    if (KNOWN_GLOBALS.has(name)) return true
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i].has(name)) return true
    }
    return false
  }

  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, parent))
      return
    }

    switch (node.type) {
      case 'Program': {
        for (const s of node.body) {
          if (s.type === 'ImportDeclaration') {
            s.specifiers.forEach((sp) => scopes[0].add(sp.local.name))
          } else if (s.type === 'FunctionDeclaration' && s.id) {
            scopes[0].add(s.id.name)
          } else if (s.type === 'ClassDeclaration' && s.id) {
            scopes[0].add(s.id.name)
          } else if (s.type === 'VariableDeclaration') {
            s.declarations.forEach((d) => bindPattern(d.id, scopes[0]))
          } else if (s.type === 'ExportNamedDeclaration' && s.declaration) {
            if (s.declaration.id) scopes[0].add(s.declaration.id.name)
            if (s.declaration.declarations) {
              s.declaration.declarations.forEach((d) => bindPattern(d.id, scopes[0]))
            }
          } else if (s.type === 'ExportDefaultDeclaration' && s.declaration?.id) {
            scopes[0].add(s.declaration.id.name)
          }
        }
        hoistVars(node.body, scopes[0])
        visit(node.body, node)
        return
      }
      case 'BlockStatement': {
        const block = new Set()
        scopes.push(block)
        declareLexicalInBody(node.body, block)
        visit(node.body, node)
        scopes.pop()
        return
      }
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement': {
        const sc = new Set()
        scopes.push(sc)
        const init = node.init || node.left
        if (init && init.type === 'VariableDeclaration') {
          init.declarations.forEach((d) => bindPattern(d.id, sc))
        }
        visit(node.init, node)
        visit(node.left, node)
        visit(node.right, node)
        visit(node.test, node)
        visit(node.update, node)
        visit(node.body, node)
        scopes.pop()
        return
      }
      case 'SwitchStatement': {
        visit(node.discriminant, node)
        const sc = new Set()
        scopes.push(sc)
        for (const c of node.cases) declareLexicalInBody(c.consequent, sc)
        for (const c of node.cases) {
          visit(c.test, c)
          visit(c.consequent, c)
        }
        scopes.pop()
        return
      }
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const fnScope = new Set(['arguments', 'this'])
        if (node.id && node.type === 'FunctionDeclaration') {
          scopes[scopes.length - 1].add(node.id.name)
        }
        if (node.id && node.type === 'FunctionExpression') {
          fnScope.add(node.id.name)
        }
        node.params.forEach((p) => bindPattern(p, fnScope))
        scopes.push(fnScope)
        hoistVars(node.body, fnScope)
        if (node.body.type === 'BlockStatement') {
          declareLexicalInBody(node.body.body, fnScope)
          visit(node.body.body, node.body)
        } else {
          visit(node.body, node)
        }
        scopes.pop()
        return
      }
      case 'ClassDeclaration':
      case 'ClassExpression': {
        const sc = new Set()
        if (node.id) sc.add(node.id.name)
        scopes.push(sc)
        visit(node.superClass, node)
        visit(node.body, node)
        scopes.pop()
        return
      }
      case 'CatchClause': {
        const sc = new Set()
        bindPattern(node.param, sc)
        scopes.push(sc)
        visit(node.body, node)
        scopes.pop()
        return
      }
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'ExportAllDeclaration':
      case 'MetaProperty':
        return
      case 'LabeledStatement':
        visit(node.body, node)
        return
      case 'MemberExpression':
        visit(node.object, node)
        if (node.computed) visit(node.property, node)
        return
      case 'Property':
        if (node.computed) visit(node.key, node)
        visit(node.value, node)
        return
      case 'MethodDefinition':
      case 'PropertyDefinition':
        if (node.computed) visit(node.key, node)
        visit(node.value, node)
        return
      case 'UnaryExpression':
        if (node.operator === 'typeof' && node.argument?.type === 'Identifier') return
        visit(node.argument, node)
        return
      case 'Identifier':
        if (parent?.type === 'VariableDeclarator' && parent.id === node) return
        if (parent?.type === 'ExportSpecifier') return
        if (!isDeclared(node.name)) {
          const line = code.slice(0, node.start).split('\n').length
          issues.push(`${relative(SRC_ROOT, filePath)}:${line} (${node.name})`)
        }
        return
    }

    for (const k of Object.keys(node)) {
      if (k !== 'loc' && k !== 'start' && k !== 'end') visit(node[k], node)
    }
  }

  visit(ast, null)
  return issues
}

describe('static guard: tidak ada variabel tak terdeklarasi (ReferenceError) di src/', () => {
  it('seluruh modul ESM di avatar/src tidak memakai identifier tanpa deklarasi', () => {
    const files = walkJs(SRC_ROOT)
    const allIssues = files.flatMap((f) => findUndeclaredIdentifiers(f))
    expect(allIssues).toEqual([])
  })
})
