import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSpokenTask } from '../src/utils/parseVoice.js'
import { toLocalInput } from '../src/utils/dates.js'

const NOW = new Date(2026, 9, 30, 14, 45)
const parse = (s) => parseSpokenTask(s, NOW)
const local = (r) => toLocalInput(r.due)

test('plain sentence stays a title', () => {
  const r = parse('buy milk')
  assert.equal(r.title, 'Buy milk')
  assert.equal(r.priority, null)
  assert.equal(r.due, null)
})

test('priority phrases', () => {
  assert.equal(parse('submit report high priority').priority, 'high')
  assert.equal(parse('submit report with low priority').priority, 'low')
  assert.equal(parse('priority medium call mom').priority, 'medium')
  assert.equal(parse('urgent fix the bug').priority, 'high')
  assert.equal(parse('submit report high priority').title, 'Submit report')
})

test('tomorrow with time', () => {
  const r = parse('finish assignment tomorrow at 5 pm')
  assert.equal(r.title, 'Finish assignment')
  assert.equal(local(r), '2026-10-31T17:00')
})

test('meridiem variants', () => {
  assert.equal(local(parse('call mom tomorrow 9:30 a.m.')), '2026-10-31T09:30')
  assert.equal(local(parse('call mom tomorrow 12 am')), '2026-10-31T00:00')
  assert.equal(local(parse('lunch tomorrow at noon')), '2026-10-31T12:00')
})

test('date without time defaults to 5 pm', () => {
  assert.equal(local(parse('pay rent tomorrow')), '2026-10-31T17:00')
})

test('time only rolls to tomorrow if already passed', () => {
  assert.equal(local(parse('stretch at 2 pm')), '2026-10-31T14:00')
  assert.equal(local(parse('stretch at 6 pm')), '2026-10-30T18:00')
})

test('weekday', () => {
  assert.equal(local(parse('team meeting on monday at 10 am')), '2026-11-02T10:00')
  assert.equal(local(parse('gym next friday')), '2026-11-06T17:00')
})

test('relative durations', () => {
  assert.equal(local(parse('check oven in 30 minutes')), '2026-10-30T15:15')
  assert.equal(local(parse('review notes in 2 days')), '2026-11-01T17:00')
  assert.equal(parse('check oven in 30 minutes').title, 'Check oven')
})

test('month and day', () => {
  assert.equal(local(parse('submit thesis on november 15th at 8 am')), '2026-11-15T08:00')
  assert.equal(local(parse('birthday party 3 of january')), '2027-01-03T17:00')
})

test('filler words removed', () => {
  assert.equal(parse('add a task to buy groceries tomorrow').title, 'Buy groceries')
  assert.equal(parse('remind me to call the dentist by friday').title, 'Call the dentist')
})

test('everything together', () => {
  const r = parse('finish the project report by tomorrow at 3 pm high priority')
  assert.equal(r.title, 'Finish the project report')
  assert.equal(r.priority, 'high')
  assert.equal(local(r), '2026-10-31T15:00')
})

test('falls back to original text when nothing is left', () => {
  assert.equal(parse('tomorrow').title, 'tomorrow')
})