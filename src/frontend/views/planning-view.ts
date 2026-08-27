import { LiteElement, css, html, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { api } from '../api/client.js'
import { confirmAction } from '../helpers/confirmation.js'
import { showToast } from '../helpers/toast.js'
import { findPlanningConflicts } from '../helpers/planning-conflicts.js'
import { setUnsavedChanges } from '../helpers/unsaved-changes.js'
import type { Job, Jobs, PlanningEntry, User, Users } from '../../types/index.js'

const dateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const monthGrid = (month: Date): Date[] => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

const timeValue = (iso: string) =>
  new Intl.DateTimeFormat('nl-BE', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

const euroValue = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' })

export class PlanningView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor jobs: Jobs = {}
  @property({ type: Object, consumes: true }) accessor users: Users = {}
  @property({ type: Object }) accessor visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  @property({ type: Array }) accessor entries: PlanningEntry[] = []
  @property({ type: Boolean }) accessor loading = true
  @property({ type: Boolean }) accessor saving = false
  @property({ type: Boolean }) accessor editorOpen = false
  @property({ type: String }) accessor editingId = ''
  @property({ type: String }) accessor selectedDate = dateKey(new Date())
  @property({ type: String }) accessor selectedJob = ''
  @property({ type: Array }) accessor selectedUsers: string[] = []
  @property({ type: String }) accessor startTime = '08:00'
  @property({ type: String }) accessor endTime = '16:30'
  @property({ type: String }) accessor notes = ''
  @property({ type: String }) accessor error = ''
  editorBaseline = ''

  draftSignature(){return JSON.stringify([this.selectedDate,this.selectedJob,[...this.selectedUsers].sort(),this.startTime,this.endTime,this.notes])}
  get editorDirty(){return this.editorOpen&&Boolean(this.editorBaseline)&&this.draftSignature()!==this.editorBaseline}
  onChange(){queueMicrotask(()=>setUnsavedChanges('planning',this.editorDirty))}

  closeEditorOnNavigation = () => {
    const path = (location.hash.split('!/')[1] || 'home').split('?')[0]
    if (path !== 'planning') {
      this.editorOpen = false
      this.editingId = ''
      this.requestRender()
    }
  }

  connectedCallback() {
    super.connectedCallback()
    void this.loadEntries()
  }

  disconnectedCallback() {
    this.editorOpen = false
    setUnsavedChanges('planning',false)
    super.disconnectedCallback()
  }

  get days() {
    return monthGrid(this.visibleMonth)
  }

  get monthLabel() {
    const label = new Intl.DateTimeFormat('nl-BE', { month: 'long', year: 'numeric' }).format(this.visibleMonth)
    return label.charAt(0).toUpperCase() + label.slice(1)
  }

  get upcoming() {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return this.entries.filter((entry) => new Date(entry.end) >= now).slice(0, 6)
  }

  entriesForDay(day: Date) {
    const key = dateKey(day)
    return this.entries.filter((entry) => dateKey(new Date(entry.start)) === key)
  }

  jobFor(entry: PlanningEntry): Job | undefined {
    return this.jobs?.[entry.jobId]
  }

  userFor(id: string): User | undefined {
    return this.users?.[id]
  }

  get selectedJobMaterials() {
    return this.jobs?.[this.selectedJob]?.materials || []
  }

  get draftInterval() {
    return {
      jobId: this.selectedJob,
      userIds: this.selectedUsers,
      start: new Date(`${this.selectedDate}T${this.startTime}:00`).toISOString(),
      end: new Date(`${this.selectedDate}T${this.endTime}:00`).toISOString()
    }
  }

  get planningConflicts() {
    try { return findPlanningConflicts(this.entries, this.draftInterval, this.editingId) }
    catch { return [] }
  }

  materialLabel(material: NonNullable<Job['materials']>[number]) {
    if (material.kind === 'small-materials') {
      const amount = Number(material.smallMaterialAmount ?? material.unitPrice)
      return {
        name: 'Klein materiaal',
        detail: Number.isFinite(amount) && amount > 0 ? `Vaste toeslag · ${euroValue.format(amount)}` : 'Vaste toeslag'
      }
    }

    const quantity = Number.isFinite(Number(material.quantity)) ? Number(material.quantity) : 1
    const detail = [quantity, material.unit || 'st.'].join(' ')
    return { name: material.name, detail }
  }

  async loadEntries() {
    this.loading = true
    this.error = ''
    try {
      const days = this.days
      const from = new Date(days[0])
      from.setHours(0, 0, 0, 0)
      const to = new Date(days[days.length - 1])
      to.setDate(to.getDate() + 1)
      to.setHours(0, 0, 0, 0)
      this.entries = await api.getPlanning(from.toISOString(), to.toISOString())
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Planning kon niet geladen worden.'
    } finally {
      this.loading = false
    }
  }

  changeMonth(offset: number) {
    this.visibleMonth = new Date(this.visibleMonth.getFullYear(), this.visibleMonth.getMonth() + offset, 1)
    void this.loadEntries()
  }

  goToday() {
    const today = new Date()
    this.visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    void this.loadEntries()
  }

  openNew(day = new Date()) {
    this.editingId = ''
    this.selectedDate = dateKey(day)
    this.selectedJob = Object.keys(this.jobs || {}).find((id) => this.jobs[id].status !== 'completed') || ''
    this.selectedUsers = []
    this.startTime = '08:00'
    this.endTime = '16:30'
    this.notes = ''
    this.error = ''
    this.editorOpen = true
    this.editorBaseline = this.draftSignature()
  }

  openEntry(entry: PlanningEntry, event?: Event) {
    event?.stopPropagation()
    const start = new Date(entry.start)
    const end = new Date(entry.end)
    this.editingId = entry.id
    this.selectedDate = dateKey(start)
    this.selectedJob = entry.jobId
    this.selectedUsers = [...entry.userIds]
    this.startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
    this.endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
    this.notes = entry.notes || ''
    this.error = ''
    this.editorOpen = true
    this.editorBaseline = this.draftSignature()
  }

  toggleUser(id: string) {
    this.selectedUsers = this.selectedUsers.includes(id)
      ? this.selectedUsers.filter((userId) => userId !== id)
      : [...this.selectedUsers, id]
  }

  async save() {
    if (!this.selectedJob || this.selectedUsers.length === 0) {
      this.error = 'Kies een job en minstens één medewerker.'
      return
    }

    const start = new Date(`${this.selectedDate}T${this.startTime}:00`)
    const end = new Date(`${this.selectedDate}T${this.endTime}:00`)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      this.error = 'Controleer de begin- en eindtijd.'
      return
    }

    this.saving = true
    this.error = ''
    const input = {
      jobId: this.selectedJob,
      userIds: this.selectedUsers,
      start: start.toISOString(),
      end: end.toISOString(),
      notes: this.notes
    }
    try {
      if (this.planningConflicts.length && !(await confirmAction({
        title: 'Planning bevat conflicten',
        message: `${this.planningConflicts.length} conflict(en) gevonden. Toch bewaren?`,
        confirmLabel: 'Toch bewaren'
      }))) return
      if (this.editingId) await api.updatePlanning(this.editingId, input)
      else await api.createPlanning(input)
      this.editorOpen = false
      setUnsavedChanges('planning',false)
      await this.loadEntries()
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Planning kon niet bewaard worden.'
    } finally {
      this.saving = false
    }
  }

  async removePlanning() {
    if (!this.editingId || !(await confirmAction({ title: 'Planning verwijderen?', message: 'De werknemers zien deze planning daarna niet meer.', confirmLabel: 'Planning verwijderen' }))) return
    this.saving = true
    try {
      await api.deletePlanning(this.editingId)
      this.editorOpen = false
      setUnsavedChanges('planning',false)
      await this.loadEntries()
      showToast('Planning verwijderd.')
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Planning kon niet verwijderd worden.'
    } finally {
      this.saving = false
    }
  }

  static styles = [css`
    :host { display:flex; flex-direction:column; width:100%; min-height:100%; gap:16px; padding:22px; box-sizing:border-box; }
    h1,h2,h3,p { margin:0; }
    button,input,select,textarea { font:inherit; }
    button { cursor:pointer; color:inherit; }
    .page-header { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:20px 22px; border:1px solid var(--app-border); border-radius:var(--app-radius-panel); background:var(--app-panel); box-shadow:var(--app-shadow-soft); }
    .heading { display:flex; align-items:center; gap:15px; }
    .heading-icon { display:grid; place-items:center; width:46px; height:46px; flex:none; border-radius:var(--app-radius-control); color:var(--app-accent); background:var(--app-accent-soft); --custom-icon-color:currentColor; --custom-icon-size:24px; }
    .eyebrow { color:var(--app-accent); font-size:.72rem; font-weight:500; letter-spacing:0; }
    h1 { margin-top:3px; font-size:1.75rem; font-weight:600; line-height:1.2; letter-spacing:0; }
    .subtitle { margin-top:6px; color:var(--md-sys-color-on-surface-variant); font-size:.88rem; }
    .primary { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 16px; border:1px solid var(--app-accent-strong); border-radius:var(--app-radius-control); background:var(--app-accent); color:var(--md-sys-color-on-primary); font-weight:600; }
    .primary custom-icon { --custom-icon-color:currentColor; --custom-icon-size:19px; }
    .workspace { display:grid; grid-template-columns:minmax(0,1fr) 290px; gap:16px; align-items:start; }
    .calendar-panel,.upcoming-panel { overflow:hidden; border:1px solid var(--app-border); border-radius:var(--app-radius-panel); background:var(--app-panel); box-shadow:var(--app-shadow-soft); }
    .calendar-toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; border-bottom:1px solid var(--app-border); }
    .month-actions { display:flex; align-items:center; gap:6px; }
    .icon-button,.today { min-height:38px; border:1px solid var(--app-border); border-radius:10px; background:var(--app-panel-strong); }
    .icon-button { display:grid; place-items:center; width:38px; padding:0; }
    .icon-button custom-icon { --custom-icon-size:20px; --custom-icon-color:currentColor; }
    .today { padding:0 12px; font-size:.8rem; font-weight:500; }
    .month-title { font-size:1.05rem; }
    .weekdays,.calendar-grid { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); }
    .weekdays span { padding:9px 8px; color:var(--md-sys-color-on-surface-variant); font-size:.68rem; font-weight:500; text-align:center; border-bottom:1px solid var(--app-border); }
    .day { position:relative; min-width:0; min-height:118px; padding:8px; border:0; border-right:1px solid var(--app-border); border-bottom:1px solid var(--app-border); background:transparent; text-align:left; cursor:pointer; }
    .day:nth-child(7n) { border-right:0; }
    .day:hover { background:var(--app-accent-soft); }
    .day.outside { color:color-mix(in srgb,var(--md-sys-color-on-surface-variant) 52%,transparent 48%); background:color-mix(in srgb,var(--app-panel) 75%,transparent 25%); }
    .day-number { display:grid; place-items:center; width:26px; height:26px; margin-bottom:5px; border-radius:999px; font-size:.76rem; font-weight:550; }
    .day.today-day .day-number { background:var(--app-accent); color:var(--md-sys-color-on-primary); }
    .day-entries { display:flex; flex-direction:column; gap:4px; }
    .entry-chip { display:block; width:100%; min-width:0; padding:5px 6px; overflow:hidden; border:1px solid color-mix(in srgb,var(--app-accent) 24%,var(--app-border) 76%); border-radius:7px; background:var(--app-accent-soft); color:var(--md-sys-color-on-surface); font-size:.67rem; font-weight:500; line-height:1.15; text-overflow:ellipsis; white-space:nowrap; }
    .more { padding-left:5px; color:var(--md-sys-color-on-surface-variant); font-size:.65rem; font-weight:500; }
    .upcoming-head { padding:17px; border-bottom:1px solid var(--app-border); }
    .upcoming-head h2 { font-size:1rem; }
    .upcoming-head p { margin-top:4px; color:var(--md-sys-color-on-surface-variant); font-size:.76rem; }
    .upcoming-list { display:flex; flex-direction:column; padding:8px; gap:5px; }
    .upcoming-item { display:grid; grid-template-columns:42px minmax(0,1fr); gap:10px; align-items:center; width:100%; padding:10px; border:0; border-radius:12px; background:transparent; text-align:left; }
    .upcoming-item:hover { background:var(--app-accent-soft); }
    .date-badge { display:flex; flex-direction:column; align-items:center; padding:6px 3px; border-radius:10px; background:var(--app-panel-strong); border:1px solid var(--app-border); }
    .date-badge strong { font-size:1rem; }
    .date-badge span { color:var(--app-accent); font-size:.58rem; font-weight:550; }
    .upcoming-copy { min-width:0; }
    .upcoming-copy strong,.upcoming-copy span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .upcoming-copy strong { font-size:.8rem; }
    .upcoming-copy span { margin-top:3px; color:var(--md-sys-color-on-surface-variant); font-size:.68rem; }
    .empty { padding:28px 16px; color:var(--md-sys-color-on-surface-variant); font-size:.8rem; text-align:center; }
    .loading,.page-error { padding:12px 16px; border-radius:12px; font-size:.8rem; }
    .loading { color:var(--md-sys-color-on-surface-variant); }
    .page-error,.form-error { color:var(--md-sys-color-error); background:color-mix(in srgb,var(--md-sys-color-error) 10%,transparent 90%); }
    .scrim { position:fixed; inset:0; z-index:30; background:rgba(10,8,8,.58); }
    .editor { position:fixed; isolation:isolate; z-index:31; top:0; right:0; bottom:0; display:flex; flex-direction:column; width:min(440px,100vw); background:var(--md-sys-color-background); border-left:1px solid var(--app-border); box-shadow:-24px 0 60px rgba(0,0,0,.22); }
    .editor-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:20px; border-bottom:1px solid var(--app-border); }
    .editor-head h2 { font-size:1.18rem; }
    .editor-body { display:flex; flex:1; flex-direction:column; gap:17px; overflow:auto; padding:20px; }
    label,.field-group { display:flex; flex-direction:column; gap:7px; color:var(--md-sys-color-on-surface-variant); font-size:.78rem; font-weight:500; }
    input,select,textarea { width:100%; box-sizing:border-box; border:1px solid var(--app-border); border-radius:11px; background:var(--app-panel); color:var(--md-sys-color-on-surface); }
    input,select { height:44px; padding:0 12px; }
    textarea { min-height:90px; padding:11px 12px; resize:vertical; }
    .time-row { display:grid; grid-template-columns:1fr 1fr; gap:11px; }
    .date-field { grid-column:1 / -1; }
    .field-group-title { display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:10px; }
    .selection-count { padding:3px 8px; border-radius:999px; background:var(--app-panel-strong); color:var(--md-sys-color-on-surface-variant); font-size:.65rem; font-weight:500; }
    .selection-count.active { background:var(--app-accent-soft); color:var(--app-accent); }
    .job-materials { display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid var(--app-border); border-radius:12px; background:var(--app-panel); }
    .job-materials-head { display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--md-sys-color-on-surface); }
    .job-materials-head strong { font-size:.78rem; }
    .job-materials-list { display:flex; flex-direction:column; gap:5px; margin:0; padding:0; list-style:none; }
    .job-materials-list li { display:flex; align-items:baseline; justify-content:space-between; gap:12px; color:var(--md-sys-color-on-surface); font-size:.73rem; }
    .job-materials-list li span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .job-materials-list li span:last-child { flex:none; color:var(--md-sys-color-on-surface-variant); font-size:.67rem; }
    .job-materials-empty { color:var(--md-sys-color-on-surface-variant); font-size:.7rem; font-weight:500; }
    .employee-list { display:flex; flex-direction:column; gap:6px; }
    .employee { position:relative; display:grid; grid-template-columns:36px minmax(0,1fr) 22px; align-items:center; gap:11px; min-height:58px; padding:8px 12px; overflow:hidden; border:1px solid var(--app-border); border-radius:12px; background:var(--app-panel); color:var(--md-sys-color-on-surface); cursor:pointer; }
    .employee::before { content:''; position:absolute; inset:0 auto 0 0; width:3px; background:transparent; }
    .employee:hover { border-color:color-mix(in srgb,var(--app-accent) 34%,var(--app-border) 66%); }
    .employee.selected { border-color:color-mix(in srgb,var(--app-accent) 62%,var(--app-border) 38%); background:color-mix(in srgb,var(--app-accent) 10%,var(--app-panel) 90%); }
    .employee.selected::before { background:var(--app-accent); }
    .employee input { grid-column:3; grid-row:1; width:19px; height:19px; margin:0; justify-self:end; accent-color:var(--app-accent); }
    .avatar { grid-column:1; grid-row:1; display:grid; place-items:center; width:36px; height:36px; border-radius:10px; background:var(--app-accent-soft); color:var(--app-accent); font-weight:600; }
    .employee-copy { min-width:0; }
    .employee-copy strong,.employee-copy span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .employee-copy strong { font-size:.78rem; }
    .employee-copy span { margin-top:3px; color:var(--md-sys-color-on-surface-variant); font-size:.68rem; font-weight:500; }
    .form-error { padding:10px 12px; border-radius:10px; font-size:.75rem; }
    .conflicts { display:flex; flex-direction:column; gap:7px; padding:11px 12px; border:1px solid color-mix(in srgb,#f0a13a 35%,var(--app-border)); border-radius:var(--app-radius-control); background:color-mix(in srgb,#f0a13a 10%,transparent); }
    .conflicts strong { color:#e69a38; font-size:.76rem; }
    .conflicts span { color:var(--md-sys-color-on-surface-variant); font-size:.7rem; line-height:1.35; }
    .editor-actions { display:flex; align-items:center; justify-content:flex-end; gap:9px; padding:15px 20px; border-top:1px solid var(--app-border); }
    .secondary,.danger { min-height:42px; padding:0 14px; border:1px solid var(--app-border); border-radius:var(--app-radius-control); background:var(--app-panel); font-weight:500; }
    .danger { margin-right:auto; color:var(--md-sys-color-error); }
    button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible { outline:none; box-shadow:0 0 0 3px color-mix(in srgb,var(--app-accent) 23%,transparent 77%); }
    @media(max-width:1050px) { .workspace { grid-template-columns:1fr; } .upcoming-panel { display:none; } }
    @media(max-width:720px) {
      :host { padding:10px; gap:10px; }
      .page-header { padding:16px; border-radius:var(--app-radius-panel); }
      .heading-icon { display:none; }
      .page-header > .primary { width:44px; padding:0; }
      .page-header > .primary span { display:none; }
      .calendar-panel { border-radius:var(--app-radius-panel); }
      .calendar-toolbar { padding:11px; }
      .month-title { font-size:.92rem; }
      .today { display:none; }
      .weekdays span { padding:7px 2px; font-size:.58rem; }
      .day { min-height:76px; padding:4px 3px; }
      .day-number { width:22px; height:22px; margin:0 auto 3px; font-size:.67rem; }
      .entry-chip { padding:4px 3px; border:0; border-radius:5px; font-size:.57rem; text-align:center; }
      .more { display:none; }
      .editor { top:auto; width:100%; max-height:92vh; border-left:0; border-top:1px solid var(--app-border); border-radius:22px 22px 0 0; }
      .editor-head,.editor-body { padding:16px; }
      .editor-actions { padding:12px 16px max(12px,env(safe-area-inset-bottom)); }
      .editor input,.editor select,.editor textarea { font-size:16px; }
    }
  `]

  renderEntry(entry: PlanningEntry) {
    const job = this.jobFor(entry)
    return html`<button class="entry-chip" title=${`${timeValue(entry.start)} · ${job?.name || 'Onbekende job'}`} @click=${(event: Event) => this.openEntry(entry, event)}>${timeValue(entry.start)} ${job?.name || 'Job'}</button>`
  }

  renderEditor() {
    if (!this.editorOpen) return ''
    const users = Object.entries(this.users || {}).sort(([, a], [, b]) => (a.name || a.email).localeCompare(b.name || b.email, 'nl'))
    const jobs = Object.entries(this.jobs || {}).filter(([, job]) => job.status !== 'completed' || job === this.jobs[this.selectedJob])
    return html`
      <div class="scrim" @click=${() => (this.editorOpen = false)}></div>
      <aside class="editor" role="dialog" aria-modal="true" aria-label="Planning bewerken">
        <header class="editor-head">
          <div><span class="eyebrow">Werkplanning</span><h2>${this.editingId ? 'Planning aanpassen' : 'Nieuwe planning'}</h2></div>
          <button class="icon-button" aria-label="Sluiten" @click=${() => (this.editorOpen = false)}><custom-icon icon="close"></custom-icon></button>
        </header>
        <div class="editor-body">
          <label>Job
            <select .value=${this.selectedJob} @change=${(event: Event) => (this.selectedJob = (event.target as HTMLSelectElement).value)}>
              <option value="">Kies een job</option>
              ${jobs.map(([id, job]) => html`<option value=${id} ?selected=${id === this.selectedJob}>${job.name}</option>`)}
            </select>
          </label>
          ${this.selectedJob
            ? html`<section class="job-materials" aria-label="Materiaal voor deze job">
                <div class="job-materials-head">
                  <strong>Materiaal meenemen</strong>
                  <span class="selection-count ${this.selectedJobMaterials.length ? 'active' : ''}">
                    ${this.selectedJobMaterials.length} ${this.selectedJobMaterials.length === 1 ? 'regel' : 'regels'}
                  </span>
                </div>
                ${this.selectedJobMaterials.length
                  ? html`<ul class="job-materials-list">
                      ${this.selectedJobMaterials.map((material) => {
                        const label = this.materialLabel(material)
                        return html`<li><span>${label.name}</span><span>${label.detail}</span></li>`
                      })}
                    </ul>`
                  : html`<span class="job-materials-empty">Geen materiaal aan deze job gekoppeld.</span>`}
              </section>`
            : ''}
          <div class="time-row">
            <label class="date-field">Datum<input type="date" .value=${this.selectedDate} @input=${(event: Event) => (this.selectedDate = (event.target as HTMLInputElement).value)} /></label>
            <label>Van<input type="time" .value=${this.startTime} @input=${(event: Event) => (this.startTime = (event.target as HTMLInputElement).value)} /></label>
            <label>Tot<input type="time" .value=${this.endTime} @input=${(event: Event) => (this.endTime = (event.target as HTMLInputElement).value)} /></label>
          </div>
          ${this.planningConflicts.length ? html`<div class="conflicts" role="alert"><strong>Controleer deze planning</strong>${this.planningConflicts.map((conflict) => html`<span>${conflict.userIds.map((id) => this.userFor(id)?.name || this.userFor(id)?.email || 'Medewerker').join(', ')}: ${conflict.kind === 'overlap' ? 'overlapt met' : 'minder dan 30 min reistijd na/voor'} ${this.jobFor(conflict.entry)?.name || 'een andere job'} (${timeValue(conflict.entry.start)}–${timeValue(conflict.entry.end)}).</span>`)}</div>` : ''}
          <div class="field-group">
            <div class="field-group-title"><span>Medewerkers</span><span class="selection-count ${this.selectedUsers.length ? 'active' : ''}">${this.selectedUsers.length} geselecteerd</span></div>
            <div class="employee-list">
              ${users.map(([id, user]) => html`<label class="employee ${this.selectedUsers.includes(id) ? 'selected' : ''}">
                <span class="avatar">${(user.name || user.email || '?').charAt(0).toUpperCase()}</span>
                <span class="employee-copy"><strong>${user.name || user.email}</strong><span>${user.email || 'Medewerker'}</span></span>
                <input type="checkbox" aria-label=${`${user.name || user.email} selecteren`} .checked=${this.selectedUsers.includes(id)} @change=${() => this.toggleUser(id)} />
              </label>`)}
            </div>
          </div>
          <label>Notitie (optioneel)<textarea placeholder="Materiaal meenemen, toegang, contactpersoon…" .value=${this.notes} @input=${(event: Event) => (this.notes = (event.target as HTMLTextAreaElement).value)}></textarea></label>
          ${this.error ? html`<div class="form-error">${this.error}</div>` : ''}
        </div>
        <footer class="editor-actions">
          ${this.editingId ? html`<button class="danger" ?disabled=${this.saving} @click=${() => this.removePlanning()}>Verwijderen</button>` : ''}
          <button class="secondary" ?disabled=${this.saving} @click=${() => (this.editorOpen = false)}>Annuleren</button>
          <button class="primary" ?disabled=${this.saving} @click=${() => this.save()}>${this.saving ? 'Bewaren…' : 'Bewaren'}</button>
        </footer>
      </aside>`
  }

  render() {
    const today = dateKey(new Date())
    return html`
      <header class="page-header">
        <div class="heading"><span class="heading-icon"><custom-icon icon="calendar_month"></custom-icon></span><div><span class="eyebrow">Teamoverzicht</span><h1>Planning</h1><p class="subtitle">Plan jobs en medewerkers in één overzicht.</p></div></div>
        <button class="primary" @click=${() => this.openNew()}><custom-icon icon="add"></custom-icon><span>Nieuwe planning</span></button>
      </header>
      ${this.error && !this.editorOpen ? html`<div class="page-error">${this.error}</div>` : ''}
      <section class="workspace">
        <div class="calendar-panel">
          <header class="calendar-toolbar"><h2 class="month-title">${this.monthLabel}</h2><div class="month-actions"><button class="today" @click=${() => this.goToday()}>Vandaag</button><button class="icon-button" aria-label="Vorige maand" @click=${() => this.changeMonth(-1)}><custom-icon icon="chevron_left"></custom-icon></button><button class="icon-button" aria-label="Volgende maand" @click=${() => this.changeMonth(1)}><custom-icon icon="chevron_right"></custom-icon></button></div></header>
          <div class="weekdays">${['Ma','Di','Wo','Do','Vr','Za','Zo'].map((day) => html`<span>${day}</span>`)}</div>
          ${this.loading ? html`<div class="loading">Planning laden…</div>` : html`<div class="calendar-grid">${this.days.map((day) => {
            const entries = this.entriesForDay(day)
            return html`<div role="button" tabindex="0" class="day ${day.getMonth() !== this.visibleMonth.getMonth() ? 'outside' : ''} ${dateKey(day) === today ? 'today-day' : ''}" @click=${() => this.openNew(day)} @keydown=${(event: KeyboardEvent) => {
              if (event.key === 'Enter' || event.key === ' ') this.openNew(day)
            }}><span class="day-number">${day.getDate()}</span><span class="day-entries">${entries.slice(0, 3).map((entry) => this.renderEntry(entry))}${entries.length > 3 ? html`<span class="more">+${entries.length - 3} meer</span>` : ''}</span></div>`
          })}</div>`}
        </div>
        <aside class="upcoming-panel"><header class="upcoming-head"><h2>Binnenkort</h2><p>Volgende geplande jobs</p></header><div class="upcoming-list">${this.upcoming.length ? this.upcoming.map((entry) => {
          const date = new Date(entry.start)
          const job = this.jobFor(entry)
          return html`<button class="upcoming-item" @click=${(event: Event) => this.openEntry(entry, event)}><span class="date-badge"><strong>${date.getDate()}</strong><span>${new Intl.DateTimeFormat('nl-BE',{month:'short'}).format(date)}</span></span><span class="upcoming-copy"><strong>${job?.name || 'Onbekende job'}</strong><span>${timeValue(entry.start)}–${timeValue(entry.end)} · ${entry.userIds.length} ${entry.userIds.length === 1 ? 'persoon' : 'personen'}</span></span></button>`
        }) : html`<p class="empty">Nog niets gepland in deze periode.</p>`}</div></aside>
      </section>
      ${this.renderEditor()}
    `
  }
}

customElements.define('planning-view', PlanningView)
