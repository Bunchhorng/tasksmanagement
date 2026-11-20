import test from 'node:test'
import assert from 'node:assert/strict'
import { greeting, respond } from '../src/utils/dialog.js'
import { parseSpokenTaskKm, toAscii, toKhmerDigits } from '../src/utils/parseVoiceKm.js'
import { toLocalInput } from '../src/utils/dates.js'

const NOW = new Date(2026, 9, 30, 14, 45)
const at = (m, d, h, min = 0) => new Date(2026, m - 1, d, h, min).toISOString()
const parse = (s) => parseSpokenTaskKm(s, NOW)
const local = (r) => toLocalInput(r.due)

function talk(lines, tasks = [], lang = 'km-KH') {
  let { state } = greeting(lang)
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

test('digits', () => {
  assert.equal(toAscii('ម៉ោង ១០:៣០'), 'ម៉ោង 10:30')
  assert.equal(toKhmerDigits(2026), '២០២៦')
})

test('tomorrow with evening time', () => {
  const r = parse('ទិញអង្ករ ថ្ងៃស្អែក ម៉ោង ៥ ល្ងាច')
  assert.equal(r.title, 'ទិញអង្ករ')
  assert.equal(local(r), '2026-10-31T17:00')
  assert.ok(r.hasDate && r.hasTime)
})

test('weekday and morning', () => {
  const r = parse('ប្រជុំ ថ្ងៃចន្ទ ម៉ោង ១០ ព្រឹក')
  assert.equal(r.title, 'ប្រជុំ')
  assert.equal(local(r), '2026-11-02T10:00')
})

test('sunday needs the word day', () => {
  assert.equal(local(parse('ទៅវត្ត ថ្ងៃអាទិត្យ')), '2026-11-01T17:00')
})

test('today at night', () => {
  assert.equal(local(parse('ហៅម៉ាក់ ថ្ងៃនេះ ម៉ោង ៨ យប់')), '2026-10-30T20:00')
})

test('afternoon, noon and half past', () => {
  assert.equal(local(parse('ញ៉ាំបាយ ថ្ងៃស្អែក ម៉ោង ១២ ថ្ងៃត្រង់')), '2026-10-31T12:00')
  assert.equal(local(parse('ប្រជុំ ថ្ងៃស្អែក ម៉ោង ៣ រសៀល')), '2026-10-31T15:00')
  assert.equal(local(parse('ប្រជុំ ថ្ងៃស្អែក ម៉ោង ៥ កន្លះ ល្ងាច')), '2026-10-31T17:30')
})

test('date with month name', () => {
  assert.equal(local(parse('ដាក់ពាក្យ ថ្ងៃទី ១៥ ខែវិច្ឆិកា')), '2026-11-15T17:00')
})

test('priority phrase', () => {
  const r = parse('ធ្វើកិច្ចការផ្ទះ អាទិភាពខ្ពស់')
  assert.equal(r.priority, 'high')
  assert.equal(r.title, 'ធ្វើកិច្ចការផ្ទះ')
})

test('relative minutes', () => {
  assert.equal(local(parse('មើលឆ្នាំងបាយ ក្នុង ៣០ នាទី')), '2026-10-30T15:15')
})

test('filler words removed', () => {
  assert.equal(parse('បន្ថែមកិច្ចការ ទិញទឹក ថ្ងៃស្អែក').title, 'ទិញទឹក')
})

test('add task conversation in Khmer', () => {
  const { replies, actions } = talk([
    'បន្ថែមកិច្ចការ',
    'ហៅម៉ាក់',
    'ថ្ងៃស្អែក',
    'ម៉ោង ៥ ល្ងាច',
    'ខ្ពស់',
    'ទេ',
    'បាទ',
  ])
  assert.match(replies[0], /តើកិច្ចការអ្វី/)
  assert.match(replies[1], /តើសម្រាប់ថ្ងៃណា/)
  assert.match(replies[2], /ម៉ោងប៉ុន្មាន/)
  assert.match(replies[3], /អាទិភាព/)
  assert.match(replies[4], /កំណត់ចំណាំ/)
  assert.match(replies[5], /ហៅម៉ាក់.*ថ្ងៃស្អែក ម៉ោង ៥ ល្ងាច.*តើខ្ញុំរក្សាទុកទេ/)
  assert.match(replies[6], /រួចរាល់!.*មានអ្វីទៀតទេ/)
  assert.equal(actions[0].task.title, 'ហៅម៉ាក់')
  assert.equal(actions[0].task.priority, 'high')
  assert.equal(toLocalInput(actions[0].task.due), '2026-10-31T17:00')
})

test('Khmer digits and bare numbers work for time', () => {
  const { actions } = talk(['បន្ថែមកិច្ចការ', 'រត់ហាត់ប្រាណ', 'ថ្ងៃចន្ទ', '៦', 'ទាប', 'ទេ', 'បាទ'])
  assert.equal(toLocalInput(actions[0].task.due), '2026-11-02T18:00')
  assert.equal(actions[0].task.priority, 'low')
})

test('busy flow in Khmer', () => {
  const { replies, actions } = talk(['ខ្ញុំរវល់ថ្ងៃចន្ទ', 'ប្រជុំក្រុម', 'ម៉ោង ១០ ព្រឹក', 'បាទ'])
  assert.match(replies[0], /តើអ្នកនឹងធ្វើអ្វី/)
  assert.match(replies[1], /ម៉ោងប៉ុន្មាន/)
  assert.match(replies[2], /ប្រជុំក្រុម.*ម៉ោង ១០ ព្រឹក/)
  assert.equal(toLocalInput(actions[0].task.due), '2026-11-02T10:00')
})

test('saying no changes one thing', () => {
  const { replies, actions } = talk([
    'បន្ថែមកិច្ចការ', 'ហៅម៉ាក់', 'ថ្ងៃស្អែក', 'ម៉ោង ៥ ល្ងាច', 'ខ្ពស់', 'ទេ',
    'ទេ',
    'ម៉ោង',
    'ម៉ោង ៧ ល្ងាច',
    'បាទ',
  ])
  assert.match(replies[6], /តើត្រូវកែអ្វី/)
  assert.match(replies[7], /ម៉ោងប៉ុន្មាន/)
  assert.equal(toLocalInput(actions[0].task.due), '2026-10-31T19:00')
})

test('schedule question in Khmer', () => {
  const tasks = [
    { id: 1, title: 'ប្រជុំ', completed: false, priority: 'high', due_date: at(10, 31, 15) },
    { id: 2, title: 'ហាត់ប្រាណ', completed: false, priority: 'low', due_date: at(10, 31, 18) },
  ]
  const { replies, state } = talk(['កាលវិភាគថ្ងៃស្អែកមានអ្វីខ្លះ'], tasks)
  assert.match(replies[0], /អ្នកមាន ២ កិច្ចការ ថ្ងៃស្អែក៖ ប្រជុំ ម៉ោង ៣ រសៀល និង ហាត់ប្រាណ ម៉ោង ៦ ល្ងាច/)
  assert.match(replies[0], /មានអ្វីទៀតទេ/)
  assert.equal(state.mode, null)
})

test('free day question in Khmer', () => {
  const { replies } = talk(['ថ្ងៃសុក្រខ្ញុំរវល់ទេ'], [])
  assert.match(replies[0], /អ្នកទំនេរ/)
})

test('mark done and delete in Khmer', () => {
  const tasks = [
    { id: 7, title: 'ហៅម៉ាក់', completed: false, priority: 'high', due_date: null },
    { id: 8, title: 'ទិញទឹក', completed: false, priority: 'low', due_date: null },
  ]
  const a = talk(['សម្គាល់ ហៅម៉ាក់ ថារួចរាល់'], tasks)
  assert.deepEqual(a.actions, [{ type: 'complete', id: 7 }])
  const b = talk(['លុប ទិញទឹក', 'បាទ'], tasks)
  assert.match(b.replies[0], /លុប "ទិញទឹក"/)
  assert.deepEqual(b.actions, [{ type: 'delete', id: 8 }])
  const c = talk(['លុប ទិញទឹក', 'ទេ'], tasks)
  assert.equal(c.actions.length, 0)
})

test('generic Khmer mark-done command asks which task', () => {
  const tasks = [
    { id: 7, title: 'ហៅម៉ាក់', completed: false, priority: 'high', due_date: null },
    { id: 8, title: 'ទិញទឹក', completed: false, priority: 'low', due_date: null },
  ]
  const generic = talk(['សម្គាល់កិច្ចការថារួចរាល់'], tasks)
  assert.match(generic.replies[0], /តើមួយណា/)
  const picked = talk(['សម្គាល់កិច្ចការថារួចរាល់', '២'], tasks)
  assert.deepEqual(picked.actions, [{ type: 'complete', id: 8 }])

  const named = talk(['សម្គាល់កិច្ចការ ហៅម៉ាក់ ថារួចរាល់'], tasks)
  assert.deepEqual(named.actions, [{ type: 'complete', id: 7 }])
})

test('switching language by voice', () => {
  const toKm = talk(['speak Khmer'], [], 'en-US')
  assert.equal(toKm.state.lang, 'km-KH')
  assert.match(toKm.replies[0], /ភាសាខ្មែរ/)
  const toEn = talk(['និយាយភាសាអង់គ្លេស'], [], 'km-KH')
  assert.equal(toEn.state.lang, 'en-US')
  assert.match(toEn.replies[0], /English/)
})

test('language is kept through a whole flow', () => {
  const { state } = talk(['បន្ថែមកិច្ចការ', 'ហៅម៉ាក់', 'ថ្ងៃស្អែក'])
  assert.equal(state.lang, 'km-KH')
})

test('cancel and goodbye', () => {
  assert.match(talk(['បន្ថែមកិច្ចការ', 'បោះបង់']).replies[1], /បានបោះបង់/)
  assert.equal(talk(['ជម្រាបលា']).state.ended, true)
  assert.equal(talk(['ទេ']).state.ended, true)
})

test('a word that only starts with the letters for no is not treated as no', () => {
  assert.equal(talk(['ទេសចរណ៍']).state.ended, undefined)
})

test('unknown sentence gets help', () => {
  assert.match(talk(['សួស្តី']).replies[0], /អ្នកអាចនិយាយថា/)
})
