<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { toLocalInput, formatDue } from './utils/dates'
import { useConversation, conversationSupported } from './composables/useConversation'
import { useTheme } from './composables/useTheme'
import AppIcon from './components/AppIcon.vue'

const TEAM = [
  { name: 'Member 1', role: 'Frontend', icon: 'layout' },
  { name: 'Member 2', role: 'Backend', icon: 'server' },
  { name: 'Member 3', role: 'Voice assistant', icon: 'mic' },
  { name: 'Member 4', role: 'Testing & docs', icon: 'check' },
]

const { theme, toggleTheme } = useTheme()

const API_URL = (
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/tasks/'
).replace(/\/?$/, '/')

const api = axios.create({ timeout: 8000 })

const tasks = ref([])
const loading = ref(false)
const error = ref('')
const saving = ref(false)
const showForm = ref(false)
const editingId = ref(null)
const titleInput = ref(null)

const filter = ref('all')
const search = ref('')
const sortBy = ref('newest')
const now = ref(Date.now())
const toast = ref(null)
let toastTimer = null
let clockTimer = null

const emptyForm = () => ({
  title: '',
  description: '',
  priority: 'medium',
  due_date: '',
  completed: false,
})

const form = ref(emptyForm())

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 }

const isOverdue = (task) =>
  !task.completed && task.due_date && new Date(task.due_date).getTime() < now.value

const completedCount = computed(() => tasks.value.filter((t) => t.completed).length)
const overdueCount = computed(() => tasks.value.filter(isOverdue).length)
const upcomingCount = computed(
  () => tasks.value.filter((t) => !t.completed && t.due_date).length,
)

const isToday = (task) =>
  !task.completed &&
  task.due_date &&
  new Date(task.due_date).toDateString() === new Date(now.value).toDateString()

const dueTodayCount = computed(() => tasks.value.filter(isToday).length)
const remainingCount = computed(() => tasks.value.length - completedCount.value)
const percentDone = computed(() =>
  tasks.value.length ? Math.round((completedCount.value / tasks.value.length) * 100) : 0,
)

