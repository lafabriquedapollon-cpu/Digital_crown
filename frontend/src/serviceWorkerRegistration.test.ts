import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('service worker registration', () => {
  it('keeps Workbox as the only root-scope worker', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'main.tsx'), 'utf8')

    expect(source).toContain('registerSW({')
    expect(source).toContain('onNeedRefresh() {}')
    expect(source).not.toMatch(/serviceWorker\.register\(['"]\/sw\.js['"]\)/)
  })

  it('never enables automatic PWA reloads', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../vite.config.ts'), 'utf8')

    expect(config).toContain("registerType: 'prompt'")
    expect(config).toContain('injectRegister: false')
    expect(config).not.toContain("registerType: 'autoUpdate'")
  })
})
