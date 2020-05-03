/* global beforeAll, afterAll */
const fs = require('fs')
const nock = require('nock')
const activities = fs.readFileSync('vocab/as.json')
const security = fs.readFileSync('vocab/security.json')
beforeAll(() => {
  nock('https://www.w3.org')
    .get('/ns/activitystreams')
    .reply(200, activities)
    .persist(true)
  nock('https://w3id.org')
    .get('/security/v1')
    .reply(200, security)
    .persist(true)
  // block federation attempts
  nock('https://ignore.com')
    .get(() => true)
    // fake id to avoid unique contstraint errors when cached
    .reply(200, { id: (Math.random() * 1000).toFixed(0) })
    .persist()
    .post(() => true)
    .reply(200)
    .persist()
  // block attempts to resolve local objects until better logic allows these to be skipped
  nock('https://localhost')
    .get(() => true)
    .reply(200, { id: (Math.random() * 1000).toFixed(0) })
    .persist()
})
afterAll(() => {
  nock.cleanAll()
})