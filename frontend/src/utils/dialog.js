import { en } from './locales/en.js'
import { km } from './locales/km.js'

const LOCALES = { 'en-US': en, 'km-KH': km }

export function getLocale(code) {
  return LOCALES[code] || en
}

export function initialState(lang = 'en-US') {
  return { lang, mode: null, prompt: '', fails: 0 }
}

export function greeting(lang = 'en-US') {
  const L = getLocale(lang)
  return {
    state: { ...initialState(L.code), prompt: L.t.greetingPrompt },
    say: L.t.greeting,
    action: null,
  }
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function idle(L, say, action = null) {
  const prompt = L.t.anythingElse
  return { state: { ...initialState(L.code), prompt }, say: `${say} ${prompt}`.trim(), action }
}

function end(L, say = L.t.bye) {
  return { state: { ...initialState(L.code), ended: true }, say, action: null }
}

function newDraft(flow) {
  return {
    flow,
    title: '',
    day: null,
    noDeadline: false,
    time: null,
    priority: flow === 'busy' ? 'medium' : null,
    notes: flow === 'busy' ? '' : null,
  }
}

function nextStep(d) {
  if (!d.title) return 'title'
  if (!d.day && !d.noDeadline) return 'day'
  if (!d.noDeadline && !d.time) return 'time'
  if (d.priority === null) return 'priority'
  if (d.notes === null) return 'notes'
  return null
}

function dueOf(d) {
  if (d.noDeadline || !d.day || !d.time) return null
  const due = new Date(d.day)
  due.setHours(d.time.hour, d.time.minute, 0, 0)
  return due
}

function findClash(d, ctx) {
  const due = dueOf(d)
  if (!due) return null
  return (
    ctx.tasks.find(
      (t) => !t.completed && t.due_date && Math.abs(new Date(t.due_date) - due) < 60 * 60 * 1000,
    ) || null
  )
}

function advance(L, d, ack, ctx) {
  const step = nextStep(d)

  if (step) {
    const prompt = L.t.question(step, d, ctx.now)
    return {
      state: { lang: L.code, mode: 'slot', draft: d, step, prompt, fails: 0 },
      say: `${ack} ${prompt}`.trim(),
      action: null,
    }
  }

  return {
    state: { lang: L.code, mode: 'confirm', draft: d, prompt: L.t.confirmPrompt, fails: 0 },
    say: `${ack} ${L.t.summary(d, ctx.now, findClash(d, ctx))}`.trim(),
    action: null,
  }
}

function applyParsed(d, p) {
  if (p.hasDate && !d.day && !d.noDeadline) d.day = startOfDay(p.due)
  if (p.hasTime && !d.time) d.time = { hour: p.due.getHours(), minute: p.due.getMinutes() }
  if (p.priority && d.priority === null) d.priority = p.priority
}

function startAdd(L, text, ctx) {
  const d = newDraft('add')
  const rest = L.stripAdd(text)

  if (rest && rest.toLowerCase() !== text.trim().toLowerCase()) {
    const p = L.parse(rest, ctx.now)
    const onlyDate = p.title.toLowerCase() === rest.toLowerCase() && (p.hasDate || p.hasTime)
    if (!onlyDate) d.title = p.title
    applyParsed(d, p)
  }

  return advance(L, d, L.t.sure, ctx)
}

function startBusy(L, text, ctx) {
  const d = newDraft('busy')
  applyParsed(d, L.parse(text, ctx.now))
  return advance(L, d, L.t.okay, ctx)
}

function handleSlot(L, state, text, lower, ctx) {
  if (L.rx.cancel.test(lower)) return idle(L, L.t.cancelled)
  if (L.rx.strongExit.test(lower)) return end(L)

  const d = { ...state.draft }
  const fail = (msg, giveUp) => {
    if (state.fails + 1 >= 2) return giveUp()
    return { state: { ...state, fails: state.fails + 1 }, say: `${msg} ${state.prompt}`, action: null }
  }

  if (state.step === 'title') {
    const p = L.parse(text, ctx.now)
    d.title = p.title
    applyParsed(d, p)
    return advance(L, d, L.t.okay, ctx)
  }

  if (state.step === 'day') {
    if (L.rx.noDeadline.test(lower)) {
      d.noDeadline = true
      return advance(L, d, L.t.noDeadline, ctx)
    }
    const p = L.parse(L.normalize(text), ctx.now)
    if (p.hasDate || p.hasTime) {
      d.day = startOfDay(p.due)
      if (p.hasTime && !d.time) d.time = { hour: p.due.getHours(), minute: p.due.getMinutes() }
      return advance(L, d, L.t.ackDay(L.dayLabel(d.day, ctx.now)), ctx)
    }
    return fail(L.t.badDay, () => {
      d.noDeadline = true
      return advance(L, d, L.t.leaveNoDeadline, ctx)
    })
  }

  if (state.step === 'time') {
    if (L.rx.anyTime.test(lower) || L.rx.skip.test(lower)) {
      d.time = { hour: 17, minute: 0 }
      return advance(L, d, L.t.useTime(L.timeText(d.time)), ctx)
    }
    const p = L.parse(L.prepTime(L.normalize(text)), ctx.now)
    if (p.hasTime) {
      d.time = { hour: p.due.getHours(), minute: p.due.getMinutes() }
      return advance(L, d, L.t.ackTime(L.timeText(d.time)), ctx)
    }
    return fail(L.t.badTime, () => {
      d.time = { hour: 17, minute: 0 }
      return advance(L, d, L.t.useTime(L.timeText(d.time)), ctx)
    })
  }

  if (state.step === 'priority') {
    const level = L.priorityOf(lower)
    if (level) {
      d.priority = level
      return advance(L, d, L.t.ackPriority(level), ctx)
    }
    return fail(L.t.badPriority, () => {
      d.priority = 'medium'
      return advance(L, d, L.t.defaultMedium, ctx)
    })
  }

  if (state.step === 'notes') {
    const skipped = L.rx.skip.test(lower)
    d.notes = skipped ? '' : text.trim().replace(/^./, (c) => c.toUpperCase())
    return advance(L, d, L.t.ackNotes(!skipped), ctx)
  }

  return idle(L, '')
}

function handleConfirm(L, state, text, lower, ctx) {
  const d = state.draft
  if (L.rx.cancel.test(lower)) return idle(L, L.t.dropped)
  if (L.rx.strongExit.test(lower)) return end(L)

  if (L.rx.yes.test(lower) && !L.rx.no.test(lower)) {
    return idle(L, L.t.created(d, ctx.now), {
      type: 'create',
      task: { title: d.title, description: d.notes || '', priority: d.priority || 'medium', due: dueOf(d) },
    })
  }

  if (L.rx.no.test(lower)) {
    const prompt = L.t.changePrompt
    return { state: { lang: L.code, mode: 'change', draft: d, prompt, fails: 0 }, say: prompt, action: null }
  }

  return { state, say: `${L.t.confirmAgain} ${state.prompt}`, action: null }
}

function handleChange(L, state, text, lower, ctx) {
  if (L.rx.cancel.test(lower)) return idle(L, L.t.dropped)
  if (L.rx.strongExit.test(lower)) return end(L)

  const field = L.changeField(lower)
  if (!field) return { state, say: `${L.t.changeInvalid} ${state.prompt}`, action: null }

  const d = { ...state.draft }
  if (field === 'title') d.title = ''
  if (field === 'day') {
    d.day = null
    d.noDeadline = false
  }
  if (field === 'time') d.time = null
  if (field === 'priority') d.priority = null
  if (field === 'notes') d.notes = null

  return advance(L, d, L.t.okay, ctx)
}

function startComplete(L, name, ctx) {
  const openTasks = ctx.tasks.filter((t) => !t.completed)
  if (!name && !openTasks.length) return idle(L, L.t.noOpenTasks)
  const matches = name ? L.findTasks(name, openTasks) : openTasks

  if (matches.length === 0) {
    const doneMatches = L.findTasks(name, ctx.tasks.filter((t) => t.completed))
    if (doneMatches.length) return idle(L, L.t.alreadyDone(doneMatches[0].title))
    return idle(L, L.t.notFound(name))
  }

  if (matches.length === 1) return completeAction(L, matches[0])

  const prompt = L.t.which(matches)
  return { state: { lang: L.code, mode: 'pick', verb: 'complete', candidates: matches, prompt, fails: 0 }, say: prompt, action: null }
}

function completeAction(L, task) {
  return idle(L, L.t.marked(task.title), { type: 'complete', id: task.id })
}

function startEdit(L, edit, ctx) {
  const matches = L.findTasks(edit.name, ctx.tasks)
  if (!matches.length) return idle(L, L.t.notFound(edit.name))

  if (matches.length === 1) return continueEdit(L, matches[0], edit, ctx)

  const prompt = L.t.which(matches)
  return {
    state: { lang: L.code, mode: 'pick', verb: 'edit', edit, candidates: matches, prompt, fails: 0 },
    say: prompt,
    action: null,
  }
}

function continueEdit(L, task, edit, ctx) {
  if (!edit.value) {
    const prompt = L.t.editValuePrompt(edit.field)
    return {
      state: { lang: L.code, mode: 'edit_value', task, edit, prompt, fails: 0 },
      say: prompt,
      action: null,
    }
  }

  return applyEdit(L, task, edit, ctx)
}

function applyEdit(L, task, edit, ctx) {
  if (edit.field === 'title') {
    const title = edit.value.trim()
    if (!title) return idle(L, L.t.notFound(edit.name))
    return idle(L, L.t.updated(task.title, 'title', title), {
      type: 'update',
      id: task.id,
      changes: { title },
    })
  }

  if (edit.field === 'date' && L.rx.noDeadline.test(edit.value)) {
    return idle(L, L.t.updated(task.title, 'deadline', 'none'), {
      type: 'update',
      id: task.id,
      changes: { due_date: null },
    })
  }

  const parsed = L.parse(L.normalize(edit.value), ctx.now)
  const needsDate = edit.field === 'date'
  if ((needsDate && !parsed.hasDate) || (!needsDate && !parsed.hasTime)) {
    const prompt = L.t.editValuePrompt(edit.field)
    return {
      state: { lang: L.code, mode: 'edit_value', task, edit, prompt, fails: 1 },
      say: `${L.t.badEditValue(edit.field)} ${prompt}`,
      action: null,
    }
  }

  const existing = task.due_date ? new Date(task.due_date) : null
  const due = existing || new Date(parsed.due)

  if (parsed.hasDate) {
    due.setFullYear(parsed.due.getFullYear(), parsed.due.getMonth(), parsed.due.getDate())
  }
  if (parsed.hasTime) {
    due.setHours(parsed.due.getHours(), parsed.due.getMinutes(), 0, 0)
  } else if (!existing) {
    due.setHours(17, 0, 0, 0)
  }

  const value = edit.field === 'date' ? L.dayLabel(due, ctx.now) : L.timeText({
    hour: due.getHours(),
    minute: due.getMinutes(),
  })

  return idle(L, L.t.updated(task.title, edit.field, value), {
    type: 'update',
    id: task.id,
    changes: { due_date: due.toISOString() },
  })
}

function startDelete(L, name, ctx) {
  const matches = L.findTasks(name, ctx.tasks)
  if (matches.length === 0) return idle(L, L.t.notFound(name))
  if (matches.length === 1) return askDelete(L, matches[0])

  const prompt = L.t.which(matches)
  return { state: { lang: L.code, mode: 'pick', verb: 'delete', candidates: matches, prompt, fails: 0 }, say: prompt, action: null }
}

function askDelete(L, task) {
  const prompt = L.t.askDelete(task.title)
  return { state: { lang: L.code, mode: 'confirm_delete', task, prompt, fails: 0 }, say: prompt, action: null }
}

function handlePick(L, state, text, lower, ctx) {
  if (L.rx.cancel.test(lower)) return idle(L, L.t.cancelled)
  if (L.rx.strongExit.test(lower)) return end(L)

  const n = L.pickNumber(lower)
  let task = n && n >= 1 && n <= state.candidates.length ? state.candidates[n - 1] : null

  if (!task) {
    const byName = L.findTasks(text, state.candidates)
    if (byName.length === 1) task = byName[0]
  }

  if (!task) {
    if (state.fails + 1 >= 2) return idle(L, L.t.neverMind)
    return { state: { ...state, fails: state.fails + 1 }, say: `${L.t.pickAgain} ${state.prompt}`, action: null }
  }

  if (state.verb === 'complete') return completeAction(L, task)
  if (state.verb === 'edit') return continueEdit(L, task, state.edit, ctx)
  return askDelete(L, task)
}

function handleEditValue(L, state, text, lower, ctx) {
  if (L.rx.cancel.test(lower)) return idle(L, L.t.cancelled)
  if (L.rx.strongExit.test(lower)) return end(L)
  return applyEdit(L, state.task, { ...state.edit, value: text.trim() }, ctx)
}

function handleConfirmDelete(L, state, text, lower) {
  if (L.rx.strongExit.test(lower)) return end(L)

  if (L.rx.yes.test(lower) && !L.rx.no.test(lower)) {
    return idle(L, L.t.deleted(state.task.title), { type: 'delete', id: state.task.id })
  }

  if (L.rx.no.test(lower) || L.rx.cancel.test(lower)) return idle(L, L.t.kept)
  return { state, say: `${L.t.yesNo} ${state.prompt}`, action: null }
}

function handleIdle(L, state, text, lower, ctx) {
  if (L.rx.strongExit.test(lower)) return end(L)
  if (L.isSoftExit(lower)) return end(L)
  if (L.rx.bareNo.test(text)) return end(L)

  const target = L.switchLang(text) || (L.code === 'en-US' ? null : getLocale('en-US').switchLang(text))
  const other = target && target !== L.code ? getLocale(target) : null
  if (other) {
    return {
      state: { ...initialState(other.code), prompt: other.t.greetingPrompt },
      say: other.t.switched,
      action: null,
    }
  }

  if (L.rx.help.test(lower)) return idle(L, L.t.help)

  const edit = L.editRequest?.(text)
  if (edit) return startEdit(L, edit, ctx)

  if (L.isAdd(text)) return startAdd(L, text, ctx)

  const completeName = L.completeName(text)
  if (completeName !== null) return startComplete(L, completeName, ctx)

  const deleteName = L.deleteName(text)
  if (deleteName) return startDelete(L, deleteName, ctx)

  if (L.isQuery(text)) {
    return idle(L, L.answerQuery(L.parseQuery(text, ctx.now), ctx.tasks, ctx.now).text)
  }

  if (L.rx.busy.test(lower)) return startBusy(L, text, ctx)

  const p = L.parse(text, ctx.now)
  if (p.hasDate || p.hasTime) {
    const d = newDraft('add')
    d.title = p.title
    applyParsed(d, p)
    return advance(L, d, L.t.newTask, ctx)
  }

  return {
    state: { ...initialState(L.code), prompt: L.t.greetingPrompt },
    say: L.t.unknown,
    action: null,
  }
}

export function respond(state, raw, ctx) {
  const L = getLocale(state.lang)
  const text = (raw || '').trim()
  const lower = text.toLowerCase()

  if (!text) return { state, say: state.prompt || L.t.greetingPrompt, action: null }

  switch (state.mode) {
    case 'slot': return handleSlot(L, state, text, lower, ctx)
    case 'confirm': return handleConfirm(L, state, text, lower, ctx)
    case 'change': return handleChange(L, state, text, lower, ctx)
    case 'pick': return handlePick(L, state, text, lower, ctx)
    case 'edit_value': return handleEditValue(L, state, text, lower, ctx)
    case 'confirm_delete': return handleConfirmDelete(L, state, text, lower)
    default: return handleIdle(L, state, text, lower, ctx)
  }
}