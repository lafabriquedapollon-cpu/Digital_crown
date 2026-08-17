import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Google login entry point', () => {
  it('uses a native OAuth link instead of a JavaScript-only click handler', () => {
    const source = fs.readFileSync(path.resolve(__dirname, 'LoginPage.tsx'), 'utf8')

    expect(source).toContain('href={`${API_BASE}/api/auth/google/authorize`}')
    expect(source).not.toContain('handleGoogleLogin')
  })
})
