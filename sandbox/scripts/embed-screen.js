#!/usr/bin/env node
/**
 * Injects screen JSON into index.html for offline/preview mode.
 * Usage: node scripts/embed-screen.js <yaml-or-json-file>
 * Example: node scripts/embed-screen.js screens/report-builder.yaml
 */

const fs = require('fs')
const path = require('path')

const INDEX_HTML = path.join(__dirname, '..', 'frontend', 'index.html')
const YAML = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'js-yaml'))

function loadScreen(filePath) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath)
  const content = fs.readFileSync(fullPath, 'utf-8')

  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return YAML.load(content, { schema: YAML.DEFAULT_SCHEMA })
  }
  return JSON.parse(content)
}

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node scripts/embed-screen.js <path-to-yaml-or-json>')
  console.error('Example: node scripts/embed-screen.js screens/report-builder.yaml')
  process.exit(1)
}

const screenJson = loadScreen(filePath)
const html = fs.readFileSync(INDEX_HTML, 'utf-8')

// Inject screen JSON into the embedded script tag (supports re-injection)
const updated = html.replace(
  /<script id="embedded-screen" type="application\/json">[^<]*<\/script>/,
  `<script id="embedded-screen" type="application/json">${JSON.stringify(screenJson).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</script>`
)

fs.writeFileSync(INDEX_HTML, updated)
console.log(`Embedded screen "${screenJson.meta?.title || 'Без названия'}" into index.html`)
