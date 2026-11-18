/**
 * hermes-config.js — Parser dan serializer non-destruktif untuk config.yaml dan .env Hermes
 */

import YAML from 'yaml'

import { parseHttpUrl } from './url-guard.js'

export function assertScalar(name, value, max = 300) {
  const s = String(value ?? '').trim()
  if (!s || s.length > max || /[\u0000-\u001F\u007F]/.test(s)) {
    throw new Error(`${name} tidak valid`)
  }
  return s
}

export function setEnvVar(text, key, value) {
  const v = assertScalar(key, value, 500)
  const re = new RegExp(`^${key}=.*$`, 'm')
  const line = `${key}=${v}`
  if (re.test(text)) return text.replace(re, () => line) // callback: cegah tafsir $&
  return text + (text === '' || text.endsWith('\n') ? '' : '\n') + line + '\n'
}

export function applyProviderConfig(cfgText, { name, baseUrl, apiKey, model }) {
  const doc = YAML.parseDocument(String(cfgText ?? ''))
  if (doc.errors && doc.errors.length > 0) {
    throw new Error('config.yaml tidak valid, perubahan dibatalkan')
  }

  const validName = assertScalar('name', name, 200)
  const validBaseUrl = assertScalar('baseUrl', baseUrl, 2000)
  if (!parseHttpUrl(validBaseUrl)) {
    throw new Error('baseUrl tidak valid')
  }
  const validApiKey = assertScalar('apiKey', apiKey, 1000)
  const validModel = assertScalar('model', model, 200)

  // 1. Set blok model (model.default, model.provider, model.base_url)
  const modelNode = doc.get('model')
  if (!YAML.isMap(modelNode)) {
    doc.set('model', doc.createNode({}))
  }
  doc.setIn(['model', 'default'], validModel)
  doc.setIn(['model', 'provider'], 'custom')
  doc.setIn(['model', 'base_url'], validBaseUrl)

  // 2. Set blok providers (UPSERT aman tanpa menghilangkan entri lain)
  const providersNode = doc.get('providers')
  if (!YAML.isMap(providersNode)) {
    doc.set('providers', doc.createNode({}))
  }
  const safeName = validName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'custom'
  doc.setIn(['providers', safeName, 'name'], validName)
  doc.setIn(['providers', safeName, 'base_url'], validBaseUrl)
  doc.setIn(['providers', safeName, 'api_key'], validApiKey)
  doc.setIn(['providers', safeName, 'default_model'], validModel)

  // 3. Set blok custom_providers (ambil array lama, UPSERT berdasarkan name, entri lain tetap)
  const jsDoc = doc.toJS() || {}
  let customList = []
  if (Array.isArray(jsDoc.custom_providers)) {
    customList = jsDoc.custom_providers.map((it) => (it && typeof it === 'object' ? { ...it } : it))
  }

  const newEntry = {
    name: validName,
    base_url: validBaseUrl,
    api_key: validApiKey,
    model: validModel
  }

  const existingIdx = customList.findIndex((it) => it && it.name === validName)
  if (existingIdx >= 0) {
    customList = [newEntry, ...customList.filter((_, idx) => idx !== existingIdx)]
  } else {
    customList.push(newEntry)
  }

  doc.set('custom_providers', doc.createNode(customList))

  return doc.toString()
}
