import { parseSpokenTask } from '../parseVoice.js'
import { isScheduleQuery, parseQuery, answerQuery } from '../voiceQuery.js'

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 }
const STOP_WORDS = new Set(['the', 'a', 'an', 'my', 'task', 'tasks', 'to', 'of', 'for', 'on', 'it', 'that', 'this', 'is', 'as', 'and'])

const ADD_RE = /\b(?:add|create|make|new)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|reminder|to-?do|todo)\b/i
const REMIND_RE = /\bremind me\b/i
const COMMAND_PREFIX = '(?:(?:please|can you|could you|i want to|i need to|i would like to)\\s+)*'
const EDIT_VERB = '(?:change|update|edit|reschedule|move)'
const EDIT_FIELD = '(?:due date|deadline|date|time|title|name)'
const COMPLETE_VERB = '(?:mark(?:ed)?|set|tick|checked? off|complet(?:e|ed)|finish(?:ed)?|done)'
const COMPLETE_STATUS = '(?:(?:as|to be|is|has been)\\s+)?(?:done|complete|completed|finished)'
const COMPLETE_GENERIC_RE =
  new RegExp(`^\\s*${COMMAND_PREFIX}${COMPLETE_VERB}\\s+(?:(?:a|an|the|my|this|that)\\s+)?(?:task|to-?do|todo|it|this|that)\\s+(?:${COMPLETE_STATUS})?\\s*[.!?]*$`, 'i')
