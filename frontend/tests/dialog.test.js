import test from 'node:test'
import assert from 'node:assert/strict'
import { greeting, respond } from '../src/utils/dialog.js'
import { toLocalInput } from '../src/utils/dates.js'

const NOW = new Date(2026, 9, 30, 14, 45)
const at = (m, d, h, min = 0) => new Date(2026, m - 1, d, h, min).toISOString()

function talk(lines, tasks = []) {
  let { state } = greeting()
  const replies = []
  const actions = []
  for (const line of lines) {
    const r = respond(state, line, { tasks, now: NOW })
    state = r.state
    replies.push(r.say)
    if (r.action) actions.push(r.action)
  }
  return { replies, actions, state }
}

test('add task flow asks one thing at a time', () => {
  const { replies, actions } = talk([
    'I need to add a task',
    'call mom',
    'tomorrow',
    '5 pm',
    'high',
    'no',
    'yes',
  ])
  assert.match(replies[0], /What is the task/)
  assert.match(replies[1], /What day/)
  assert.match(replies[2], /What time/)
  assert.match(replies[3], /high, medium, or low/)
  assert.match(replies[4], /extra notes/)
  assert.match(replies[5], /"Call mom" for tomorrow at 5:00 PM, high priority.*Should I save it/)
  assert.match(replies[6], /Done!.*Anything else/)
  assert.equal(actions.length, 1)
  assert.equal(actions[0].type, 'create')
  assert.equal(actions[0].task.title, 'Call mom')
  assert.equal(actions[0].task.priority, 'high')
  assert.equal(toLocalInput(actions[0].task.due), '2026-10-31T17:00')
})

test('English greeting describes voice features without placeholder text', () => {
  const { say } = greeting()
  assert.doesNotMatch(say, /\[.*\]/)
  assert.match(say, /add tasks.*update their titles or deadlines.*mark them done/i)
})

test('add with details skips the questions it already knows', () => {
  const { replies } = talk(['add a task to buy groceries tomorrow at 4 pm'])
  assert.match(replies[0], /high, medium, or low/)
})

test('bare number answers the time question', () => {
  const { actions } = talk(['add a task', 'gym', 'monday', 'six', 'low', 'skip', 'yes'])
  assert.equal(toLocalInput(actions[0].task.due), '2026-11-02T18:00')
  assert.equal(actions[0].task.priority, 'low')
})

test('busy flow asks what you will be doing', () => {
  const { replies, actions } = talk([
    'I will be busy on Monday',
    'team meeting',
    '10 am',
    'yes',
  ])
  assert.match(replies[0], /What will you be doing Monday, Nov 2/)
  assert.match(replies[1], /What time/)
  assert.match(replies[2], /"Team meeting" for Monday, Nov 2 at 10:00 AM.*Should I save it/)
  assert.equal(actions[0].task.title, 'Team meeting')
  assert.equal(toLocalInput(actions[0].task.due), '2026-11-02T10:00')
})

test('busy without a day asks what, then which day', () => {
  const { replies } = talk(['I am busy', 'team meeting', 'friday'])
  assert.match(replies[0], /What will you be doing\?/)
  assert.match(replies[1], /Which day will you be busy/)
  assert.match(replies[2], /What time/)
})

test('no deadline skips the time question', () => {
  const { replies } = talk(['add a task', 'read a book', 'no deadline'])
  assert.match(replies[2], /high, medium, or low/)
})

test('saying no lets you change one thing', () => {
  const { replies, actions } = talk([
    'add a task', 'call mom', 'tomorrow', '5 pm', 'high', 'no',
    'no',
    'time',
    '7 pm',
    'yes',
  ])
  assert.match(replies[6], /What should I change/)
  assert.match(replies[7], /What time/)
  assert.match(replies[8], /7:00 PM/)
  assert.equal(toLocalInput(actions[0].task.due), '2026-10-31T19:00')
})

test('cancel drops the draft', () => {
  const { replies, actions } = talk(['add a task', 'call mom', 'cancel'])
  assert.match(replies[2], /cancelled.*Anything else/)
  assert.equal(actions.length, 0)
})

test('unclear answers re-ask, then fall back', () => {
  const { replies } = talk(['add a task', 'call mom', 'blah', 'blah'])
  assert.match(replies[2], /did not get the day.*What day/)
  assert.match(replies[3], /without a deadline/)
})

test('warns about a clash', () => {
  const tasks = [{ id: 1, title: 'Dentist', completed: false, priority: 'low', due_date: at(10, 31, 17, 30) }]
  const { replies } = talk(['add a task', 'call mom', 'tomorrow', '5 pm', 'high', 'no'], tasks)
  assert.match(replies[5], /already have "Dentist" at 5:30 PM/)
})

test('schedule question is answered and the conversation continues', () => {
  const tasks = [{ id: 1, title: 'Gym', completed: false, priority: 'low', due_date: at(10, 31, 18) }]
  const { replies, state } = talk(["what's my schedule tomorrow"], tasks)
  assert.match(replies[0], /You have 1 task tomorrow: Gym at 6:00 PM.*Anything else/)
  assert.equal(state.mode, null)
})

test('mark a task as done', () => {
  const tasks = [
    { id: 7, title: 'Submit the report', completed: false, priority: 'high', due_date: null },
    { id: 8, title: 'Gym', completed: false, priority: 'low', due_date: null },
  ]
  const { replies, actions } = talk(['mark submit report as done'], tasks)
  assert.match(replies[0], /marked "Submit the report" as done/)
  assert.deepEqual(actions, [{ type: 'complete', id: 7 }])
})

