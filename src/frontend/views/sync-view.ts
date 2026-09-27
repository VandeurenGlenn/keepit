import { LiteElement, css, html, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import type { Jobs } from '../../types/index.js'
import { claimUnscopedOfflineActions, getOfflineActions, getUnscopedOfflineActions, retryOfflineActions, type OfflineAction } from '../helpers/offline-actions.js'
import { showToast } from '../helpers/toast.js'
import { confirmAction } from '../helpers/confirmation.js'

export class SyncView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor jobs: Jobs = {}
  @property({ type: Array }) accessor actions: OfflineAction[] = []
  @property({ type: Boolean }) accessor retrying = false
  @property({ type: Number }) accessor unscopedCount = 0

  listener = (event: Event) => {
    this.actions = (event as CustomEvent).detail?.actions || getOfflineActions()
    this.unscopedCount = getUnscopedOfflineActions().length
  }

  connectedCallback() {
    super.connectedCallback()
    this.actions = getOfflineActions()
    this.unscopedCount = getUnscopedOfflineActions().length
    window.addEventListener('keepit-sync-status', this.listener)
  }

  disconnectedCallback() {
    window.removeEventListener('keepit-sync-status', this.listener)
    super.disconnectedCallback()
  }

  async retry() {
    this.retrying = true
    try {
      await retryOfflineActions()
      this.actions = getOfflineActions()
      showToast(this.actions.length ? 'Niet alles kon synchroniseren.' : 'Alle registraties zijn gesynchroniseerd.')
    } finally { this.retrying = false }
  }

  async claimLegacy() {
    const confirmed = await confirmAction({ title: 'Oude registraties herstellen?', message: `Koppel ${this.unscopedCount} oude offline registratie(s) op dit toestel aan jouw account. Doe dit alleen als jij deze uren hebt ingevoerd.`, confirmLabel: 'Aan mij koppelen' })
    if (!confirmed) return
    const count = claimUnscopedOfflineActions()
    this.actions = getOfflineActions()
    this.unscopedCount = 0
    showToast(`${count} registratie(s) gekoppeld.`)
    await this.retry()
  }

  static styles = [css`
    :host { display:flex; flex-direction:column; width:100%; max-width:980px; min-height:100%; gap:16px; padding:22px; box-sizing:border-box; }
    h1,h2,p { margin:0; }
    .page-header,.panel,.legacy { border:1px solid var(--app-border); border-radius:var(--app-radius-panel); background:var(--app-panel); box-shadow:var(--app-shadow-soft); }
    .page-header { display:flex; align-items:center; justify-content:space-between; gap:18px; padding:18px 20px; }
    .heading { display:flex; align-items:center; gap:13px; }
    .page-icon { display:grid; place-items:center; width:44px; height:44px; flex:none; border-radius:var(--app-radius-control); background:var(--app-accent-soft); color:var(--app-accent); }
    .eyebrow { color:var(--app-accent); font-size:.72rem; font-weight:650; }
    h1 { margin-top:3px; font-size:1.65rem; font-weight:600; }
    .subtitle,.panel-head p { margin-top:5px; color:var(--md-sys-color-on-surface-variant); font-size:.8rem; line-height:1.45; }
    button { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:42px; padding:0 14px; border:1px solid var(--app-border); border-radius:var(--app-radius-control); background:var(--app-panel-strong); color:inherit; font:inherit; font-weight:650; cursor:pointer; }
    button.primary { border-color:var(--app-accent-strong); background:var(--app-accent); color:var(--md-sys-color-on-primary); }
    button:disabled { cursor:not-allowed; opacity:.55; }
    button:focus-visible { outline:2px solid var(--app-accent); outline-offset:2px; }
    .legacy { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 18px; border-color:color-mix(in srgb,#e69a38 48%,var(--app-border)); background:color-mix(in srgb,#e69a38 8%,var(--app-panel)); }
    .legacy-copy { display:flex; align-items:flex-start; gap:11px; }
    .legacy-icon { display:grid; place-items:center; width:38px; height:38px; flex:none; border-radius:11px; background:color-mix(in srgb,#e69a38 15%,transparent); color:#e69a38; }
    .legacy strong,.legacy span { display:block; }
    .legacy span { margin-top:4px; color:var(--md-sys-color-on-surface-variant); font-size:.76rem; }
    .panel { padding:18px; }
    .panel-head { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .panel-head h2 { font-size:1rem; }
    .count { color:var(--md-sys-color-on-surface-variant); font-size:.72rem; }
    .list { display:flex; flex-direction:column; gap:8px; }
    .row { display:grid; grid-template-columns:42px minmax(0,1fr) auto; gap:11px; align-items:center; padding:11px; border:1px solid var(--app-border); border-radius:var(--app-radius-control); background:var(--app-panel-strong); }
    .icon { display:grid; place-items:center; width:42px; height:42px; border-radius:var(--app-radius-control); background:var(--app-accent-soft); color:var(--app-accent); }
    .copy { min-width:0; }
    .copy strong,.copy span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .copy strong { font-size:.82rem; }
    .copy span { margin-top:4px; color:var(--md-sys-color-on-surface-variant); font-size:.7rem; }
    .state { display:inline-flex; padding:5px 8px; border-radius:999px; background:color-mix(in srgb,#e69a38 12%,transparent); color:#e69a38; font-size:.68rem; font-weight:700; }
    .state.error { background:color-mix(in srgb,var(--md-sys-color-error) 11%,transparent); color:var(--md-sys-color-error); }
    .empty { display:grid; justify-items:center; gap:8px; padding:48px 18px; color:var(--md-sys-color-on-surface-variant); text-align:center; }
    .empty custom-icon { width:36px; height:36px; color:var(--app-success); }
    .empty strong { color:var(--md-sys-color-on-surface); }
    @media(max-width:620px) { :host { padding:12px; } .page-header,.legacy { align-items:stretch; flex-direction:column; padding:14px; } .page-icon { display:none; } .page-header button,.legacy button { width:100%; } .panel { padding:14px; } .row { grid-template-columns:38px minmax(0,1fr); } .icon { width:38px; height:38px; } .state { grid-column:2; width:fit-content; } }
  `]

  render() {
    const online = navigator.onLine
    return html`
      <header class="page-header"><div class="heading"><span class="page-icon"><custom-icon icon="cloud_sync"></custom-icon></span><div><span class="eyebrow">${online?'Online':'Offline'}</span><h1>Synchronisatie</h1><p class="subtitle">Offline werkuren worden veilig bewaard en in volgorde verwerkt.</p></div></div><button class="primary" ?disabled=${this.retrying||!this.actions.length||!online} @click=${()=>this.retry()}><custom-icon icon="refresh"></custom-icon>${this.retrying?'Synchroniseren…':'Opnieuw proberen'}</button></header>
      ${this.unscopedCount?html`<section class="legacy" role="alert"><div class="legacy-copy"><span class="legacy-icon"><custom-icon icon="warning"></custom-icon></span><div><strong>Oude offline registraties gevonden</strong><span>${this.unscopedCount} registraties hebben nog geen medewerker. Controleer ze voor je ze koppelt.</span></div></div><button @click=${()=>this.claimLegacy()}>Controleren en koppelen</button></section>`:null}
      <section class="panel" aria-live="polite"><div class="panel-head"><div><h2>Wachtrij</h2><p>Registraties blijven op dit toestel staan tot de server ze bevestigt.</p></div><span class="count">${this.actions.length} wachtend</span></div>${this.actions.length?html`<div class="list">${this.actions.map(action=>html`<article class="row"><span class="icon"><custom-icon icon=${action.type==='checkin'?'login':'logout'}></custom-icon></span><div class="copy"><strong>${action.type==='checkin'?'Start':'Stop'} · ${this.jobs[action.job]?.name||'Onbekende job'}</strong><span>${new Date(action.timestamp).toLocaleString('nl-BE')} · lokaal opgeslagen ${new Date(action.createdAt).toLocaleString('nl-BE')}</span></div><span class="state ${action.lastError?'error':''}">${action.lastError?`Mislukt · poging ${action.attempts||1}`:online?'Wacht op server':'Offline bewaard'}</span></article>`)}</div>`:html`<div class="empty"><custom-icon icon="cloud_done"></custom-icon><strong>Alles is gesynchroniseerd</strong><span>Er staan geen lokale registraties meer in de wachtrij.</span></div>`}</section>
    `
  }
}

customElements.define('sync-view', SyncView)
