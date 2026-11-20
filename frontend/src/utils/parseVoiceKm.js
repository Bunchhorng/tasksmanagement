const KH_DIGITS = '០១២៣៤៥៦៧៨៩'

export const toAscii = (s) => s.replace(/[០-៩]/g, (d) => String(KH_DIGITS.indexOf(d)))
export const toKhmerDigits = (n) => String(n).replace(/\d/g, (d) => KH_DIGITS[Number(d)])

export const WEEKDAYS_KM = ['អាទិត្យ', 'ចន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍']
export const MONTHS_KM = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ']

const WEEKDAY_VARIANTS = [
  ['អាទិត្យ'],
  ['ចន្ទ'],
  ['អង្គារ'],
  ['ពុធ'],
  ['ព្រហស្បតិ៍', 'ព្រហស្បត្តិ៍', 'ព្រហស្បតិ'],
  ['សុក្រ'],
  ['សៅរ៍', 'សៅរ៏', 'សៅរ'],
]
const WEEKDAY_ALL = WEEKDAY_VARIANTS.flat().join('|')
const WEEKDAY_NO_SUNDAY = WEEKDAY_VARIANTS.slice(1).flat().join('|')
const MONTH_RE = MONTHS_KM.join('|')
const PERIOD = '(ព្រឹក|ថ្ងៃត្រង់|រសៀល|ល្ងាច|យប់)'
const DEFAULT_HOUR = 17
const PRIORITY_WORDS = { ខ្ពស់: 'high', មធ្យម: 'medium', ទាប: 'low' }

