import { parseSpokenTask } from './parseVoice.js'

const FILLER = '(?:hey\\s+|ok\\s+|okay\\s+|please\\s+|can you\\s+|could you\\s+|and\\s+|so\\s+)*'
const QUESTION_START = new RegExp(
  `^\\s*${FILLER}(?:what|what's|whats|which|when|how many|how about|do i|do we|am i|are there|is there|any|anything|have i|did i|will i)\\b`,
  'i',
)
const COMMAND_START = new RegExp(`^\\s*${FILLER}(?:show|tell|read|list|check|give|display)\\b`, 'i')
const ME_COMMAND = new RegExp(`^\\s*${FILLER}(?:show|tell|read|give|display)\\s+(?:me|us)\\b`, 'i')

const KEYWORDS = /\b(schedule|agenda|busy|free|plans?|planned|doing|activit(?:y|ies)|tasks?|to-?dos?|due|overdue|miss(?:ed|ing)?|on my plate|going on|happening|coming up|upcoming|have on|have for|have to do|need to do|got to do|have got|have i got|got on|appointments?|meetings?|classes|lessons?|events?|something|anything|up to|what'?s on|whats on)\b/i
const MISSED_TASKS = /\b(?:did|have)\s+i\s+miss(?:ed|ing)?\s+(?:(?:any|a)\s+)?(?:tasks?|to-?dos?)\b/i
const EXPLICIT = /\b(my schedule|my agenda|what am i doing|am i (?:busy|free)|what do i have)\b|\b(?:my|the|today's|tomorrow's|tonight's)\s+(?:schedule|agenda|plans?)\b|\b(?:schedule|agenda)\s+(?:for|on)\b|\bday look like\b|^\s*(?:my\s+)?(?:schedule|agenda)\s*(?:please|today|tonight|tomorrow|this week|next week)?\s*$/i
const DATE_WORDS = /\b(today|tonight|tomorrow|this (?:morning|afternoon|evening|week)|later today|next week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
const TODAY_WORDS = /\b(today|tonight|this (?:morning|afternoon|evening)|later today|right now)\b/
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const shortDateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

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

function joinList(list) {
  if (list.length <= 1) return list.join('')
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`
}

function dayLabel(day, today) {
  const diff = Math.round((day - today) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return `on ${dayFmt.format(day)}`
}

function hasDateRef(t) {
  return DATE_WORDS.test(t) || parseSpokenTask(t).hasDate
}

export function isScheduleQuery(text) {
  const t = (text || '').trim()
  if (!t) return false
  if (MISSED_TASKS.test(t)) return true
  if (EXPLICIT.test(t)) return true
  if (QUESTION_START.test(t)) return KEYWORDS.test(t) || hasDateRef(t)
  if (ME_COMMAND.test(t)) return KEYWORDS.test(t) || hasDateRef(t)
  if (COMMAND_START.test(t)) return KEYWORDS.test(t)
  return /\?\s*$/.test(t) && hasDateRef(t)
}

export function parseQuery(text, now = new Date()) {
  const t = text.toLowerCase()
  const today = startOfDay(now)
  const weekday = now.getDay()
  const todayRange = { kind: 'range', start: today, end: today, label: 'today' }

  if (/\b(overdue|past due|behind)\b/.test(t) || MISSED_TASKS.test(t)) return { kind: 'overdue' }

  if (/\bnext\s+week\b/.test(t)) {
    const start = addDays(today, (8 - weekday) % 7 || 7)
    return { kind: 'range', start, end: addDays(start, 6), label: 'next week' }
  }

  if (/\b(this|the)\s+week\b/.test(t)) {
    return { kind: 'range', start: today, end: addDays(today, (7 - weekday) % 7), label: 'this week' }
  }

  if (TODAY_WORDS.test(t)) return todayRange

  const named = t.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (named && !named[1] && WEEKDAYS.indexOf(named[2]) === weekday) return todayRange

  const { due } = parseSpokenTask(text, now)
  if (due) {
    const day = startOfDay(due)
    return { kind: 'range', start: day, end: day, label: dayLabel(day, today) }
  }

  if (/\b(upcoming|coming up|next)\b/.test(t)) {
    return { kind: 'range', start: today, end: addDays(today, 6), label: 'in the next 7 days' }
  }

  return todayRange
}

export function answerQuery(query, tasks, now = new Date()) {
  const open = tasks.filter((t) => !t.completed)
  const byDue = (a, b) => new Date(a.due_date) - new Date(b.due_date)

  if (query.kind === 'overdue') {
    const late = open.filter((t) => t.due_date && new Date(t.due_date) < now).sort(byDue)
    const items = late.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      when: `${shortDateFmt.format(new Date(t.due_date))}, ${timeFmt.format(new Date(t.due_date))}`,
    }))
    const text = late.length
      ? `You have ${late.length} overdue ${late.length === 1 ? 'task' : 'tasks'}: ${joinList(late.map((t) => t.title))}.`
      : 'Nothing is overdue. Nice work.'
    return { title: 'Overdue', text, items }
  }

  const from = query.start
  const to = addDays(query.end, 1)
  const inRange = (t) => {
    if (!t.due_date) return false
    const d = new Date(t.due_date)
    return d >= from && d < to
  }
  const multiDay = query.end > query.start

  const scheduled = open.filter(inRange).sort(byDue)
  const doneCount = tasks.filter((t) => t.completed && inRange(t)).length

  const items = scheduled.map((t) => {
    const d = new Date(t.due_date)
    return {
      id: t.id,
      title: t.title,
      priority: t.priority,
      when: multiDay ? `${weekdayFmt.format(d)} ${timeFmt.format(d)}` : timeFmt.format(d),
    }
  })

  let text
  if (scheduled.length) {
    const phrases = scheduled.map((t) => {
      const d = new Date(t.due_date)
      return multiDay
        ? `${t.title} on ${weekdayFmt.format(d)} at ${timeFmt.format(d)}`
        : `${t.title} at ${timeFmt.format(d)}`
    })
    text = `You have ${scheduled.length} ${scheduled.length === 1 ? 'task' : 'tasks'} ${query.label}: ${joinList(phrases)}.`
  } else {
    text = `You are free ${query.label}. Nothing is scheduled.`
  }

  if (doneCount) text += ` You already finished ${doneCount}.`

  return { title: `Schedule ${query.label}`, text, items }
}
