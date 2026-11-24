import { LiteElement, css, html, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import type { Jobs } from '../../types/index.js'
import { claimUnscopedOfflineActions, getOfflineSyncStatus, getUnscopedOfflineActions, retryOfflineActions, type OfflineAction } from '../helpers/offline-actions.js'
import { showToast } from '../helpers/toast.js'
import { confirmAction } from '../helpers/confirmation.js'

export class SyncView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor jobs: Jobs = {}
  @property({ type: Array }) accessor actions: OfflineAction[] = []
  @property({ type: Boolean }) accessor syncing = false
  @property({ type: Boolean }) accessor online = navigator.onLine
  @property({ type: Number }) accessor unscopedCount = 0

  listener = () => {
    const status = getOfflineSyncStatus()
    this.actions = status.actions
    this.syncing = status.syncing
    this.online = navigator.onLine
    this.unscopedCount = getUnscopedOfflineActions().length
  }

  connectedCallback() {
    super.connectedCallback()
    this.listener()
    window.addEventListener('keepit-sync-status', this.listener)
    window.addEventListener('online', this.listener)
    window.addEventListener('offline', this.listener)
  }

  disconnectedCallback() {
    window.removeEventListener('keepit-sync-status', this.listener)
    window.removeEventListener('online', this.listener)
    window.removeEventListener('offline', this.listener)
    super.disconnectedCallback()
  }

  async retry() {
    if (this.syncing || !this.online || !this.actions.length) return
    try {
      await retryOfflineActions()
    } catch { showToast('Synchronisatie kon niet worden gestart. Probeer opnieuw.') }
  }

  async claimLegacy() {
    const confirmed = await confirmAction({ title: 'Oude registraties herstellen?', message: `Koppel ${this.unscopedCount} oude offline registratie(s) op dit toestel aan jouw account. Doe dit alleen als jij deze uren hebt ingevoerd.`, confirmLabel: 'Aan mij koppelen' })
    if (!confirmed) return
    try {
      const count = claimUnscopedOfflineActions()
      this.listener()
      showToast(count === 1 ? '1 registratie gekoppeld.' : `${count} registraties gekoppeld.`)
      await this.retry()
    } catch { showToast('Keepit kon de oude registraties niet koppelen. Probeer opnieuw.') }
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
    .page-header,.panel,.legacy { box-shadow:none; }
    .eyebrow,.page-icon,.icon { color:var(--app-accent-label); }
    .status-card { display:grid; gap:5px; padding:14px 16px; border:1px solid var(--app-border); border-radius:var(--app-radius-panel); background:var(--app-panel); }
    .status-card.attention { border-color:color-mix(in srgb,#e69a38 45%,var(--app-border)); }
    .status-card span,.queue-error span { color:var(--md-sys-color-on-surface-variant); font-size:.8rem; line-height:1.5; }
    .list { padding:0; margin:0; list-style:none; }
    .copy strong,.copy span { white-space:normal; overflow-wrap:anywhere; }
    .queue-error { display:grid; grid-column:2/-1; gap:4px; overflow-wrap:anywhere; font-size:.8rem; }
    .count { white-space:nowrap; }
  `]

  render() {
    const first = this.actions[0]
    const blocked = Boolean(first?.lastError && this.online && !this.syncing)
    const status = !this.online ? 'Offline' : this.syncing ? 'Bezig met synchroniseren' : blocked ? 'Actie nodig' : first ? 'Wacht op synchronisatie' : 'Geen openstaande registraties'
    const date = new Intl.DateTimeFormat('nl-BE', { dateStyle:'medium', timeStyle:'short' })
    const format = (timestamp: number) => Number.isFinite(timestamp) && Number.isFinite(new Date(timestamp).getTime()) ? date.format(timestamp) : 'Tijd onbekend'
    const errorHelp = first?.failureKind === 'session' ? 'Meld je opnieuw aan met hetzelfde account en probeer opnieuw. De registratie blijft op dit toestel.'
      : first?.failureKind === 'rejected' ? 'De server heeft deze registratie geweigerd. Controleer de registratie met je beheerder voordat je opnieuw probeert.'
      : 'Probeer opnieuw wanneer Keepit bereikbaar is. Je hoeft de uren niet opnieuw in te geven.'
    return html`
      <header class="page-header">
        <div class="heading"><span class="page-icon"><custom-icon icon="cloud_sync"></custom-icon></span>
          <div><span class="eyebrow">Werkregistratie</span><h1>Synchronisatie</h1><p class="subtitle">Bekijk welke uren nog op dit toestel wachten.</p></div>
        </div>
        ${first ? html`<button type="button" class="primary" ?disabled=${this.syncing || !this.online} @click=${() => void this.retry()}>
          <custom-icon icon="refresh"></custom-icon>${this.syncing ? 'Synchroniseren…' : 'Synchroniseer nu'}
        </button>` : ''}
      </header>

      <section class="status-card ${blocked || !this.online ? 'attention' : ''}" role="status">
        <strong>${status}</strong>
        <span>${!this.online ? 'Keepit probeert opnieuw zodra je verbinding terug is.' : this.syncing ? 'Laat deze pagina gerust open of werk verder in Keepit.' : blocked ? errorHelp : first ? 'Keepit verstuurt de registraties in de volgorde waarin je ze hebt ingevoerd.' : 'Er zijn voor jouw account geen werkuren meer in de wachtrij op dit toestel.'}</span>
      </section>

      ${this.unscopedCount ? html`<section class="legacy">
        <div class="legacy-copy"><span class="legacy-icon"><custom-icon icon="warning"></custom-icon></span><div><strong>Oude offline registraties</strong>
          <span>${this.unscopedCount} ${this.unscopedCount === 1 ? 'registratie is' : 'registraties zijn'} nog niet aan een account gekoppeld.</span></div></div>
        <button type="button" ?disabled=${this.syncing} @click=${() => void this.claimLegacy()}>Controleren en koppelen</button>
      </section>` : ''}

      ${first ? html`<section class="panel" aria-labelledby="queue-title" aria-busy=${this.syncing}>
        <div class="panel-head"><div><h2 id="queue-title">Wachtrij</h2><p>Keepit bewaart elke registratie tot de server ze bevestigt.</p></div>
          <span class="count">${this.actions.length} wachtend</span></div>
        <ol class="list">
          ${this.actions.map((action, index) => html`<li class="row">
            <span class="icon"><custom-icon icon=${action.type === 'checkin' ? 'login' : 'logout'}></custom-icon></span>
            <div class="copy"><strong>${action.type === 'checkin' ? 'Start' : 'Stop'} · ${this.jobs[action.job]?.name || 'Onbekende job'}</strong>
              <span>${format(action.timestamp)}</span>
            </div>
            <span class="state ${index === 0 && blocked ? 'error' : ''}">${index === 0 && this.syncing ? 'Bezig…'
              : !this.online ? 'Offline bewaard' : index === 0 && blocked ? 'Niet verwerkt' : 'In wachtrij'}</span>
            ${index === 0 && blocked ? html`<div class="queue-error"><strong>${first.failureKind && first.lastError ? first.lastError : 'Vorige poging mislukt'}</strong>
              <span>${(action.attempts || 1) === 1 ? '1 poging' : `${action.attempts} pogingen`}. De volgende registraties wachten hierop.</span>
            </div>` : ''}
          </li>`)}
        </ol>
      </section>` : ''}
    `
  }
}

customElements.define('sync-view', SyncView)