function take(state, regex) {
  const match = state.text.match(regex)
  if (!match) return null
  state.text = state.text.replace(match[0], ' ')
  return match
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function weekdayIndex(word) {
  return WEEKDAY_VARIANTS.findIndex((variants) => variants.includes(word))
}

function to24h(hour, period) {
  if (period === 'ព្រឹក') return hour === 12 ? 0 : hour
  if (period === 'ថ្ងៃត្រង់') return hour === 12 ? 12 : hour < 6 ? hour + 12 : hour
  if (period === 'រសៀល' || period === 'ល្ងាច') return hour < 12 ? hour + 12 : hour
  if (period === 'យប់') return hour === 12 ? 0 : hour < 6 ? hour : hour < 12 ? hour + 12 : hour
  return hour >= 1 && hour <= 7 ? hour + 12 : hour
}

function parsePriority(state) {
  const m = take(state, /អាទិភាព\s*(ខ្ពស់|មធ្យម|ទាប)/)
  if (m) return PRIORITY_WORDS[m[1]]
  if (take(state, /បន្ទាន់|សំខាន់/)) return 'high'
  return null
}

function monthDay(monthWord, day, now) {
  const month = MONTHS_KM.indexOf(monthWord)
  let d = new Date(now.getFullYear(), month, day)
  if (d < startOfDay(now)) d = new Date(now.getFullYear() + 1, month, day)
  return d
}

function parseDate(state, now) {
  let m = take(state, /ក្នុង\s*(\d+)\s*(នាទី|ម៉ោង|ថ្ងៃ|សប្[តដ]ាហ៍|អាទិត្យ)/)
  if (m) {
    const n = Number(m[1])
    const d = new Date(now)
    if (m[2] === 'នាទី') d.setMinutes(d.getMinutes() + n)
    else if (m[2] === 'ម៉ោង') d.setHours(d.getHours() + n)
    else if (m[2] === 'ថ្ងៃ') d.setDate(d.getDate() + n)
    else d.setDate(d.getDate() + n * 7)
    return { date: d, exact: m[2] === 'នាទី' || m[2] === 'ម៉ោង' }
  }

  if (take(state, /(?:ថ្ងៃ\s*)?ខានស្អែក/)) return { date: addDays(startOfDay(now), 2) }
  if (take(state, /(?:ថ្ងៃ\s*)?ស្អែក/)) return { date: addDays(startOfDay(now), 1) }

  m = state.text.match(/(ព្រឹក|រសៀល|ល្ងាច|យប់)នេះ/)
  if (m) {
    state.text = state.text.replace(m[0], ` ${m[1]} `)
    return { date: startOfDay(now) }
  }
  if (take(state, /ថ្ងៃ\s*នេះ/)) return { date: startOfDay(now) }

  if (take(state, /(?<!ថ្ងៃ\s*)(?:សប្[តដ]ាហ៍|អាទិត្យ)\s*ក្រោយ/)) return { date: addDays(startOfDay(now), 7) }

  m = take(state, new RegExp(`ថ្ងៃ\\s*(${WEEKDAY_ALL})(?:\\s*(?:នេះ|ក្រោយ))?`))
  if (!m) m = take(state, new RegExp(`(${WEEKDAY_NO_SUNDAY})(?:\\s*(?:នេះ|ក្រោយ))?`))
  if (m) {
    const target = weekdayIndex(m[1])
    let diff = (target - now.getDay() + 7) % 7
    if (diff === 0) diff = 7
    return { date: addDays(startOfDay(now), diff) }
  }

  m = take(state, new RegExp(`(?:ថ្ងៃ\\s*ទី\\s*)?(\\d{1,2})\\s*ខែ\\s*(${MONTH_RE})`))
  if (m) return { date: monthDay(m[2], Number(m[1]), now) }

  return null
}

function parseTime(state) {
  let m = take(
    state,
    new RegExp(`${PERIOD}?\\s*ម៉ោង\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(កន្លះ)?(?:\\s*និង\\s*(\\d{1,2})\\s*នាទី)?\\s*${PERIOD}?`),
  )
  if (m) {
    const period = m[6] || m[1]
    let minute = 0
    if (m[3]) minute = Number(m[3])
    else if (m[4]) minute = 30
    else if (m[5]) minute = Number(m[5])
    return { hour: to24h(Number(m[2]), period), minute }
  }

  m = take(state, new RegExp(`(\\d{1,2})(?:[:.](\\d{2}))?\\s*${PERIOD}`))
  if (m) return { hour: to24h(Number(m[1]), m[3]), minute: Number(m[2] || 0) }

  m = take(state, new RegExp(PERIOD))
  if (m) return { hour: { ព្រឹក: 9, ថ្ងៃត្រង់: 12, រសៀល: 15, ល្ងាច: 18, យប់: 20 }[m[1]], minute: 0 }

  return null
}

function cleanTitle(text) {
  let t = text
    .replace(/^\s*(?:សូម\s*)?(?:ជួយ\s*)?(?:បន្ថែម|បង្កើត)\s*(?:កិច្ចការ(?:ថ្មី)?)?\s*(?:ដើម្បី|ថា|ឲ្យ|ឱ្យ)?\s*/, '')
    .replace(/^\s*(?:សូម\s*)?រំលឹក(?:ខ្ញុំ)?\s*(?:ឲ្យ|ឱ្យ|ថា|ដើម្បី)?\s*/, '')
    .replace(/^\s*ខ្ញុំ\s*(?:ត្រូវ|ចង់|ចាំបាច់ត្រូវ)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()

  let prev
  do {
    prev = t
    t = t
      .replace(/(?:នៅ|ត្រឹម|មុន|ក្នុង|សម្រាប់|ដល់)\s*$/, '')
      .replace(/^(?:នៅ|ត្រឹម|មុន|ក្នុង)\s+/, '')
      .replace(/[\s,.;:។-]+$/, '')
      .trim()
  } while (t !== prev)

  return t
}

export function weekdayMention(text) {
  const m =
    text.match(new RegExp(`ថ្ងៃ\\s*(${WEEKDAY_ALL})(?:\\s*(ក្រោយ))?`)) ||
    text.match(new RegExp(`(${WEEKDAY_NO_SUNDAY})(?:\\s*(ក្រោយ))?`))
  return m ? { index: weekdayIndex(m[1]), next: Boolean(m[2]) } : null
}

export function parseSpokenTaskKm(input, now = new Date()) {
  const original = toAscii((input || '').trim())
  const state = { text: ` ${original} ` }

  const priority = parsePriority(state)
  const dateInfo = parseDate(state, now)
  const time = parseTime(state)
  const title = cleanTitle(state.text) || original

  let due = null
  if (dateInfo?.exact) {
    due = dateInfo.date
  } else if (dateInfo || time) {
    due = dateInfo ? new Date(dateInfo.date) : startOfDay(now)
    due.setHours(time ? time.hour : DEFAULT_HOUR, time ? time.minute : 0, 0, 0)
    if (!dateInfo && due <= now) due = addDays(due, 1)
  }

  return {
    title,
    priority,
    due,
    hasDate: Boolean(dateInfo),
    hasTime: Boolean(time) || Boolean(dateInfo?.exact),
  }
}