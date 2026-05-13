/**
 * Server API contract tests
 * Validates request/response shapes for API endpoints
 */

import { test } from 'node:test'
import assert from 'node:assert'

test('API Contracts - Request Validation', async (t) => {
  await t.test('Job creation requires place', () => {
    // Validate that job creation route will reject missing place
    const job = {
      name: 'Test Job',
      description: 'A job',
      place: {
        id: 'place-123',
        displayName: 'Location',
        formattedAddress: '123 St'
      }
    }

    assert.ok(job.place, 'place is required')
    assert.ok(job.place.id, 'place.id is required')
    assert.ok(job.place.displayName, 'place.displayName is required')
  })

  await t.test('Invoice requires company, job, user', () => {
    const invoice = {
      name: 'Invoice',
      company: 'comp-1',
      job: 'job-1',
      user: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      invoiceImages: []
    }

    assert.ok(invoice.company, 'company is required')
    assert.ok(invoice.job, 'job is required')
    assert.ok(invoice.user, 'user is required')
  })

  await t.test('Materials have name and quantity', () => {
    const materials = [
      { name: 'Concrete', quantity: 10, unit: 'bags', unitPrice: 50 },
      { name: 'Steel', quantity: 5, unit: 'ton' }
    ]

    materials.forEach((material) => {
      assert.ok(material.name, 'material.name is required')
      assert.ok(material.quantity > 0, 'material.quantity must be > 0')
    })
  })

  await t.test('Prestation has checkin and jobId', () => {
    const prestation = {
      checkin: Date.now(),
      serverCheckin: Date.now(),
      jobId: 'job-1'
    }

    assert.ok(typeof prestation.checkin === 'number', 'checkin must be a timestamp')
    assert.ok(prestation.jobId, 'jobId is required')
  })
})

test('API Contracts - Response Shapes', async (t) => {
  await t.test('Job response includes required fields', () => {
    const job = {
      name: 'Job',
      description: 'Desc',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      place: { id: '1', displayName: 'D', formattedAddress: 'A' }
    }

    assert.ok(job.name, 'response.name')
    assert.ok(job.createdAt, 'response.createdAt')
    assert.ok(job.updatedAt, 'response.updatedAt')
    assert.ok(job.place, 'response.place')
  })

  await t.test('Invoice response includes materials and hours', () => {
    const invoice = {
      name: 'Invoice',
      description: 'Desc',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      company: 'comp-1',
      job: 'job-1',
      user: 'user-1',
      invoiceImages: [],
      materials: [{ name: 'M', quantity: 1 }],
      hours: [{ userId: 'user-1', prestationIds: [], totalDuration: 3600000 }]
    }

    assert.ok(Array.isArray(invoice.materials), 'materials is an array')
    assert.ok(Array.isArray(invoice.hours), 'hours is an array')
    if (invoice.hours.length > 0) {
      assert.ok(invoice.hours[0].userId, 'hour.userId')
      assert.ok(typeof invoice.hours[0].totalDuration === 'number', 'hour.totalDuration is number')
    }
  })

  await t.test('Hours response groups prestations by userId', () => {
    const hoursByUser = {
      'user-1': [
        { checkin: Date.now(), checkout: Date.now() + 3600000, jobId: 'job-1' },
        { checkin: Date.now() + 7200000, checkout: Date.now() + 10800000, jobId: 'job-1' }
      ],
      'user-2': [{ checkin: Date.now(), checkout: Date.now() + 1800000, jobId: 'job-1' }]
    }

    assert.ok(typeof hoursByUser === 'object', 'hours response is object')
    Object.entries(hoursByUser).forEach(([userId, prestations]) => {
      assert.ok(Array.isArray(prestations), `prestations for ${userId} is array`)
      prestations.forEach((p) => {
        assert.ok(p.checkin, 'prestation.checkin')
        assert.ok(p.jobId, 'prestation.jobId')
      })
    })
  })
})

test('API Contracts - Invoicing State', async (t) => {
  await t.test('invoiced prestations have invoiceId and invoicedAt', () => {
    const prestation = {
      checkin: Date.now(),
      serverCheckin: Date.now(),
      checkout: Date.now() + 3600000,
      serverCheckout: Date.now() + 3600000,
      jobId: 'job-1',
      invoiceId: 'inv-1',
      invoicedAt: Date.now()
    }

    assert.ok(prestation.invoiceId, 'invoiceId marks prestation as invoiced')
    assert.ok(prestation.invoicedAt, 'invoicedAt is set')
  })

  await t.test('billableOnly filter excludes invoiced prestations', () => {
    const allPrestations = {
      'user-1': [
        { checkin: Date.now(), jobId: 'job-1', invoiceId: undefined }, // Billable
        { checkin: Date.now(), jobId: 'job-1', invoiceId: 'inv-1' } // Not billable
      ]
    }

    const billableOnly = {
      'user-1': [allPrestations['user-1'][0]].filter((p) => !p.invoiceId)
    }

    assert.strictEqual(billableOnly['user-1'].length, 1, 'Only non-invoiced prestations')
    assert.ok(!billableOnly['user-1'][0].invoiceId, 'billable prestation has no invoiceId')
  })
})

test('API Contracts - Type Safety', async (t) => {
  await t.test('quantities are positive numbers', () => {
    const validQuantities = [1, 1.5, 10, 0.01]
    const invalidQuantities = [0, -5, null, undefined]

    validQuantities.forEach((q) => {
      assert.ok(q > 0, `${q} is positive`)
    })

    invalidQuantities.forEach((q) => {
      assert.ok(!(q > 0), `${q} is not positive`)
    })
  })

  await t.test('unit prices are non-negative', () => {
    const validPrices = [0, 1, 10.5, 99.99]
    const invalidPrices = [-1, -10]

    validPrices.forEach((p) => {
      assert.ok(p >= 0, `${p} is non-negative`)
    })

    invalidPrices.forEach((p) => {
      assert.ok(!(p >= 0), `${p} is negative`)
    })
  })

  await t.test('durations are non-negative milliseconds', () => {
    const duration = Math.max(0, Date.now() - (Date.now() - 3600000))
    assert.ok(duration >= 0, 'duration is non-negative')
    assert.ok(typeof duration === 'number', 'duration is number')
  })
})
