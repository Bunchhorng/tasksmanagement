import { parseSpokenTaskKm, toAscii, toKhmerDigits, weekdayMention, WEEKDAYS_KM, MONTHS_KM } from '../parseVoiceKm.js'

const PRIORITY_KM = { high: 'ខ្ពស់', medium: 'មធ្យម', low: 'ទាប' }
const NUMBER_WORDS = [
  ['ប្រាំបួន', 9],
  ['ប្រាំបី', 8],
  ['ប្រាំពីរ', 7],
  ['ប្រាំមួយ', 6],
  ['ប្រាំ', 5],
  ['បួន', 4],
  ['បី', 3],
  ['ពីរ', 2],
  ['មួយ', 1],
]

const ADD_RE = /(?:បន្ថែម|បង្កើត)\s*(?:កិច្ចការ|ការងារ|ភារកិច្ច)|កិច្ចការថ្មី|រំលឹក/
const QUERY_RE = /កាលវិភាគ|អ្វីខ្លះ|ធ្វើអ្វី|មានអ្វី|មានការងារ|មានកិច្ចការ|មានគម្រោង|តើ|ទំនេរ|ហួសកំណត់|រវល់ទេ|ទេ\s*[?។]?\s*$/
const COMPLETE_GENERIC_RE =
  /(?:សម្គាល់|ធីក)\s*(?:(?:កិច្ចការ|ការងារ|ភារកិច្ច)\s*)?(?:ថា|ជា)?\s*(?:បាន)?(?:រួចរាល់|រួចហើយ|បញ្ចប់|ធ្វើរួច)/
const COMPLETE_RES = [
  /(?:សម្គាល់|ធីក)\s*(.+?)\s*(?:ថា|ជា)?\s*(?:បាន)?(?:រួចរាល់|រួចហើយ|បញ្ចប់|ធ្វើរួច)/,
  /(?:ខ្ញុំ\s*)?(?:បាន)?បញ្ចប់\s*(.+)/,
  /^(.+?)\s*(?:រួចរាល់ហើយ|រួចហើយ|បានបញ្ចប់|រួចរាល់)\s*$/,
]
const DELETE_RE = /(?:លុប|ដកចេញ)\s*(?:កិច្ចការ)?\s*(.+)/

const help = 'អ្នកអាចនិយាយថា៖ បន្ថែមកិច្ចការ ខ្ញុំរវល់ថ្ងៃចន្ទ កាលវិភាគថ្ងៃស្អែក ឬសម្គាល់កិច្ចការថារួចរាល់ ហើយជ្រើសរើសកិច្ចការមួយពីបញ្ជី។ អ្នកក៏អាចនិយាយឈ្មោះកិច្ចការ ដូចជា សម្គាល់ការហៅម៉ាក់ថារួចរាល់ ឬលុបកិច្ចការ។ និយាយថា ជម្រាបលា ពេលចប់។'

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

function dayLabel(day, now) {
  const diff = Math.round((startOfDay(day) - startOfDay(now)) / 86400000)
  if (diff === 0) return 'ថ្ងៃនេះ'
  if (diff === 1) return 'ថ្ងៃស្អែក'
  return `ថ្ងៃ${WEEKDAYS_KM[day.getDay()]} ទី${toKhmerDigits(day.getDate())} ខែ${MONTHS_KM[day.getMonth()]}`
}

function timeText({ hour, minute }) {
  const h12 = hour % 12 || 12
  let period = 'យប់'
  if (hour === 12) period = 'ថ្ងៃត្រង់'
  else if (hour >= 13 && hour <= 16) period = 'រសៀល'
  else if (hour >= 17 && hour <= 18) period = 'ល្ងាច'
  else if (hour >= 5 && hour <= 11) period = 'ព្រឹក'
  const mins = minute ? ` និង ${toKhmerDigits(minute)} នាទី` : ''
  return `ម៉ោង ${toKhmerDigits(h12)}${mins} ${period}`
}

function timeOfDate(date) {
  return timeText({ hour: date.getHours(), minute: date.getMinutes() })
}

function joinList(list) {
  if (list.length <= 1) return list.join('')
  return `${list.slice(0, -1).join(', ')} និង ${list[list.length - 1]}`
}

function whenText(d, now) {
  return d.noDeadline || !d.day ? 'ដោយគ្មានកាលកំណត់' : `សម្រាប់${dayLabel(d.day, now)} ${timeText(d.time)}`
}