test('mark task as done can identify a task by name or ask which one', () => {
  const tasks = [
    { id: 7, title: 'Submit the report', completed: false, priority: 'high', due_date: null },
    { id: 8, title: 'Buy milk', completed: false, priority: 'low', due_date: null },
  ]

  const named = talk(['mark the task called "Submit the report" as done'], tasks)
  assert.deepEqual(named.actions, [{ type: 'complete', id: 7 }])

  const generic = talk(['mark a task as done'], tasks)
  assert.match(generic.replies[0], /Which one\? Number 1, Submit the report. Number 2, Buy milk./)
  assert.deepEqual(generic.actions, [])
  const picked = talk(['mark a task as done', 'two'], tasks)
  assert.deepEqual(picked.actions, [{ type: 'complete', id: 8 }])

  assert.match(talk(['mark a task as done']).replies[0], /There are no open tasks/)
})

test('English mark-done understands common spoken sentence variants', () => {
  const tasks = [
    { id: 11, title: 'Buy groceries', completed: false, priority: 'medium', due_date: null },
    { id: 12, title: 'Submit report', completed: false, priority: 'medium', due_date: null },
  ]

  for (const [phrase, id] of [
    ['please mark buy groceries done', 11],
    ['I want to mark the task called buy groceries as completed', 11],
    ['complete buy groceries', 11],
    ['finish the buy groceries task', 11],
    ['buy groceries done', 11],
    ['submit report is complete', 12],
    ['I finished submitting report', 12],
    ['I have done the submit report task', 12],
    ['mark buy groceris as done', 11],
  ]) {
    const { actions } = talk([phrase], tasks)
    assert.equal(actions.length, 1, phrase)
    assert.equal(actions[0].type, 'complete', phrase)
    assert.equal(actions[0].id, id, phrase)
  }
})

test('voice can change an existing task date and preserve its time', () => {
  const tasks = [{ id: 21, title: 'Dentist appointment', completed: false, due_date: at(10, 31, 18) }]
  const { actions } = talk(['change the date on dentist appointment to next monday'], tasks)
  assert.deepEqual(actions, [{
    type: 'update',
    id: 21,
    changes: { due_date: new Date(2026, 10, 2, 18).toISOString() },
  }])
})

test('voice can change an existing task time and title', () => {
  const tasks = [{ id: 22, title: 'Submit report', completed: false, due_date: at(10, 31, 15) }]
  const time = talk(['change the time for submit report to 4 pm'], tasks)
  assert.deepEqual(time.actions, [{
    type: 'update',
    id: 22,
    changes: { due_date: new Date(2026, 9, 31, 16).toISOString() },
  }])

  const title = talk(['change the title of submit report to submit final report'], tasks)
  assert.deepEqual(title.actions, [{
    type: 'update',
    id: 22,
    changes: { title: 'submit final report' },
  }])
})

test('voice edit asks for a value and resolves duplicate task names', () => {
  const tasks = [
    { id: 31, title: 'Call dentist', completed: false, due_date: at(10, 31, 15) },
    { id: 32, title: 'Call dentist', completed: true, due_date: at(11, 1, 15) },
  ]
  const edit = talk(['change date for call dentist'], tasks)
  assert.match(edit.replies[0], /Which one\?/)
  const picked = talk(['change date for call dentist', 'one', 'friday'], tasks)
  assert.deepEqual(picked.actions, [{
    type: 'update',
    id: 31,
    changes: { due_date: new Date(2026, 10, 6, 15).toISOString() },
  }])
})

test('several matches ask which one', () => {
  const tasks = [
    { id: 1, title: 'Call mom', completed: false, priority: 'low', due_date: null },
    { id: 2, title: 'Call dentist', completed: false, priority: 'low', due_date: null },
  ]
  const { replies, actions } = talk(['I finished call', 'two'], tasks)
  assert.match(replies[0], /Number 1, Call mom. Number 2, Call dentist/)
  assert.deepEqual(actions, [{ type: 'complete', id: 2 }])
})

test('delete needs confirmation', () => {
  const tasks = [{ id: 3, title: 'Old task', completed: false, priority: 'low', due_date: null }]
  const a = talk(['delete old task', 'yes'], tasks)
  assert.match(a.replies[0], /Delete "Old task"\? Say yes/)
  assert.deepEqual(a.actions, [{ type: 'delete', id: 3 }])
  const b = talk(['delete old task', 'no'], tasks)
  assert.equal(b.actions.length, 0)
})

test('unknown task', () => {
  const { replies } = talk(['mark homework as done'], [])
  assert.match(replies[0], /could not find a task called homework/)
})

test('goodbye ends the conversation', () => {
  assert.equal(talk(['goodbye']).state.ended, true)
  assert.equal(talk(['no']).state.ended, true)
  assert.equal(talk(['add a task', 'call mom', 'tomorrow', '5 pm', 'high', 'no', 'yes', "that's all"]).state.ended, true)
})

test('a plain sentence with a date starts a task', () => {
  const { replies } = talk(['call the dentist tomorrow at 3 pm'])
  assert.match(replies[0], /high, medium, or low/)
})

test('gibberish gets help', () => {
  const { replies } = talk(['hello there'])
  assert.match(replies[0], /You can say/)
})
