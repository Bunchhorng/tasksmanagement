const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const WEEKDAY_RE = WEEKDAYS.join('|')
const MONTH_RE = MONTHS.map((m) => m.slice(0, 3) + `(?:${m.slice(3)})?`).join('|')
const DEFAULT_HOUR = 17

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

function to24h(hour, meridiem) {
  if (meridiem === 'p' && hour < 12) return hour + 12
  if (meridiem === 'a' && hour === 12) return 0
  return hour
}

function parsePriority(state) {
  let m = take(state, /\b(high|urgent|important|low|medium|normal)\s+priority\b/i)
  if (m) return normalizePriority(m[1])
  m = take(state, /\bpriority\s+(?:is\s+|of\s+)?(high|low|medium|normal)\b/i)
  if (m) return normalizePriority(m[1])
  m = take(state, /\b(urgent|urgently|asap)\b/i)
  if (m) return 'high'
  return null
}

function normalizePriority(word) {
  const w = word.toLowerCase()
  if (w === 'low') return 'low'
  if (w === 'medium' || w === 'normal') return 'medium'
  return 'high'
}

function parseDate(state, now) {
  let m = take(state, /\bin\s+(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(minutes?|mins?|hours?|days?|weeks?)\b/i)
  if (m) {
    const words = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
    const n = Number(m[1]) || words[m[1].toLowerCase()]
    const unit = m[2].toLowerCase()
    const d = new Date(now)
    if (unit.startsWith('min')) d.setMinutes(d.getMinutes() + n)
    else if (unit.startsWith('hour')) d.setHours(d.getHours() + n)
    else if (unit.startsWith('day')) d.setDate(d.getDate() + n)
    else d.setDate(d.getDate() + n * 7)
    return { date: d, exact: unit.startsWith('min') || unit.startsWith('hour') }
  }

  if (take(state, /\bday after tomorrow\b/i)) return { date: addDays(startOfDay(now), 2) }
  if (take(state, /\btomorrow\b/i)) return { date: addDays(startOfDay(now), 1) }
  if (take(state, /\b(?:today|tonight)\b/i)) return { date: startOfDay(now) }
  if (take(state, /\bnext\s+week\b/i)) return { date: addDays(startOfDay(now), 7) }

  m = take(state, new RegExp(`\\b(?:next\\s+|this\\s+|on\\s+)?(${WEEKDAY_RE})\\b`, 'i'))
  if (m) {
    const target = WEEKDAYS.indexOf(m[1].toLowerCase())
    let diff = (target - now.getDay() + 7) % 7
    if (diff === 0) diff = 7
    return { date: addDays(startOfDay(now), diff) }
  }

  m = take(state, new RegExp(`\\b(?:on\\s+)?(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'))
  if (m) return { date: monthDay(m[1], Number(m[2]), now) }

  m = take(state, new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b`, 'i'))
  if (m) return { date: monthDay(m[2], Number(m[1]), now) }

  return null
}

function monthDay(monthWord, day, now) {
  const month = MONTHS.findIndex((x) => x.startsWith(monthWord.slice(0, 3).toLowerCase()))
  let d = new Date(now.getFullYear(), month, day)
  if (d < startOfDay(now)) d = new Date(now.getFullYear() + 1, month, day)
  return d
}

function parseTime(state) {
  let m = take(state, /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b\.?/i)
  if (m) return { hour: to24h(Number(m[1]), m[3].toLowerCase()), minute: Number(m[2] || 0) }

  if (take(state, /\b(?:at\s+)?noon\b/i)) return { hour: 12, minute: 0 }
  if (take(state, /\b(?:at\s+)?midnight\b/i)) return { hour: 23, minute: 59 }

  m = take(state, /\bat\s+(\d{1,2})(?::(\d{2}))?\b/i)
  if (m) {
    let hour = Number(m[1])
    if (hour >= 1 && hour <= 7) hour += 12
    return { hour, minute: Number(m[2] || 0) }
  }

  m = take(state, /\b(?:in\s+the\s+|this\s+)?(morning|afternoon|evening)\b/i)
  if (m) return { hour: { morning: 9, afternoon: 15, evening: 19 }[m[1].toLowerCase()], minute: 0 }

  return null
}

function cleanTitle(text) {
  let t = text
    .replace(/^\s*(?:please\s+)?(?:add|create|make|new)\s+(?:a\s+|an\s+)?(?:new\s+)?task(?:\s+(?:to|called|named|for|that))?\s*/i, '')
    .replace(/^\s*(?:please\s+)?remind\s+me\s+(?:to\s+)?/i, '')
    .replace(/^\s*(?:i\s+(?:need|have|want)\s+to|i\s+must|i\s+should)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  let prev
  do {
    prev = t
    t = t
      .replace(/\s+(?:by|due|on|at|before|for|in|the|this|next|and|then|,)\s*$/i, '')
      .replace(/^(?:by|due|on|at|before)\s+/i, '')
      .replace(/[\s,.;:-]+$/, '')
      .trim()
  } while (t !== prev)

  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

export function parseSpokenTask(input, now = new Date()) {
  const original = (input || '').trim()
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
    const hour = time ? time.hour : DEFAULT_HOUR
    const minute = time ? time.minute : 0
    due.setHours(hour, minute, 0, 0)
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