function parseQuery(text, now = new Date()) {
  const t = toAscii(text)
  const today = startOfDay(now)
  const weekday = now.getDay()

  if (/ហួសកំណត់|យឺត/.test(t)) return { kind: 'overdue' }

  if (/(?<!ថ្ងៃ\s*)(?:សប្[តដ]ាហ៍|អាទិត្យ)\s*ក្រោយ/.test(t)) {
    const start = addDays(today, (8 - weekday) % 7 || 7)
    return { kind: 'range', start, end: addDays(start, 6), label: 'សប្តាហ៍ក្រោយ' }
  }

  if (/(?<!ថ្ងៃ\s*)(?:សប្[តដ]ាហ៍|អាទិត្យ)\s*នេះ/.test(t)) {
    return { kind: 'range', start: today, end: addDays(today, (7 - weekday) % 7), label: 'សប្តាហ៍នេះ' }
  }

  const named = weekdayMention(t)
  if (named && !named.next && named.index === weekday) {
    return { kind: 'range', start: today, end: today, label: 'ថ្ងៃនេះ' }
  }

  const p = parseSpokenTaskKm(t, now)
  if (p.hasDate || p.hasTime) {
    const day = startOfDay(p.due)
    return { kind: 'range', start: day, end: day, label: dayLabel(day, now) }
  }

  if (/ខាងមុខ|ឆាប់ៗ/.test(t)) {
    return { kind: 'range', start: today, end: addDays(today, 6), label: '៧ ថ្ងៃខាងមុខ' }
  }

  return { kind: 'range', start: today, end: today, label: 'ថ្ងៃនេះ' }
}

