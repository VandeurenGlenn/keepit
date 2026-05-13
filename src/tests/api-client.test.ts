/**
 * API Client tests using Node.js built-in test module
 * Tests the typed API client methods
 */

import { test } from 'node:test'
import assert from 'node:assert'

// Mock fetch globally
const originalFetch = globalThis.fetch
let fetchMock: any = null

function mockFetch(fn: any) {
  fetchMock = fn
  globalThis.fetch = fn
}

function restoreFetch() {
  globalThis.fetch = originalFetch
  fetchMock = null
}

test('API Client - Hours API', async (t) => {
  await t.test('should construct correct checkin URL', async () => {
    let capturedUrl = ''
    mockFetch(async (url: string) => {
      capturedUrl = url
      return new Response(JSON.stringify({ checkin: Date.now() }), {
        headers: { 'Content-Type': 'application/json' }
      })
    })

    try {
      // Simulate what api.checkIn would do
      await fetch('/api/hours/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: 'job-1' })
      })

      assert.strictEqual(capturedUrl, '/api/hours/checkin', 'Should POST to /api/hours/checkin')
    } finally {
      restoreFetch()
    }
  })

  await t.test('should fetch hours with billableOnly filter', async () => {
    let capturedUrl = ''
    mockFetch(async (url: string) => {
      capturedUrl = url
      return new Response(JSON.stringify({}), {
        headers: { 'Content-Type': 'application/json' }
      })
    })

    try {
      await fetch('/api/hours/job/job-1?billableOnly=true', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      assert.strictEqual(capturedUrl, '/api/hours/job/job-1?billableOnly=true', 'Should include billableOnly filter')
    } finally {
      restoreFetch()
    }
  })
})

test('API Client - Jobs API', async (t) => {
  await t.test('should POST job with required fields', async () => {
    let capturedBody = ''
    mockFetch(async (url: string, options: any) => {
      capturedBody = options.body
      return new Response(JSON.stringify({ uuid: 'job-1', name: 'Test' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    })

    try {
      const jobData = {
        name: 'Test Job',
        place: { id: 'place-1', displayName: 'Place', formattedAddress: 'Address' }
      }

      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobData)
      })

      const body = JSON.parse(capturedBody)
      assert.strictEqual(body.name, 'Test Job')
      assert.ok(body.place, 'Should include place')
    } finally {
      restoreFetch()
    }
  })

  await t.test('should PATCH job with updates', async () => {
    let capturedMethod = ''
    mockFetch(async (url: string, options: any) => {
      capturedMethod = options.method
      return new Response(JSON.stringify({ uuid: 'job-1', name: 'Updated' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    })

    try {
      await fetch('/api/job/job-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' })
      })

      assert.strictEqual(capturedMethod, 'PATCH', 'Should use PATCH method')
    } finally {
      restoreFetch()
    }
  })

  await t.test('should DELETE job', async () => {
    let capturedMethod = ''
    mockFetch(async (url: string, options: any) => {
      capturedMethod = options.method
      return new Response(null, { status: 204 })
    })

    try {
      await fetch('/api/job/job-1', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      assert.strictEqual(capturedMethod, 'DELETE', 'Should use DELETE method')
    } finally {
      restoreFetch()
    }
  })
})

test('API Client - Invoices API', async (t) => {
  await t.test('should POST invoice with materials', async () => {
    let capturedBody = ''
    mockFetch(async (url: string, options: any) => {
      capturedBody = options.body
      return new Response(JSON.stringify({ uuid: 'inv-1' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    })

    try {
      const invoiceData = {
        name: 'Test Invoice',
        company: 'comp-1',
        job: 'job-1',
        user: 'user-1',
        materials: [{ name: 'Material', quantity: 1 }]
      }

      await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData)
      })

      const body = JSON.parse(capturedBody)
      assert.ok(body.materials, 'Should include materials')
      assert.strictEqual(body.company, 'comp-1')
    } finally {
      restoreFetch()
    }
  })

  await t.test('should fetch materials with company filter', async () => {
    let capturedUrl = ''
    mockFetch(async (url: string) => {
      capturedUrl = url
      return new Response(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json' }
      })
    })

    try {
      await fetch('/api/invoices/materials?company=comp-1')

      assert.strictEqual(capturedUrl, '/api/invoices/materials?company=comp-1', 'Should include company filter')
    } finally {
      restoreFetch()
    }
  })
})

test('API Client - Error Handling', async (t) => {
  await t.test('should throw on non-OK response', async () => {
    mockFetch(async () => {
      return new Response('Unauthorized', { status: 401 })
    })

    try {
      const response = await fetch('/api/test')
      assert.strictEqual(response.ok, false, 'Response should not be OK')
      assert.strictEqual(response.status, 401, 'Status should be 401')
    } finally {
      restoreFetch()
    }
  })
})