const greeting = computed(() => {
  const hour = new Date(now.value).getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const todayLabel = computed(() =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(
    new Date(now.value),
  ),
)

const subtitle = computed(() => {
  if (!tasks.value.length) return 'Nothing planned yet. Add a task or just say it out loud.'
  if (overdueCount.value) return `${overdueCount.value} overdue and ${dueTodayCount.value} due today.`
  if (dueTodayCount.value) return `${dueTodayCount.value} due today. You can do this.`
  if (remainingCount.value === 0) return 'Everything is done. Nice work.'
  return `${remainingCount.value} tasks left. Small steps every day.`
})

const visibleTasks = computed(() => {
  const q = search.value.trim().toLowerCase()

  const list = tasks.value.filter((t) => {
    if (filter.value === 'completed' && !t.completed) return false
    if (filter.value === 'upcoming' && (t.completed || !t.due_date)) return false
    if (q && !`${t.title} ${t.description || ''}`.toLowerCase().includes(q)) return false
    return true
  })

  if (sortBy.value === 'due') {
    list.sort((a, b) => {
      if (!a.due_date) return b.due_date ? 1 : 0
      if (!b.due_date) return -1
      return new Date(a.due_date) - new Date(b.due_date)
    })
  } else if (sortBy.value === 'priority') {
    list.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  }

  return list
})

const headings = {
  all: ['All Tasks', 'Your tasks, all in one place.'],
  upcoming: ['Upcoming', 'Open tasks that have a deadline.'],
  completed: ['Completed', 'Everything you have finished.'],
}

function notify(message, type = 'info') {
  toast.value = { message, type }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 3500)
}

function apiError(err, fallback) {
  if (!err.response) return 'Could not reach Django. Make sure the backend is running.'
  const data = err.response.data
  if (data && typeof data === 'object') {
    const first = Object.entries(data)[0]
    if (first) return `${first[0]}: ${[].concat(first[1]).join(' ')}`
  }
  return fallback
}

function setFilter(name) {
  filter.value = name
  if (name === 'upcoming') sortBy.value = 'due'
}

async function loadTasks() {
  loading.value = true
  error.value = ''

  try {
    const response = await api.get(API_URL)
    tasks.value = Array.isArray(response.data)
      ? response.data
      : response.data.results || []
  } catch (err) {
    error.value = apiError(err, 'Could not load tasks.')
    console.error(err)
  } finally {
    loading.value = false
  }
}

function openAddForm() {
  editingId.value = null
  form.value = emptyForm()
  showForm.value = true
}

function openEditForm(task) {
  editingId.value = task.id

  form.value = {
    title: task.title,
    description: task.description || '',
    priority: task.priority,
    due_date: toLocalInput(task.due_date),
    completed: task.completed,
  }

  showForm.value = true
}

function closeForm() {
  showForm.value = false
}

async function saveTask() {
  if (!form.value.title.trim()) {
    notify('Please enter a task title.', 'error')
    return
  }

  const payload = {
    ...form.value,
    title: form.value.title.trim(),
    due_date: form.value.due_date
      ? new Date(form.value.due_date).toISOString()
      : null,
  }

  saving.value = true

  try {
    if (editingId.value !== null) {
      const { data } = await api.put(`${API_URL}${editingId.value}/`, payload)
      tasks.value = tasks.value.map((t) => (t.id === data.id ? data : t))
    } else {
      const { data } = await api.post(API_URL, payload)
      tasks.value = [data, ...tasks.value]
    }

    showForm.value = false
    notify('Task saved.')
  } catch (err) {
    console.error(err)
    notify(apiError(err, 'Could not save the task.'), 'error')
  } finally {
    saving.value = false
  }
}

async function toggleTask(task) {
  try {
    const { data } = await api.patch(`${API_URL}${task.id}/`, {
      completed: !task.completed,
    })
    tasks.value = tasks.value.map((t) => (t.id === data.id ? data : t))
  } catch (err) {
    console.error(err)
    notify(apiError(err, 'Could not update the task.'), 'error')
  }
}

async function deleteTask(task) {
  if (!confirm(`Delete "${task.title}"?`)) return

  try {
    await api.delete(`${API_URL}${task.id}/`)
    tasks.value = tasks.value.filter((t) => t.id !== task.id)
    notify('Task deleted.')
  } catch (err) {
    console.error(err)
    notify(apiError(err, 'Could not delete the task.'), 'error')
  }
}

async function clearCompleted() {
  if (!confirm(`Delete all ${completedCount.value} completed tasks?`)) return

  try {
    await api.delete(`${API_URL}clear-completed/`)
    tasks.value = tasks.value.filter((t) => !t.completed)
    notify('Completed tasks cleared.')
  } catch (err) {
    console.error(err)
    notify(apiError(err, 'Could not clear completed tasks.'), 'error')
  }
}

async function runVoiceAction(action) {
  try {
    if (action.type === 'create') {
      const { task } = action
      const { data } = await api.post(API_URL, {
        title: task.title.slice(0, 200),
        description: task.description,
        priority: task.priority,
        due_date: task.due ? task.due.toISOString() : null,
        completed: false,
      })
      tasks.value = [data, ...tasks.value]
      notify('Task saved.')
      return true
    }

    if (action.type === 'complete') {
      const { data } = await api.patch(`${API_URL}${action.id}/`, { completed: true })
      tasks.value = tasks.value.map((t) => (t.id === data.id ? data : t))
      return true
    }

    if (action.type === 'update') {
      const { data } = await api.patch(`${API_URL}${action.id}/`, action.changes)
      tasks.value = tasks.value.map((t) => (t.id === data.id ? data : t))
      return true
    }

    if (action.type === 'delete') {
      await api.delete(`${API_URL}${action.id}/`)
      tasks.value = tasks.value.filter((t) => t.id !== action.id)
      return true
    }
  } catch (err) {
    console.error(err)
    notify(apiError(err, 'Voice action failed.'), 'error')
  }

  return false
}

const {
  active: convActive,
  phase: convPhase,
  interim: convInterim,
  log: convLog,
  lang: convLang,
  khmerVoice,
  setLang: setConvLang,
  start: startConversation,
  stop: stopConversation,
  interrupt: interruptConversation,
} = useConversation({
  getTasks: () => tasks.value,
  runAction: runVoiceAction,
  onError: (message) => notify(message, 'error'),
})

const phaseLabels = {
  speaking: 'Speaking...',
  listening: 'Listening...',
  thinking: 'Thinking...',
  idle: '',
}

function toggleConversation() {
  if (convActive.value) {
    stopConversation()
    return
  }

  startConversation()
}

function toggleConvLang() {
  setConvLang(convLang.value === 'en-US' ? 'km-KH' : 'en-US')
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    if (convActive.value) stopConversation()
    else if (showForm.value) closeForm()
    return
  }

  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)
  const modifier = event.ctrlKey || event.metaKey || event.altKey

  if (typing || modifier || showForm.value) return

  const key = event.key.toLowerCase()

  if (convActive.value && convPhase.value === 'speaking' && event.code === 'Space') {
    event.preventDefault()
    interruptConversation()
  } else if (key === 'v') {
    event.preventDefault()
    toggleConversation()
  } else if (key === 'l') {
    event.preventDefault()
    toggleConvLang()
  } else if (key === 't') {
    event.preventDefault()
    toggleTheme()
  }
}

