import { ref } from 'vue'
import { greeting, getLocale, respond } from '../utils/dialog.js'

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition

const synth = window.speechSynthesis || null

export const conversationSupported = Boolean(SpeechRecognition) && Boolean(synth)

const LANG_KEY = 'voicetask-lang'

function loadLang() {
  try {
    return localStorage.getItem(LANG_KEY) === 'km-KH' ? 'km-KH' : 'en-US'
  } catch {
    return 'en-US'
  }
}

function saveLang(code) {
  try {
    localStorage.setItem(LANG_KEY, code)
  } catch {
    return
  }
}

function pickVoice(code) {
  const voices = synth ? synth.getVoices() : []
  const norm = (v) => v.lang.replace('_', '-').toLowerCase()
  return (
    voices.find((v) => norm(v) === code.toLowerCase()) ||
    voices.find((v) => norm(v).startsWith(code.slice(0, 2).toLowerCase())) ||
    null
  )
}

export function useConversation({ getTasks, runAction, onError }) {
  const active = ref(false)
  const phase = ref('idle')
  const interim = ref('')
  const log = ref([])
  const lang = ref(loadLang())
  const khmerVoice = ref(false)

  let state = greeting(lang.value).state
  let recognition = null
  let silent = 0
  let runId = 0
  let speakToken = 0
  let speakTimer = null
  let warnedNoVoice = false

  function refreshVoices() {
    khmerVoice.value = Boolean(pickVoice('km-KH'))
  }

  if (synth) {
    refreshVoices()
    synth.addEventListener?.('voiceschanged', refreshVoices)
  }

  const L = () => getLocale(state.lang)

  function push(who, text) {
    log.value = [...log.value, { who, text }].slice(-20)
  }

  function speak(text, next) {
    push('bot', text)
    phase.value = 'speaking'

    const token = ++speakToken
    const id = runId
    const code = state.lang
    const voice = pickVoice(code)
    let finished = false

    const finish = () => {
      if (finished || token !== speakToken) return
      finished = true
      clearTimeout(speakTimer)
      if (id === runId && active.value) next()
    }

    synth.cancel()
    clearTimeout(speakTimer)

    if (code === 'km-KH' && !voice) {
      if (!warnedNoVoice) {
        warnedNoVoice = true
        onError?.('No Khmer voice found in this browser, so Khmer replies show on screen only. Try Microsoft Edge.')
      }
      speakTimer = setTimeout(finish, Math.min(1500 + text.length * 35, 9000))
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    if (voice) utterance.voice = voice
    utterance.lang = voice ? voice.lang : code
    utterance.onend = finish
    utterance.onerror = finish
    speakTimer = setTimeout(finish, text.length * 90 + 4000)
    synth.speak(utterance)
  }

  function fatal(message) {
    onError?.(message)
    stop()
  }

  function noSpeech() {
    silent += 1

    if (silent >= 3) {
      speak(L().t.stopping, stop)
      return
    }

    const prompt = state.prompt || L().t.greetingPrompt
    speak(silent === 1 ? `${L().t.noHear} ${prompt}` : prompt, listen)
  }

  async function heard(text) {
    const rec = recognition
    recognition = null
    try {
      rec?.abort()
    } catch (err) {
      console.error(err)
    }

    silent = 0
    interim.value = ''
    push('user', text)
    phase.value = 'thinking'

    const id = runId
    const result = respond(state, text, { tasks: getTasks(), now: new Date() })
    state = result.state
    lang.value = state.lang
    saveLang(state.lang)
    let say = result.say

    if (result.action) {
      const ok = await runAction(result.action)
      if (id !== runId || !active.value) return

      if (!ok) {
        say = L().t.actionFailed
        state = { ...greeting(state.lang).state, prompt: L().t.greetingPrompt }
      }
    }

    speak(say, state.ended ? stop : listen)
  }

  function listen() {
    if (!active.value || recognition) return

    phase.value = 'listening'
    interim.value = ''

    let got = false
    const rec = new SpeechRecognition()
    recognition = rec
    rec.lang = state.lang
    rec.continuous = false
    rec.interimResults = true

    rec.onresult = (event) => {
      const text = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(' ')
        .trim()

      interim.value = text

      if (event.results[event.results.length - 1].isFinal && !got) {
        got = true
        heard(text)
      }
    }

    rec.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      got = true

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        fatal('Microphone access is blocked. Allow it in your browser settings.')
      } else if (event.error === 'audio-capture') {
        fatal('No working microphone detected.')
      } else if (event.error === 'language-not-supported') {
        fatal('This browser cannot listen in that language. Switch to English or try Chrome.')
      } else {
        fatal(`Speech recognition stopped (${event.error}). Check your internet connection.`)
      }
    }

    rec.onend = () => {
      if (rec !== recognition || !active.value) return
      recognition = null
      if (got) return
      got = true

      if (interim.value) heard(interim.value)
      else noSpeech()
    }

    try {
      rec.start()
    } catch (err) {
      fatal(`Could not start listening: ${err.message}`)
    }
  }

  function start() {
    if (active.value || !conversationSupported) return

    runId += 1
    active.value = true
    log.value = []
    silent = 0
    warnedNoVoice = false

    const first = greeting(lang.value)
    state = first.state
    speak(first.say, listen)
  }

  function stop() {
    runId += 1
    speakToken += 1
    active.value = false
    phase.value = 'idle'
    interim.value = ''
    clearTimeout(speakTimer)

    const rec = recognition
    recognition = null

    try {
      rec?.abort()
    } catch (err) {
      console.error(err)
    }

    synth?.cancel()
  }

  function interrupt() {
    if (!active.value || phase.value !== 'speaking') return

    speakToken += 1
    clearTimeout(speakTimer)
    synth?.cancel()
    phase.value = 'listening'
    listen()
  }

  function setLang(code) {
    if (code === lang.value) return

    lang.value = code
    saveLang(code)
    if (!active.value) return

    const rec = recognition
    recognition = null
    try {
      rec?.abort()
    } catch (err) {
      console.error(err)
    }

    silent = 0
    state = greeting(code).state
    speak(getLocale(code).t.switched, listen)
  }

  return { active, phase, interim, log, lang, khmerVoice, setLang, start, stop, interrupt }
}