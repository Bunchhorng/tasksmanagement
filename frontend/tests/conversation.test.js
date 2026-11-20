import test from 'node:test'
import assert from 'node:assert/strict'

const recognitions = []
const utterances = []
const actions = []

class MockRecognition {
  constructor() {
    this.lang = ''
    this.continuous = false
    this.interimResults = false
    recognitions.push(this)
  }

  start() {
    this.started = true
  }

  abort() {
    this.aborted = true
    this.onend?.()
  }
}

const synth = {
  cancel() {
    if (utterances.length) utterances.at(-1).cancelled = true
  },
  getVoices: () => [{ lang: 'en-US' }],
  addEventListener() {},
  speak(utterance) {
    utterances.push(utterance)
  },
}

globalThis.window = {
  SpeechRecognition: MockRecognition,
  speechSynthesis: synth,
}
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text
    utterances.push(this)
  }
}

const { useConversation } = await import('../src/composables/useConversation.js')

test('listens only after the assistant finishes speaking', async () => {
  const conversation = useConversation({
    getTasks: () => [{ id: 5, title: 'Buy milk', completed: false }],
    runAction: async (action) => {
      actions.push(action)
      return true
    },
  })

  conversation.start()
  assert.equal(utterances[0].text.startsWith('Hi!'), true)
  assert.equal(recognitions.length, 0)
  utterances[0].onend()
  assert.equal(recognitions[0].started, true)

  const result = [{ 0: { transcript: 'mark buy milk as done' }, isFinal: true }]
  recognitions[0].onresult({ results: result })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(actions, [{ type: 'complete', id: 5 }])
  const reply = utterances.find((utterance) => utterance.text?.includes('marked "Buy milk" as done'))
  assert.ok(reply)
  assert.equal(recognitions.length, 1)
  reply.onend()
  assert.equal(recognitions.length, 2)
  conversation.stop()
})

test('goodbye stops after the final response without reopening the microphone', () => {
  const conversation = useConversation({
    getTasks: () => [],
    runAction: async () => true,
  })

  conversation.start()
  utterances.at(-1).onend()
  const rec = recognitions.at(-1)
  rec.onresult({ results: [{ 0: { transcript: 'goodbye' }, isFinal: true }] })
  const farewell = utterances.at(-1)
  assert.match(farewell.text, /talk to you later/i)
  const countBeforeEnd = recognitions.length

  farewell.onend()

  assert.equal(conversation.active.value, false)
  assert.equal(recognitions.length, countBeforeEnd)
})

test('interrupting a reply cancels speech before reopening the microphone', () => {
  actions.length = 0
  const conversation = useConversation({
    getTasks: () => [{ id: 8, title: 'Send invoice', completed: false }],
    runAction: async (action) => {
      actions.push(action)
      return true
    },
  })

  conversation.start()
  const greeting = utterances.at(-1)
  const priorRecognitionCount = recognitions.length

  conversation.interrupt()

  assert.equal(greeting.cancelled, true)
  assert.equal(recognitions.length, priorRecognitionCount + 1)
  assert.equal(conversation.phase.value, 'listening')

  recognitions.at(-1).onresult({
    results: [{ 0: { transcript: 'mark send invoice as done' }, isFinal: true }],
  })

  return new Promise((resolve) => setImmediate(resolve)).then(() => {
    assert.deepEqual(actions, [{ type: 'complete', id: 8 }])
    conversation.stop()
  })
})