const logEl = ref(null)

watch(
  convLog,
  async () => {
    await nextTick()
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  },
  { deep: true },
)

watch(showForm, async (open) => {
  if (open) {
    await nextTick()
    titleInput.value?.focus()
  }
})

onMounted(() => {
  loadTasks()
  window.addEventListener('keydown', onKeydown)
  clockTimer = setInterval(() => (now.value = Date.now()), 60000)
})

onBeforeUnmount(() => {
  stopConversation()
  window.removeEventListener('keydown', onKeydown)
  clearInterval(clockTimer)
  clearTimeout(toastTimer)
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-icon"><AppIcon name="mic" :size="22" /></div>
        <div>
          <h2>VoiceTask</h2>
          <p>YOUR DAY, ORGANIZED</p>
        </div>
      </div>

      <div class="sidebar-label">WORKSPACE</div>
      <nav class="nav" aria-label="Task filters">
        <button
          class="nav-item"
          :class="{ active: filter === 'all' }"
          :aria-current="filter === 'all' ? 'page' : undefined"
          title="My Tasks"
          @click="setFilter('all')"
        >
          <AppIcon name="list" />
          <span class="nav-text">My Tasks</span>
          <span class="nav-count">{{ tasks.length }}</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: filter === 'upcoming' }"
          :aria-current="filter === 'upcoming' ? 'page' : undefined"
          title="Upcoming"
          @click="setFilter('upcoming')"
        >
          <AppIcon name="calendar" />
          <span class="nav-text">Upcoming</span>
          <span class="nav-count">{{ upcomingCount }}</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: filter === 'completed' }"
          :aria-current="filter === 'completed' ? 'page' : undefined"
          title="Completed"
          @click="setFilter('completed')"
        >
          <AppIcon name="done" />
          <span class="nav-text">Completed</span>
          <span class="nav-count">{{ completedCount }}</span>
        </button>
      </nav>

      <div class="shortcuts">
        <h4>SHORTCUTS</h4>
        <ul>
          <li><span>Talk to assistant</span><kbd>V</kbd></li>
          <li><span>Switch language</span><kbd>L</kbd></li>
          <li><span>Dark / light</span><kbd>T</kbd></li>
          <li><span>Stop</span><kbd>Esc</kbd></li>
        </ul>
      </div>

      <div class="sidebar-bottom">
        <p class="team-label">BUILT BY</p>
        <div class="team">
          <span
            v-for="member in TEAM"
            :key="member.role"
            class="team-member"
            :title="`${member.name} · ${member.role}`"
          >
            <AppIcon :name="member.icon" :size="16" />
          </span>
          <span class="team-text"><strong>Team of 4</strong>Frontend · Backend · Voice · QA</span>
        </div>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div class="page-heading">
          <p class="eyebrow"><AppIcon name="calendar" :size="14" /> {{ todayLabel.toUpperCase() }}</p>
          <h1>{{ greeting }}</h1>
          <p class="subtitle">{{ subtitle }}</p>
        </div>

        <div class="header-actions">
          <button
            type="button"
            class="icon-btn"
            :title="theme === 'dark' ? 'Switch to light mode (T)' : 'Switch to dark mode (T)'"
            :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleTheme"
          >
            <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" />
          </button>

          <button
            v-if="conversationSupported"
            type="button"
            class="btn btn-ghost lang-toggle"
            title="Assistant language (L)"
            @click="toggleConvLang"
          >
            <AppIcon name="globe" :size="16" />
            {{ convLang === 'en-US' ? 'EN · ខ្មែរ' : 'ខ្មែរ · EN' }}
          </button>

          <button
            v-if="conversationSupported"
            class="btn btn-soft talk-button"
            :class="{ live: convActive }"
            @click="toggleConversation"
          >
            <AppIcon name="mic" :size="16" />
            {{ convActive ? 'End conversation' : 'Talk to me' }}
            <kbd>V</kbd>
          </button>

          <button class="btn btn-primary" @click="openAddForm">
            <AppIcon name="plus" :size="16" /> Add Task
          </button>
        </div>
      </header>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-top">
            <div class="stat-icon purple"><AppIcon name="list" :size="18" /></div>
          </div>
          <p>Total tasks</p>
          <strong>{{ tasks.length }}</strong>
        </div>

        <div class="stat-card">
          <div class="stat-top">
            <div class="stat-icon green"><AppIcon name="done" :size="18" /></div>
            <span class="stat-note">{{ percentDone }}%</span>
          </div>
          <p>Completed</p>
          <strong>{{ completedCount }}</strong>
        </div>

        <div class="stat-card">
          <div class="stat-top">
            <div class="stat-icon orange"><AppIcon name="clock" :size="18" /></div>
            <span v-if="dueTodayCount" class="stat-note">{{ dueTodayCount }} today</span>
          </div>
          <p>Remaining</p>
          <strong>{{ remainingCount }}</strong>
        </div>

        <div class="stat-card">
          <div class="stat-top">
            <div class="stat-icon red"><AppIcon name="alert" :size="18" /></div>
          </div>
          <p>Overdue</p>
          <strong>{{ overdueCount }}</strong>
        </div>
      </div>

      <section class="tasks-section">
        <div class="section-heading">
          <div>
            <h2>{{ headings[filter][0] }}</h2>
            <p>{{ headings[filter][1] }}</p>
          </div>

          <div class="section-actions">
            <button
              v-if="completedCount > 0"
              class="btn btn-ghost btn-sm btn-danger"
              @click="clearCompleted"
            >
              <AppIcon name="trash" :size="14" /> Clear completed
            </button>
            <button class="btn btn-ghost btn-sm" :disabled="loading" @click="loadTasks">
              <AppIcon name="refresh" :size="14" /> Refresh
            </button>
          </div>
        </div>

        <div v-if="tasks.length > 0" class="progress" aria-label="Completion progress">
          <div class="progress-bar"><span :style="{ width: percentDone + '%' }"></span></div>
          <small>{{ completedCount }} of {{ tasks.length }} done</small>
        </div>

        <div v-if="tasks.length > 0" class="toolbar">
          <div class="search-box">
            <AppIcon name="search" :size="16" />
            <label class="sr-only" for="search">Search tasks</label>
            <input
              id="search"
              v-model="search"
              type="search"
              placeholder="Search tasks..."
            />
          </div>

          <label class="sr-only" for="sort">Sort tasks</label>
          <select id="sort" v-model="sortBy">
            <option value="newest">Newest first</option>
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
          </select>
        </div>

        <div v-if="loading && tasks.length === 0" class="task-list" aria-busy="true">
          <div class="skeleton"></div>
          <div class="skeleton"></div>
          <div class="skeleton"></div>
        </div>

        <div v-else-if="error" class="error-message">
          {{ error }}
          <button class="btn btn-ghost btn-sm" @click="loadTasks">
            Try again
          </button>
        </div>

        <div v-else-if="tasks.length === 0" class="empty-state">
          <div class="empty-icon"><AppIcon name="sparkles" :size="26" /></div>
          <h3>No tasks yet</h3>
          <p>Add your first task and start organizing your day.</p>
          <button class="btn btn-primary" @click="openAddForm">
            <AppIcon name="plus" :size="16" /> Create your first task
          </button>
          <p v-if="conversationSupported" class="hint">
            or press <kbd>V</kbd> and say "add a task"
          </p>
        </div>

        <div v-else-if="visibleTasks.length === 0" class="empty-state">
          <div class="empty-icon"><AppIcon name="search" :size="26" /></div>
          <h3>No matching tasks</h3>
          <p>Try another search or switch filters.</p>
        </div>

        <div v-else class="task-list">
          <article
            v-for="task in visibleTasks"
            :key="task.id"
            class="task-card"
            :class="[
              `p-${task.priority}`,
              { completed: task.completed, overdue: isOverdue(task) },
            ]"
          >
            <button
              class="check-button"
              :class="{ checked: task.completed }"
              :aria-label="task.completed ? 'Mark incomplete' : 'Mark complete'"
              :aria-pressed="task.completed"
              @click="toggleTask(task)"
            >
              <AppIcon v-if="task.completed" name="check" :size="14" />
            </button>

            <div class="task-info">
              <h3>{{ task.title }}</h3>
              <p v-if="task.description">{{ task.description }}</p>

              <div class="task-meta">
                <span class="chip priority" :class="task.priority">
                  <i class="dot"></i>{{ task.priority }}
                </span>

                <span
                  v-if="task.due_date"
                  class="chip"
                  :class="{ late: isOverdue(task), today: isToday(task) }"
                >
                  <AppIcon name="calendar" :size="12" />
                  {{ isOverdue(task) ? 'Overdue · ' : isToday(task) ? 'Today · ' : '' }}{{ formatDue(task.due_date) }}
                </span>
                <span v-else class="chip muted">No deadline</span>
              </div>
            </div>

            <div class="task-actions">
              <button
                title="Edit task"
                :aria-label="`Edit ${task.title}`"
                @click="openEditForm(task)"
              >
                <AppIcon name="edit" :size="16" />
              </button>
              <button
                title="Delete task"
                :aria-label="`Delete ${task.title}`"
                class="delete-button"
                @click="deleteTask(task)"
              >
                <AppIcon name="trash" :size="16" />
              </button>
            </div>
          </article>
        </div>
      </section>

      <footer>
        <AppIcon name="mic" :size="14" /> VoiceTask · Stay focused. One task at a time.
      </footer>
    </main>

    <section v-if="convActive" class="assistant convo-card" aria-live="polite">
      <div class="convo-head">
        <div class="orb" :class="convPhase"><AppIcon name="mic" :size="18" /></div>
        <h2>
          Voice assistant
          <small>{{ convLang === 'km-KH' ? 'ភាសាខ្មែរ' : 'English' }}</small>
        </h2>
        <span class="convo-phase" :class="convPhase">
          <span v-if="convPhase !== 'idle'" class="wave"><i></i><i></i><i></i><i></i></span>
          {{ phaseLabels[convPhase] || 'Ready' }}
        </span>
        <button type="button" class="close-button" aria-label="End conversation" @click="stopConversation">
          <AppIcon name="x" :size="16" />
        </button>
      </div>

      <ul ref="logEl" class="convo-log">
        <li v-for="(m, i) in convLog.slice(-8)" :key="i" :class="m.who">{{ m.text }}</li>
      </ul>
      <p v-if="convInterim" class="convo-interim">{{ convInterim }}</p>
      <p v-if="convLang === 'km-KH' && !khmerVoice" class="convo-warning">
        No Khmer voice in this browser: replies show on screen only. Try Microsoft Edge.
      </p>
      <div class="voice-controls">
        <button
          v-if="convPhase === 'speaking'"
          type="button"
          class="btn btn-primary"
          @click="interruptConversation"
        >
          Stop reply &amp; listen now
          <kbd>Space</kbd>
        </button>
        <p>Try “Mark [task] as done” or “Change the date on [task] to Friday.”</p>
      </div>
      <p class="voice-hint">
        {{
          convLang === 'km-KH'
            ? 'និយាយថា "បោះបង់" ដើម្បីបោះបង់ "ជម្រាបលា" ដើម្បីចប់ ឬចុច V ឬ Esc។ ចុច L ដើម្បីប្តូរភាសា។'
            : 'Say "cancel" to drop a step, "goodbye" to finish, or press V or Esc. Press L to switch language.'
        }}
      </p>
    </section>

    <div
      v-if="showForm"
      class="modal-backdrop"
      @click.self="closeForm"
    >
      <form
        class="task-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-title"
        @submit.prevent="saveTask"
      >
        <div class="modal-heading">
          <div>
            <p class="eyebrow">YOUR WORKSPACE</p>
            <h2 id="form-title">
              {{ editingId !== null ? 'Edit Task' : 'Create a Task' }}
            </h2>
          </div>

          <button
            type="button"
            class="close-button"
            aria-label="Close"
            @click="closeForm"
          >
            <AppIcon name="x" :size="16" />
          </button>
        </div>

        <label for="title">Task title *</label>
        <input
          id="title"
          ref="titleInput"
          v-model="form.title"
          placeholder="What do you need to do?"
          required
          maxlength="200"
        />

        <label for="description">Description</label>
        <textarea
          id="description"
          v-model="form.description"
          placeholder="Add some details..."
          rows="3"
        ></textarea>

        <label for="priority">Priority</label>
        <select id="priority" v-model="form.priority">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <label for="due_date">Deadline</label>
        <input
          id="due_date"
          v-model="form.due_date"
          type="datetime-local"
        />

        <label class="completed-option">
          <input v-model="form.completed" type="checkbox" />
          Mark as completed
        </label>

        <div class="form-actions">
          <button type="button" class="btn btn-ghost" @click="closeForm">
            Cancel
          </button>

          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{
              saving
                ? 'Saving...'
                : editingId !== null
                  ? 'Save Changes'
                  : 'Create Task'
            }}
          </button>
        </div>
      </form>
    </div>

    <div
      v-if="toast"
      class="toast"
      :class="toast.type"
      role="status"
      aria-live="polite"
    >
      {{ toast.message }}
    </div>
  </div>
</template>
