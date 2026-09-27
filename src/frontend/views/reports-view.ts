import { LiteElement, css, html, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import type { Jobs, Users, WorkReport } from '../../types/index.js'
import { api } from '../api/client.js'
import { showToast } from '../helpers/toast.js'

const localDay = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels' }).format(date)
const formatDuration = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  return `${Math.floor(minutes / 60)}u ${String(minutes % 60).padStart(2, '0')}m`
}

export class ReportsView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor jobs: Jobs = {}
  @property({ type: Object, consumes: true }) accessor users: Users = {}
  @property({ type: String }) accessor from = localDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  @property({ type: String }) accessor to = localDay(new Date())
  @property({ type: String }) accessor query = ''
  @property({ type: Object }) accessor report: WorkReport | undefined
  @property({ type: Boolean }) accessor loading = false

  static styles = [css`
    :host { display:flex; flex-direction:column; width:100%; max-width:1180px; min-height:100%; gap:16px; padding:22px; box-sizing:border-box; }
    h1,h2,p { margin:0; }
    button,input { font:inherit; }
    .page-header,.panel { border:1px solid var(--app-border); border-radius:var(--app-radius-panel); background:var(--app-panel); box-shadow:var(--app-shadow-soft); }
    .page-header { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:18px 20px; }
    .heading { display:flex; align-items:center; gap:13px; min-width:0; }
    .page-icon { display:grid; place-items:center; flex:none; width:44px; height:44px; border-radius:var(--app-radius-control); background:var(--app-accent-soft); color:var(--app-accent); }
    .eyebrow { color:var(--app-accent); font-size:.72rem; font-weight:650; }
    h1 { margin-top:3px; font-size:1.65rem; font-weight:600; line-height:1.12; }
    .subtitle,.panel-heading p { margin-top:5px; color:var(--md-sys-color-on-surface-variant); font-size:.8rem; line-height:1.45; }
    .filters { display:flex; align-items:flex-end; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
    .field { display:flex; flex-direction:column; gap:5px; color:var(--md-sys-color-on-surface-variant); font-size:.68rem; font-weight:650; }
    .field input,.search input { height:42px; padding:0 11px; border:1px solid var(--app-border); border-radius:var(--app-radius-control); background:var(--app-panel-strong); color:var(--md-sys-color-on-surface); box-sizing:border-box; }
    button { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:42px; padding:0 13px; border:1px solid var(--app-border); border-radius:var(--app-radius-control); background:var(--app-panel-strong); color:inherit; font-weight:650; cursor:pointer; }
    button.primary { border-color:var(--app-accent-strong); background:var(--app-accent); color:var(--md-sys-color-on-primary); }
    button:disabled { cursor:not-allowed; opacity:.55; }
    button:focus-visible,input:focus-visible { outline:2px solid var(--app-accent); outline-offset:2px; }
    .summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
    .summary-card { display:flex; align-items:center; gap:11px; min-width:0; padding:14px; border:1px solid var(--app-border); border-radius:var(--app-radius-panel); background:var(--app-panel); }
    .summary-icon { display:grid; place-items:center; flex:none; width:38px; height:38px; border-radius:11px; background:var(--app-accent-soft); color:var(--app-accent); }
    .summary-copy { min-width:0; }
    .summary-copy span,.summary-copy strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .summary-copy span { color:var(--md-sys-color-on-surface-variant); font-size:.67rem; }
    .summary-copy strong { margin-top:3px; font-size:1rem; }
    .panel { padding:18px; }
    .panel-heading { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:13px; }
    .panel-heading h2 { font-size:1rem; }
    .search { position:relative; width:min(320px,100%); }
    .search custom-icon { position:absolute; left:12px; top:50%; width:18px; height:18px; transform:translateY(-50%); color:var(--md-sys-color-on-surface-variant); }
    .search input { width:100%; padding-left:39px; }
    .employee-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9px; }
    .employee { padding:12px; border:1px solid var(--app-border); border-radius:var(--app-radius-control); background:var(--app-panel-strong); }
    .employee strong,.employee span { display:block; }
    .employee strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.8rem; }
    .employee span { margin-top:5px; color:var(--app-accent); font-size:1rem; font-weight:700; }
    .table-head,.row { display:grid; grid-template-columns:minmax(150px,1.1fr) minmax(140px,1fr) minmax(180px,1.25fr) 100px 130px; gap:12px; align-items:center; }
    .table-head { padding:0 11px 9px; color:var(--md-sys-color-on-surface-variant); font-size:.66rem; font-weight:700; }
    .row { min-height:58px; padding:9px 11px; border-top:1px solid var(--app-border); font-size:.76rem; }
    .person,.job { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .moment small { display:block; margin-top:3px; color:var(--md-sys-color-on-surface-variant); }
    .time { text-align:right; }
    .status { display:inline-flex; width:fit-content; padding:4px 8px; border-radius:999px; background:color-mix(in srgb,var(--app-success) 12%,transparent); color:var(--app-success); font-size:.66rem; font-weight:700; }
    .status.warning { background:color-mix(in srgb,#e69a38 13%,transparent); color:#e69a38; }
    .empty { display:grid; justify-items:center; gap:8px; padding:46px 18px; color:var(--md-sys-color-on-surface-variant); text-align:center; }
    .empty custom-icon { width:32px; height:32px; color:var(--app-accent); }
    @media(max-width:900px) { .page-header { align-items:stretch; flex-direction:column; } .filters { justify-content:flex-start; } .summary { grid-template-columns:repeat(2,minmax(0,1fr)); } .employee-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .table-head { display:none; } .row { grid-template-columns:minmax(0,1fr) auto; gap:5px 12px; padding:13px 10px; } .person { font-weight:700; } .job { grid-column:1; } .moment { grid-column:1; color:var(--md-sys-color-on-surface-variant); } .time { grid-column:2; grid-row:1; } .status { grid-column:2; grid-row:2 / span 2; justify-self:end; } }
    @media(max-width:620px) { :host { padding:12px; } .page-header,.panel { padding:14px; } .page-icon { display:none; } .filters { display:grid; grid-template-columns:1fr 1fr; } .filters button { width:100%; } .summary,.employee-grid { grid-template-columns:1fr; } .panel-heading { align-items:stretch; flex-direction:column; } .search { width:100%; } }
    @media print { :host { max-width:none; padding:0; color:#111; } .page-header,.panel,.summary-card { border-color:#ddd; box-shadow:none; background:#fff; } .filters,.search,.employee-panel { display:none; } .table-head { display:grid; } .row { grid-template-columns:minmax(150px,1.1fr) minmax(140px,1fr) minmax(180px,1.25fr) 100px 130px; } }
  `]

  connectedCallback() { super.connectedCallback(); void this.load() }

  async load() {
    if (!this.from || !this.to || this.from > this.to) return showToast('Kies een geldige periode.')
    this.loading = true
    try {
      const end = new Date(`${this.to}T23:59:59.999`)
      this.report = await api.getHoursReport(new Date(`${this.from}T00:00:00`).toISOString(), end.toISOString())
    } catch (error) {
      console.error(error)
      showToast('Rapport kon niet geladen worden.')
    } finally { this.loading = false }
  }

  get filteredRows() {
    const query = this.query.trim().toLocaleLowerCase('nl')
    const rows = this.report?.rows || []
    if (!query) return rows
    return rows.filter((row) => `${this.users[row.userId]?.name || ''} ${this.users[row.userId]?.email || ''} ${this.jobs[row.jobId]?.name || ''}`.toLocaleLowerCase('nl').includes(query))
  }

  get totals() {
    const totals = new Map<string, number>()
    for (const row of this.filteredRows) totals.set(row.userId, (totals.get(row.userId) || 0) + row.duration)
    return [...totals.entries()].sort((a, b) => b[1] - a[1])
  }

  exportCsv() {
    const header = ['Medewerker', 'Job', 'Check-in', 'Checkout', 'Duur uren', 'Afwijking']
    const rows = this.filteredRows.map((row) => [this.users[row.userId]?.name || row.userId, this.jobs[row.jobId]?.name || row.jobId, new Date(row.checkin).toLocaleString('nl-BE'), row.checkout ? new Date(row.checkout).toLocaleString('nl-BE') : 'Open', (row.duration / 3_600_000).toFixed(2), row.unusual ? 'Meer dan 12u' : row.future ? 'Toekomstige tijd' : ''])
    const csv = [header, ...rows].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `keepit-uren-${this.from}-${this.to}.csv`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 500)
  }

  render() {
    const rows = this.filteredRows
    const totalDuration = rows.reduce((sum, row) => sum + row.duration, 0)
    const warnings = rows.filter((row) => row.unusual || row.future).length
    return html`
      <header class="page-header"><div class="heading"><span class="page-icon"><custom-icon icon="analytics"></custom-icon></span><div><span class="eyebrow">Controlecentrum</span><h1>Urenrapport</h1><p class="subtitle">Controleer prestaties, afwijkingen en totalen per medewerker.</p></div></div><div class="filters"><label class="field">Van<input type="date" .value=${this.from} @input=${(event:Event)=>(this.from=(event.target as HTMLInputElement).value)} /></label><label class="field">Tot<input type="date" .value=${this.to} @input=${(event:Event)=>(this.to=(event.target as HTMLInputElement).value)} /></label><button class="primary" ?disabled=${this.loading} @click=${()=>this.load()}><custom-icon icon="refresh"></custom-icon>${this.loading?'Laden…':'Bijwerken'}</button><button ?disabled=${!rows.length} @click=${()=>this.exportCsv()}><custom-icon icon="download"></custom-icon>CSV</button><button ?disabled=${!rows.length} @click=${()=>window.print()}><custom-icon icon="print"></custom-icon>Afdrukken</button></div></header>
      <section class="summary" aria-label="Rapportsamenvatting"><article class="summary-card"><span class="summary-icon"><custom-icon icon="schedule"></custom-icon></span><div class="summary-copy"><span>Totaal geregistreerd</span><strong>${formatDuration(totalDuration)}</strong></div></article><article class="summary-card"><span class="summary-icon"><custom-icon icon="group"></custom-icon></span><div class="summary-copy"><span>Medewerkers</span><strong>${this.totals.length}</strong></div></article><article class="summary-card"><span class="summary-icon"><custom-icon icon="work"></custom-icon></span><div class="summary-copy"><span>Registraties</span><strong>${rows.length}</strong></div></article><article class="summary-card"><span class="summary-icon"><custom-icon icon="warning"></custom-icon></span><div class="summary-copy"><span>Te controleren</span><strong>${warnings}</strong></div></article></section>
      <section class="panel employee-panel"><div class="panel-heading"><div><h2>Per medewerker</h2><p>Totalen binnen de gekozen periode en huidige zoekfilter.</p></div></div>${this.totals.length?html`<div class="employee-grid">${this.totals.map(([id,total])=>html`<article class="employee"><strong>${this.users[id]?.name||this.users[id]?.email||id}</strong><span>${formatDuration(total)}</span></article>`)}</div>`:html`<div class="empty">Geen medewerkers in deze selectie.</div>`}</section>
      <section class="panel" aria-busy=${this.loading}><div class="panel-heading"><div><h2>Registraties</h2><p>${rows.length} ${rows.length===1?'registratie':'registraties'} gevonden.</p></div><label class="search"><custom-icon icon="search"></custom-icon><input type="search" aria-label="Rapport doorzoeken" placeholder="Zoek medewerker of job…" .value=${this.query} @input=${(event:Event)=>(this.query=(event.target as HTMLInputElement).value)} /></label></div>${this.loading?html`<div class="empty"><custom-icon icon="progress_activity"></custom-icon>Rapport laden…</div>`:rows.length?html`<div class="table-head"><span>Medewerker</span><span>Job</span><span>Moment</span><span>Duur</span><span>Status</span></div>${rows.map(row=>html`<article class="row"><span class="person">${this.users[row.userId]?.name||row.userId}</span><span class="job">${this.jobs[row.jobId]?.name||'Onbekende job'}</span><span class="moment">${new Date(row.checkin).toLocaleDateString('nl-BE')}<small>${new Date(row.checkin).toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'})}–${row.checkout?new Date(row.checkout).toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'}):'open'}</small></span><strong class="time">${formatDuration(row.duration)}</strong><span class="status ${row.unusual||row.future?'warning':''}">${row.unusual?'Meer dan 12u':row.future?'Toekomstige tijd':'Normaal'}</span></article>`)}`:html`<div class="empty"><custom-icon icon="event_busy"></custom-icon><strong>Geen uren gevonden</strong><span>Pas de periode of zoekopdracht aan.</span></div>`}</section>
    `
  }
}

customElements.define('reports-view', ReportsView)