function answerQuery(query, tasks, now = new Date()) {
  const open = tasks.filter((t) => !t.completed)
  const byDue = (a, b) => new Date(a.due_date) - new Date(b.due_date)

  if (query.kind === 'overdue') {
    const late = open.filter((t) => t.due_date && new Date(t.due_date) < now).sort(byDue)
    const text = late.length
      ? `អ្នកមាន ${toKhmerDigits(late.length)} កិច្ចការហួសកំណត់៖ ${joinList(late.map((t) => t.title))}។`
      : 'មិនមានកិច្ចការហួសកំណត់ទេ។ ល្អណាស់!'
    return { title: 'ហួសកំណត់', text, items: late.map((t) => ({ id: t.id, title: t.title, priority: t.priority, when: timeOfDate(new Date(t.due_date)) })) }
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

  const phrase = (t) => {
    const d = new Date(t.due_date)
    return multiDay
      ? `${t.title} ថ្ងៃ${WEEKDAYS_KM[d.getDay()]} ${timeOfDate(d)}`
      : `${t.title} ${timeOfDate(d)}`
  }

  let text = scheduled.length
    ? `អ្នកមាន ${toKhmerDigits(scheduled.length)} កិច្ចការ ${query.label}៖ ${joinList(scheduled.map(phrase))}។`
    : `អ្នកទំនេរ ${query.label}។ មិនមានកិច្ចការអ្វីទេ។`

  if (doneCount) text += ` អ្នកបានបញ្ចប់ ${toKhmerDigits(doneCount)} រួចហើយ។`

  return {
    title: query.label,
    text,
    items: scheduled.map((t) => ({ id: t.id, title: t.title, priority: t.priority, when: timeOfDate(new Date(t.due_date)) })),
  }
}

function normalizeTitle(s) {
  return toAscii(s).toLowerCase().replace(/\s+/g, '')
}

export const km = {
  code: 'km-KH',

  rx: {
    yes: /បាទ|ចាស|បាន|ត្រូវ|យល់ព្រម|យល់ស្រប|ព្រម|រក្សាទុក|\b(yes|yeah|ok|okay)\b/i,
    no: /ទេ|មិនបាន|មិនត្រូវ|\b(no|nope)\b/i,
    cancel: /បោះបង់|ទុកចោល|ភ្លេចវាចុះ/,
    strongExit: /ជម្រាបលា|លាហើយ|លាសិនហើយ|ឈប់ស្តាប់|បញ្ចប់ការសន្ទនា|\b(bye|goodbye)\b/i,
    skip: /^\s*(ទេ|គ្មាន|មិនមាន|រំលង|អត់)(?![ក-ឳ])/,
    noDeadline: /គ្មានកាលកំណត់|គ្មានថ្ងៃ|មិនកំណត់|ថ្ងៃណាក៏បាន|មិនដឹង|រំលង|គ្មាន/,
    anyTime: /ម៉ោងណាក៏បាន|ពេលណាក៏បាន|មិនកំណត់|គ្មានម៉ោង|រំលង/,
    help: /ជំនួយ|ធ្វើអ្វីបាន/,
    busy: /រវល់/,
    bareNo: /^\s*(ទេ|បាទទេ|ចាសទេ)[\s.!?។]*$/,
  },

  isSoftExit(lower) {
    return lower.length <= 30 && /អស់ហើយ|គ្មានអ្វីទៀត|អរគុណ|ចប់ហើយ/.test(lower)
  },

  normalize: toAscii,

  prepTime(text) {
    const t = toAscii(text).trim()
    return /^\d{1,2}([:.]\d{2})?$/.test(t) ? `ម៉ោង ${t}` : t
  },

  parse: parseSpokenTaskKm,

  isAdd(text) {
    return ADD_RE.test(text)
  },

  stripAdd(text) {
    return text
      .replace(/^.*?(?:(?:បន្ថែម|បង្កើត)\s*(?:កិច្ចការ|ការងារ|ភារកិច្ច)(?:ថ្មី)?|កិច្ចការថ្មី)\s*(?:ដើម្បី|ថា|ឲ្យ|ឱ្យ|ឈ្មោះ|អំពី|សម្រាប់)?\s*/, '')
      .replace(/^.*?រំលឹក(?:ខ្ញុំ)?\s*(?:ឲ្យ|ឱ្យ|ថា|ដើម្បី)?\s*/, '')
      .trim()
  },

  completeName(text) {
    if (COMPLETE_GENERIC_RE.test(text)) return ''

    for (const re of COMPLETE_RES) {
      const m = text.match(re)
      if (m && m[1]) {
        return m[1]
          .trim()
          .replace(/^(?:(?:កិច្ចការ|ការងារ|ភារកិច្ច)\s*)+/, '')
          .replace(/^(?:ឈ្មោះ|ដែល)\s*/, '')
          .trim()
      }
    }
    return null
  },

  deleteName(text) {
    const m = text.match(DELETE_RE)
    return m && m[1] ? m[1] : null
  },

  switchLang(text) {
    return /អង់គ្លេស|\benglish\b/i.test(text) ? 'en-US' : null
  },

  isQuery(text) {
    return QUERY_RE.test(text) && !ADD_RE.test(text)
  },
  parseQuery,
  answerQuery,

  priorityOf(lower) {
    if (/ខ្ពស់|បន្ទាន់|សំខាន់/.test(lower)) return 'high'
    if (/ទាប|តិចតួច/.test(lower)) return 'low'
    if (/មធ្យម|ធម្មតា/.test(lower) || this.rx.skip.test(lower)) return 'medium'
    return null
  },

  changeField(lower) {
    if (/ចំណងជើង|ឈ្មោះ|កិច្ចការ/.test(lower)) return 'title'
    if (/ថ្ងៃ|កាលបរិច្ឆេទ/.test(lower)) return 'day'
    if (/ម៉ោង|ពេល/.test(lower)) return 'time'
    if (/អាទិភាព/.test(lower)) return 'priority'
    if (/កំណត់ចំណាំ|ចំណាំ/.test(lower)) return 'notes'
    return null
  },

  pickNumber(lower) {
    const digit = toAscii(lower).match(/(\d+)/)
    if (digit) return Number(digit[1])
    const word = NUMBER_WORDS.find(([w]) => lower.includes(w))
    return word ? word[1] : null
  },

  findTasks(name, list) {
    const q = normalizeTitle(name)
    if (!q) return []
    return list.filter((t) => {
      const hay = normalizeTitle(t.title)
      return hay.includes(q) || (hay.length >= 2 && q.includes(hay))
    })
  },

  dayLabel,
  timeText,

  t: {
    greetingPrompt: 'តើអ្នកចង់ធ្វើអ្វី?',
    greeting: 'សួស្ដី! ខ្ញុំកំពុងស្តាប់។ អ្នកអាចបន្ថែមកិច្ចការ ប្រាប់ខ្ញុំថាពេលណាអ្នករវល់ សួរអំពីកាលវិភាគ ឬសម្គាល់កិច្ចការថារួចរាល់។ តើអ្នកចង់ធ្វើអ្វី?',
    help,
    anythingElse: 'មានអ្វីទៀតទេ?',
    bye: 'ជួបគ្នាលើកក្រោយ!',
    cancelled: 'បានបោះបង់។',
    dropped: 'ខ្ញុំបានបោះបង់វាហើយ។',
    sure: 'បាន។',
    okay: 'យល់ហើយ។',
    newTask: 'យល់ហើយ កិច្ចការថ្មី។',
    noDeadline: 'គ្មានកាលកំណត់។',

    question(step, d, now) {
      const questions = {
        title: d.flow === 'busy'
          ? d.day ? `តើអ្នកនឹងធ្វើអ្វី ${dayLabel(d.day, now)}?` : 'តើអ្នកនឹងធ្វើអ្វី?'
          : 'តើកិច្ចការអ្វី?',
        day: d.flow === 'busy'
          ? 'តើអ្នករវល់ថ្ងៃណា?'
          : 'តើសម្រាប់ថ្ងៃណា? អ្នកអាចនិយាយថា ថ្ងៃនេះ ថ្ងៃស្អែក ថ្ងៃចន្ទ កាលបរិច្ឆេទ ឬគ្មានកាលកំណត់។',
        time: 'ម៉ោងប៉ុន្មាន? ឧទាហរណ៍ ម៉ោង ៣ រសៀល ឬម៉ោងណាក៏បាន។',
        priority: 'អាទិភាពខ្ពស់ មធ្យម ឬទាប?',
        notes: 'មានកំណត់ចំណាំបន្ថែមទេ? និយាយថា ទេ ដើម្បីរំលង។',
      }
      return questions[step]
    },

    ackDay: (label) => `${label}។`,
    ackTime: (text) => `${text}។`,
    ackPriority: (level) => `អាទិភាព${PRIORITY_KM[level]}។`,
    ackNotes: (has) => (has ? 'បានកត់ត្រា។' : 'គ្មានកំណត់ចំណាំ។'),
    badDay: 'សុំទោស ខ្ញុំមិនយល់ថ្ងៃទេ។',
    leaveNoDeadline: 'ខ្ញុំនឹងទុកវាដោយគ្មានកាលកំណត់។',
    badTime: 'សុំទោស ខ្ញុំមិនយល់ម៉ោងទេ។',
    useTime: (text) => `ខ្ញុំនឹងប្រើ ${text}។`,
    badPriority: 'សុំទោស ខ្ញុំស្តាប់មិនបានទេ។',
    defaultMedium: 'ខ្ញុំនឹងដាក់អាទិភាពមធ្យម។',

    confirmPrompt: 'តើខ្ញុំរក្សាទុកទេ?',
    summary(d, now, clash) {
      const priority = d.flow === 'add' ? `, អាទិភាព${PRIORITY_KM[d.priority]}` : ''
      const note = d.notes ? ', មានកំណត់ចំណាំ' : ''
      const warn = clash
        ? ` ប្រយ័ត្ន៖ អ្នកមាន "${clash.title}" ${timeOfDate(new Date(clash.due_date))} រួចហើយ។`
        : ''
      return `នេះជាអ្វីដែលខ្ញុំមាន៖ "${d.title}" ${whenText(d, now)}${priority}${note}។${warn} តើខ្ញុំរក្សាទុកទេ?`
    },
    created: (d, now) => `រួចរាល់! ខ្ញុំបានបន្ថែម "${d.title}" ${whenText(d, now)}។`,
    confirmAgain: 'សូមនិយាយថា បាទ ដើម្បីរក្សាទុក ឬ ទេ ដើម្បីកែប្រែ។',
    changePrompt: 'តើត្រូវកែអ្វី? ចំណងជើង ថ្ងៃ ម៉ោង អាទិភាព ឬនិយាយថា បោះបង់។',
    changeInvalid: 'សូមនិយាយថា ចំណងជើង ថ្ងៃ ម៉ោង អាទិភាព ឬបោះបង់។',

    alreadyDone: (title) => `"${title}" បានរួចរាល់ហើយ។`,
    notFound: (name) => `ខ្ញុំរកមិនឃើញកិច្ចការឈ្មោះ ${name} ទេ។`,
    noOpenTasks: 'មិនមានកិច្ចការដែលមិនទាន់រួចរាល់ទេ។',
    which: (list) => `តើមួយណា? ${list.map((t, i) => `លេខ ${toKhmerDigits(i + 1)}, ${t.title}។`).join(' ')}`,
    marked: (title) => `ល្អណាស់! ខ្ញុំបានសម្គាល់ "${title}" ថារួចរាល់។`,
    askDelete: (title) => `លុប "${title}"? សូមនិយាយថា បាទ ដើម្បីបញ្ជាក់។`,
    deleted: (title) => `បានលុប "${title}"។`,
    kept: 'យល់ហើយ ខ្ញុំរក្សាទុកវា។',
    yesNo: 'សូមនិយាយថា បាទ ឬ ទេ។',
    pickAgain: 'សុំទោស សូមនិយាយលេខ។',
    neverMind: 'យល់ហើយ មិនអីទេ។',
    unknown: `សុំទោស ខ្ញុំស្តាប់មិនបានទេ។ ${help}`,
    switched: 'បាន ខ្ញុំនឹងនិយាយជាភាសាខ្មែរ។ តើអ្នកចង់ធ្វើអ្វី?',
    noHear: 'ខ្ញុំមិនឮអ្វីទេ។',
    stopping: 'ខ្ញុំមិនឮអ្វីទេ ដូច្នេះខ្ញុំនឹងឈប់ស្តាប់។ ចុច V ពេលអ្នកចង់និយាយម្តងទៀត។',
    actionFailed: 'សុំទោស ខ្ញុំធ្វើមិនបានទេ។ សូមពិនិត្យថា backend កំពុងដំណើរការ។',
  },
}