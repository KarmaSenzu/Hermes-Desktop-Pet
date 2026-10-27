import { describe, it, expect } from 'vitest'
import YAML from 'yaml'
import { assertScalar, setEnvVar, applyProviderConfig } from '../src/main/hermes-config.js'

describe('hermes-config tests', () => {
  const sampleYaml = `# Header comment
model:
  default: old-model
  provider: custom
  base_url: http://127.0.0.1:20128/v1

# Section providers
providers:
  prov_a:
    name: Provider A
    base_url: http://127.0.0.1:20128/v1
    api_key: key-a
    default_model: model-a
  prov_b:
    name: Provider B
    base_url: http://127.0.0.1:20128/v1
    api_key: key-b
    default_model: model-b

# Section custom_providers
custom_providers:
  - name: Provider A
    base_url: http://127.0.0.1:20128/v1
    api_key: key-a
    model: model-a
  - name: Provider B
    base_url: http://127.0.0.1:20128/v1
    api_key: key-b
    model: model-b
`

  // 1) config dengan komentar + providers {A,B} + custom_providers [A,B]; upsert C -> A,B,C ada; komentar tetap ada.
  it('1) config dengan komentar + providers {A,B} + custom_providers [A,B]; upsert C -> A,B,C ada; komentar tetap ada', () => {
    const updated = applyProviderConfig(sampleYaml, {
      name: 'Provider C',
      baseUrl: 'http://127.0.0.1:20128/v1',
      apiKey: 'key-c',
      model: 'model-c'
    })

    expect(updated).toContain('# Header comment')
    expect(updated).toContain('# Section providers')
    expect(updated).toContain('# Section custom_providers')

    const doc = YAML.parse(updated)
    expect(doc.providers.prov_a.name).toBe('Provider A')
    expect(doc.providers.prov_b.name).toBe('Provider B')
    expect(doc.providers.Provider_C.name).toBe('Provider C')
    expect(doc.custom_providers).toHaveLength(3)
    expect(doc.custom_providers.map((p) => p.name)).toEqual(['Provider A', 'Provider B', 'Provider C'])
  })

  // 2) upsert A (sudah ada) -> terupdate, tanpa duplikat.
  it('2) upsert A (sudah ada) -> terupdate, tanpa duplikat', () => {
    const step1 = applyProviderConfig(sampleYaml, {
      name: 'Provider A',
      baseUrl: 'http://127.0.0.1:20128/v1',
      apiKey: 'new-key-a',
      model: 'new-model-a'
    })

    const doc = YAML.parse(step1)
    expect(doc.custom_providers).toHaveLength(2)
    const provA = doc.custom_providers.find((p) => p.name === 'Provider A')
    expect(provA.api_key).toBe('new-key-a')
    expect(provA.model).toBe('new-model-a')
    expect(doc.providers.Provider_A.api_key).toBe('new-key-a')
  })

  // 3) model "x\nhacked: true" -> throw.
  it('3) model "x\\nhacked: true" -> throw', () => {
    expect(() => {
      applyProviderConfig(sampleYaml, {
        name: 'Provider Malicious',
        baseUrl: 'http://127.0.0.1:20128/v1',
        apiKey: 'some-key',
        model: 'x\nhacked: true'
      })
    }).toThrow()
  })

  // 4) name berisi "'" tidak merusak YAML (hasil tetap bisa di-parse ulang).
  it('4) name berisi "\'" tidak merusak YAML (hasil tetap bisa di-parse ulang)', () => {
    const updated = applyProviderConfig(sampleYaml, {
      name: "O'Reilly Provider",
      baseUrl: 'http://127.0.0.1:20128/v1',
      apiKey: 'oreilly-key',
      model: 'oreilly-model'
    })

    const doc = YAML.parseDocument(updated)
    expect(doc.errors).toHaveLength(0)
    const js = doc.toJS()
    expect(js.custom_providers.some((p) => p.name === "O'Reilly Provider")).toBe(true)
  })

  // 5) setEnvVar dengan nilai "a$&b" -> hasil mengandung "a$&b" persis.
  it('5) setEnvVar dengan nilai "a$&b" -> hasil mengandung "a$&b" persis', () => {
    const envText = 'OPENAI_API_KEY=oldkey\nFOO=bar\n'
    const updated = setEnvVar(envText, 'OPENAI_API_KEY', 'a$&b')
    expect(updated).toContain('OPENAI_API_KEY=a$&b')
    expect(updated).not.toContain('aOPENAI_API_KEY=oldkeyb')
  })

  // 6) setEnvVar: key lain tidak berubah.
  it('6) setEnvVar: key lain tidak berubah', () => {
    const envText = 'FIRST=1\nOPENAI_API_KEY=old\nLAST=2\n'
    const updated = setEnvVar(envText, 'OPENAI_API_KEY', 'newkey')
    expect(updated).toContain('FIRST=1\n')
    expect(updated).toContain('LAST=2\n')
    expect(updated).toContain('OPENAI_API_KEY=newkey\n')
  })

  // 7) YAML rusak -> throw dan teks input tidak berubah.
  it('7) YAML rusak -> throw dan teks input tidak berubah', () => {
    const brokenYaml = 'model: [unclosed brackets\nfoo: bar: baz'
    expect(() => {
      applyProviderConfig(brokenYaml, {
        name: 'Provider D',
        baseUrl: 'http://127.0.0.1:20128/v1',
        apiKey: 'key-d',
        model: 'model-d'
      })
    }).toThrow('config.yaml tidak valid, perubahan dibatalkan')
  })
})
