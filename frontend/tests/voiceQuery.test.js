import test from 'node:test'
import assert from 'node:assert/strict'
import { isScheduleQuery, parseQuery, answerQuery } from '../src/utils/voiceQuery.js'

const NOW = new Date(2026, 9, 30, 14, 45)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const at = (m, d, h, min = 0) => new Date(2026, m - 1, d, h, min).toISOString()

const TASKS = [
  { id: 1, title: 'Finish report', priority: 'high', completed: false, due_date: at(10, 31, 15) },
  { id: 2, title: 'Gym', priority: 'low', completed: false, due_date: at(10, 31, 18, 30) },
  { id: 3, title: 'Team meeting', priority: 'medium', completed: false, due_date: at(11, 2, 10) },
  { id: 4, title: 'Old thing', priority: 'medium', completed: false, due_date: at(10, 1, 9) },
  { id: 5, title: 'Done thing', priority: 'medium', completed: true, due_date: at(10, 31, 9) },
  { id: 6, title: 'No deadline', priority: 'medium', completed: false, due_date: null },
]

test('detects schedule questions', () => {
  assert.ok(isScheduleQuery("what's my schedule tomorrow"))
  assert.ok(isScheduleQuery('what do I have on friday'))
  assert.ok(isScheduleQuery('am I busy on monday'))
  assert.ok(isScheduleQuery('what am I doing tonight'))
  assert.ok(isScheduleQuery("what's overdue"))
  assert.ok(isScheduleQuery('did I miss any tasks'))
  assert.ok(isScheduleQuery('have I missed a task'))
  assert.ok(isScheduleQuery('tell me my tasks for tomorrow'))
})

test('does not treat new tasks as questions', () => {
  assert.ok(!isScheduleQuery('buy milk tomorrow'))
  assert.ok(!isScheduleQuery('add task call mom'))
  assert.ok(!isScheduleQuery('show report to teacher tomorrow'))
  assert.ok(!isScheduleQuery('finish tasks list by friday'))
})

test('parses days and ranges', () => {
  assert.equal(ymd(parseQuery('what is my schedule tomorrow', NOW).start), '2026-10-31')
  assert.equal(ymd(parseQuery('what am I doing on monday', NOW).start), '2026-11-02')
  assert.equal(parseQuery('what is my schedule', NOW).label, 'today')
  const next = parseQuery('what is due next week', NOW)
  assert.equal(ymd(next.start), '2026-11-02')
  assert.equal(ymd(next.end), '2026-11-08')
  const week = parseQuery('what do I have this week', NOW)
  assert.equal(ymd(week.start), '2026-10-30')
  assert.equal(ymd(week.end), '2026-11-01')
  assert.equal(parseQuery("what's overdue", NOW).kind, 'overdue')
})

test('answers a single day', () => {
  const a = answerQuery(parseQuery('what is my schedule tomorrow', NOW), TASKS, NOW)
  assert.deepEqual(a.items.map((i) => i.title), ['Finish report', 'Gym'])
  assert.match(a.text, /2 tasks tomorrow: Finish report at 3:00 PM and Gym at 6:30 PM/)
  assert.match(a.text, /already finished 1/)
})

test('free day', () => {
  const a = answerQuery(parseQuery('am I busy on next friday', NOW), TASKS, NOW)
  assert.match(a.text, /You are free on Friday, Nov 6/)
  assert.equal(a.items.length, 0)
})

test('week range lists weekdays', () => {
  const a = answerQuery(parseQuery('what is due next week', NOW), TASKS, NOW)
  assert.deepEqual(a.items.map((i) => i.title), ['Team meeting'])
  assert.match(a.text, /Team meeting on Mon at 10:00 AM/)
})

test('overdue', () => {
  const a = answerQuery(parseQuery("what's overdue", NOW), TASKS, NOW)
  assert.deepEqual(a.items.map((i) => i.title), ['Old thing'])
  assert.match(a.text, /1 overdue task: Old thing/)
  const none = answerQuery({ kind: 'overdue' }, [], NOW)
  assert.match(none.text, /Nothing is overdue/)
})

test('missed-task questions return overdue tasks', () => {
  const query = parseQuery('did I miss any tasks', NOW)
  assert.equal(query.kind, 'overdue')
  const answer = answerQuery(query, TASKS, NOW)
  assert.deepEqual(answer.items.map((task) => task.title), ['Old thing'])
  assert.match(answer.text, /1 overdue task: Old thing/)
})

const WED = new Date(2026, 10, 11, 8, 0)
const WED_TASKS = [
  { id: 1, title: 'Dentist', priority: 'high', completed: false, due_date: at(11, 11, 15) },
  { id: 2, title: 'Gym', priority: 'low', completed: false, due_date: at(11, 11, 18, 30) },
  { id: 3, title: 'Report', priority: 'medium', completed: false, due_date: at(11, 18, 9) },
]

test('same-day questions are recognised', () => {
  for (const q of [
    'do I have anything today',
    'do I have something to do today',
    'anything today',
    "what's on today",
    "today's schedule",
    'schedule for today',
    'what do I need to do today',
    'what have I got today',
    'do I have a meeting today',
    'what does my day look like',
    'show me today',
    'dentist today?',
  ]) {
    assert.ok(isScheduleQuery(q), q)
  }
})

test('new tasks that sound similar are still tasks', () => {
  for (const s of [
    'call the dentist tomorrow at 3 pm',
    'do homework tomorrow',
    'check email tomorrow',
    'read chapter five tomorrow',
    'schedule a meeting for tomorrow',
    'I need to finish homework today',
    'finish the report by friday',
  ]) {
    assert.ok(!isScheduleQuery(s), s)
  }
})

test("today's weekday means today, not next week", () => {
  const q = parseQuery('what do I have on Wednesday', WED)
  assert.equal(ymd(q.start), '2026-11-11')
  assert.equal(q.label, 'today')
  assert.equal(ymd(parseQuery('what do I have next Wednesday', WED).start), '2026-11-18')
  assert.equal(ymd(parseQuery('what do I have on Thursday', WED).start), '2026-11-12')
})

test('today answers list every task today', () => {
  const a = answerQuery(parseQuery('do I have anything today', WED), WED_TASKS, WED)
  assert.deepEqual(a.items.map((i) => i.title), ['Dentist', 'Gym'])
  assert.match(a.text, /2 tasks today: Dentist at 3:00 PM and Gym at 6:30 PM/)
})

test('this evening and tonight are today even late in the day', () => {
  const late = new Date(2026, 10, 11, 22, 30)
  assert.equal(ymd(parseQuery('what do I have this evening', late).start), '2026-11-11')
  assert.equal(ymd(parseQuery('what am I doing tonight', late).start), '2026-11-11')
})