const COMPLETE_RES = [
  new RegExp(`\\b${COMMAND_PREFIX}${COMPLETE_VERB}\\s+(?:(?:a|an|the|my|this|that)\\s+)?(?:task\\s+)?(?:(?:called|named)\\s+)?(.+?)(?:\\s+${COMPLETE_STATUS})?\\s*[.!?]*$`, 'i'),
  /\b(?:i(?:\s+have|['’]ve)?\s+)?(?:finished|completed|done(?:\s+with)?)\s+(?:(?:a|an|the|my)\s+)?(?:task\s+)?(.+)/i,
  /^(?:the\s+|my\s+)?(.+?)\s+is\s+(?:done|complete|completed|finished)\b/i,
  /^(.+?)\s+(?:is\s+|has been\s+)?(?:done|complete|completed|finished)\s*[.!?]*$/i,
]
const DELETE_RE = /\b(?:delete|remove)\s+(?:the\s+|my\s+)?(?:task\s+)?(.+)/i
const SOFT_EXIT = /\b(that's all|that is all|i'm done|i am done|nothing else|no thanks|no thank you|nothing)\b/i

const help = 'You can say: add a task, ask about your schedule, mark a task as done, or change a task date, time, or title. For example, say "change the date on dentist to Friday" or "change the time for dentist to 3 pm." You can also delete a task. Say goodbye when you are finished.'

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function dayLabel(day, now) {
  const diff = Math.round((startOfDay(day) - startOfDay(now)) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return dayFmt.format(day)
}

function timeText(t) {
  return timeFmt.format(new Date(2000, 0, 1, t.hour, t.minute))
}

function tokens(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
}

function stem(word) {
  let w = word
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1)
  if (/(.)\1$/.test(w)) w = w.slice(0, -1)
  return w
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[b.length]
}

function closeWord(a, b) {
  const left = stem(a)
  const right = stem(b)
  if (left === right) return true
  const limit = Math.max(left.length, right.length) >= 8 ? 2 : 1
  return Math.min(left.length, right.length) >= 4 && editDistance(left, right) <= limit
}

function whenText(d, now) {
  return d.noDeadline || !d.day ? 'with no deadline' : `for ${dayLabel(d.day, now)} at ${timeText(d.time)}`
}

export const en = {
  code: 'en-US',

  rx: {
    yes: /\b(yes|yeah|yep|yup|sure|correct|right|ok|okay|confirm|save|go ahead|do it|please do|sounds good)\b/i,
    no: /\b(no|nope|nah|don't|dont|do not|not really|negative)\b/i,
    cancel: /\b(cancel|never ?mind|forget it|abort|drop it)\b/i,
    strongExit: /\b(goodbye|bye|stop listening|end conversation|exit|quit)\b/i,
    skip: /^\s*(no|none|nope|nothing|skip|no thanks|nah|pass)\b/i,
    noDeadline: /\b(no deadline|no date|no day|none|skip|whenever|any ?day|not sure|no)\b/i,
    anyTime: /\b(any ?time|no time|all day|whenever|skip|doesn't matter|does not matter)\b/i,
    help: /\b(help|what can you do)\b/i,
    busy: /\bbusy\b/i,
    bareNo: /^\s*(no|nope|nah)\W*$/i,
  },

  isSoftExit(lower) {
    return lower.split(/\s+/).filter(Boolean).length <= 6 && SOFT_EXIT.test(lower)
  },

  normalize(text) {
    return text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (w) => String(NUMBER_WORDS[w.toLowerCase()]))
  },

  prepTime(text) {
    const t = text.trim()
    if (/^\d{1,2}(:\d{2})?$/.test(t)) return `at ${t}`
    if (/^(\d{1,2})\s+(\d{2})$/.test(t)) return `at ${t.replace(/\s+/, ':')}`
    return t
  },

  parse: parseSpokenTask,

  isAdd(text) {
    return ADD_RE.test(text) || REMIND_RE.test(text)
  },

  editRequest(text) {
    const fieldFirst = text.match(
      new RegExp(`^\\s*${COMMAND_PREFIX}${EDIT_VERB}\\s+(?:the\\s+)?(${EDIT_FIELD})\\s+(?:of|for|on)\\s+(?:(?:the|my)\\s+)?(?:task\\s+)?(.+?)(?:\\s+to\\s+(.+?))?[.!?]*$`, 'i'),
    )
    const taskFirst = text.match(
      new RegExp(`^\\s*${COMMAND_PREFIX}${EDIT_VERB}\\s+(?:(?:the|my)\\s+)?(?:task\\s+)?(.+?)(?:'s)?\\s+(${EDIT_FIELD})(?:\\s+to\\s+(.+?))?[.!?]*$`, 'i'),
    )
    const match = fieldFirst
      ? { name: fieldFirst[2], field: fieldFirst[1], value: fieldFirst[3] }
      : taskFirst
        ? { name: taskFirst[1], field: taskFirst[2], value: taskFirst[3] }
        : null
    if (!match) return null

    return {
      name: match.name.trim().replace(/^["']|["']$/g, '').trim(),
      field: /title|name/i.test(match.field) ? 'title' : /time/i.test(match.field) ? 'time' : 'date',
      value: match.value?.trim().replace(/^["']|["']$/g, '').trim() || null,
    }
  },

  stripAdd(text) {
    return text
      .replace(/^.*?\b(?:add|create|make|new)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|reminder|to-?do|todo)\b[\s,]*(?:to|for|called|named|that|about)?\s*/i, '')
      .replace(/^.*?\bremind me\s+(?:to\s+)?/i, '')
      .trim()
  },

  completeName(text) {
    if (COMPLETE_GENERIC_RE.test(text)) return ''

    for (const re of COMPLETE_RES) {
      const m = text.match(re)
      if (m && m[1]) {
        return m[1]
          .trim()
          .replace(/^["']|["']$/g, '')
          .replace(/^(?:(?:a|an|the|my)\s+)?(?:task\s+)?(?:(?:called|named)\s+)/i, '')
          .trim()
      }
    }

    const shortCommand = text.match(
      new RegExp(`^\\s*${COMMAND_PREFIX}${COMPLETE_VERB}\\s+(?:(?:a|an|the|my|this|that)\\s+)?(?:task\\s+)?(.+?)\\s*[.!?]*$`, 'i'),
    )
    if (shortCommand && shortCommand[1]) return shortCommand[1].trim()

    return null
  },

  deleteName(text) {
    const m = text.match(DELETE_RE)
    return m && m[1] ? m[1] : null
  },

  switchLang(text) {
    return /\b(?:speak|switch to|change to|use|talk)\s+(?:in\s+)?khmer\b|\bkhmer please\b/i.test(text) ? 'km-KH' : null
  },

  isQuery: isScheduleQuery,
  parseQuery,
  answerQuery,

  priorityOf(lower) {
    if (/\b(high|urgent|important|top|critical|asap)\b/i.test(lower)) return 'high'
    if (/\b(low|minor|not important)\b/i.test(lower)) return 'low'
    if (/\b(medium|normal|regular|average|default|middle|moderate)\b/i.test(lower) || this.rx.skip.test(lower)) return 'medium'
    return null
  },

  changeField(lower) {
    if (/\b(title|name|task|what)\b/.test(lower)) return 'title'
    if (/\b(day|date|when)\b/.test(lower)) return 'day'
    if (/\btime\b/.test(lower)) return 'time'
    if (/\bpriority\b/.test(lower)) return 'priority'
    if (/\b(note|notes|description)\b/.test(lower)) return 'notes'
    return null
  },

  pickNumber(lower) {
    const digit = this.normalize(lower).match(/\b(\d+)\b/)
    if (digit) return Number(digit[1])
    const ord = Object.keys(ORDINALS).find((w) => lower.includes(w))
    return ord ? ORDINALS[ord] : null
  },

  findTasks(name, list) {
    const q = tokens(name)
    if (!q.length) return []
    const exact = list.filter((t) => {
      const hay = t.title.toLowerCase()
      return q.every((w) => hay.includes(w))
    })
    if (exact.length) return exact

    const compactQuery = q.join('')
    return list.filter((t) => {
      const titleWords = tokens(t.title)
      const compactTitle = titleWords.join('')
      if (compactQuery.length >= 4 && editDistance(compactQuery, compactTitle) <= 1) return true
      return q.every((word) => titleWords.some((titleWord) => closeWord(word, titleWord)))
    })
  },

  dayLabel,
  timeText,

  t: {
    greetingPrompt: 'What would you like to do?',
    greeting: 'Hi! I can add tasks, update their titles or deadlines, mark them done, and answer schedule questions. What would you like to do?',
    help,
    anythingElse: 'Anything else?',
    bye: 'Okay, talk to you later!',
    cancelled: 'Okay, cancelled.',
    dropped: 'Okay, I dropped it.',
    sure: 'Sure.',
    okay: 'Okay.',
    newTask: 'Okay, a new task.',
    noDeadline: 'No deadline.',

    question(step, d, now) {
      const questions = {
        title: d.flow === 'busy'
          ? d.day ? `What will you be doing ${dayLabel(d.day, now)}?` : 'What will you be doing?'
          : 'What is the task?',
        day: d.flow === 'busy'
          ? 'Which day will you be busy?'
          : 'What day is it for? You can say today, tomorrow, a weekday, a date, or no deadline.',
        time: 'What time? You can say something like 3 pm, or any time.',
        priority: 'Is it high, medium, or low priority?',
        notes: 'Any extra notes? Say no to skip.',
      }
      return questions[step]
    },

    ackDay: (label) => `${capitalize(label)}.`,
    ackTime: (text) => `${text}.`,
    ackPriority: (level) => `${capitalize(level)} priority.`,
    ackNotes: (has) => (has ? 'Noted.' : 'No notes.'),
    badDay: 'Sorry, I did not get the day.',
    leaveNoDeadline: 'I will leave it without a deadline.',
    badTime: 'Sorry, I did not get the time.',
    useTime: (text) => `I will use ${text}.`,
    badPriority: 'Sorry, I did not catch that.',
    defaultMedium: 'I will make it medium priority.',

    confirmPrompt: 'Should I save it?',
    summary(d, now, clash) {
      const priority = d.flow === 'add' ? `, ${d.priority} priority` : ''
      const note = d.notes ? ', with a note' : ''
      const warn = clash
        ? ` Heads up: you already have "${clash.title}" at ${timeFmt.format(new Date(clash.due_date))}.`
        : ''
      return `Here is what I have: "${d.title}" ${whenText(d, now)}${priority}${note}.${warn} Should I save it?`
    },
    created: (d, now) => `Done! I added "${d.title}" ${whenText(d, now)}.`,
    confirmAgain: 'Please say yes to save, or no to change something.',
    changePrompt: 'What should I change? Title, day, time, priority, or say cancel to drop it.',
    changeInvalid: 'Say title, day, time, priority, or cancel.',

    alreadyDone: (title) => `"${title}" is already done.`,
    notFound: (name) => `I could not find a task called ${name}.`,
    noOpenTasks: 'There are no open tasks to mark as done.',
    which: (list) => `Which one? ${list.map((t, i) => `Number ${i + 1}, ${t.title}.`).join(' ')}`,
    marked: (title) => `Nice, I marked "${title}" as done.`,
    editValuePrompt: (field) => `What should the new ${field} be? Say cancel to leave it unchanged.`,
    badEditValue: (field) => `Sorry, I did not get a valid ${field}.`,
    updated: (title, field, value) => `Updated "${title}". Its ${field} is now ${value}.`,
    askDelete: (title) => `Delete "${title}"? Say yes to confirm.`,
    deleted: (title) => `Deleted "${title}".`,
    kept: 'Okay, I kept it.',
    yesNo: 'Please say yes or no.',
    pickAgain: 'Sorry, say the number.',
    neverMind: 'Okay, never mind.',
    unknown: `Sorry, I did not catch that. ${help}`,
    switched: 'Okay, I will speak English. What would you like to do?',
    noHear: 'I did not hear anything.',
    stopping: 'I did not hear anything, so I will stop listening. Press V when you want to talk again.',
    actionFailed: 'Sorry, I could not do that. Please check that the backend is running.',
  },
}