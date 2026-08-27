import { LiteElement, css, html, property } from '@vandeurenglenn/lite'
import type { BackupSummary, KeepitBackup, User } from '../../types/index.js'
import { api } from '../api/client.js'
import { showToast } from '../helpers/toast.js'

const reasonLabels = {
  automatic: 'Automatisch',
  manual: 'Handmatig',
  'pre-restore': 'Voor herstel'
} as const

export class BackupsView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user: User
  @property({ type: Array }) accessor backups: BackupSummary[] = []
  @property({ type: Boolean }) accessor loading = true
  @property({ type: Boolean }) accessor busy = false
  @property({ type: String }) accessor message = ''
  @property({ type: String }) accessor error = ''
  @property({ type: String }) accessor confirmation = ''
  @property({ type: Object }) accessor selectedBackup: KeepitBackup | undefined
  @property({ type: String }) accessor selectedFileName = ''
  automaticRetention = 30

  static styles = [css`
    :host{display:flex;flex-direction:column;width:100%;max-width:1180px;min-height:100%;gap:16px;padding:22px;box-sizing:border-box}h1,h2,h3,p{margin:0}button,input{font:inherit}.page-header{position:relative;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 24px;overflow:hidden;border:1px solid var(--app-border);border-radius:22px;background:radial-gradient(circle at 92% 10%,var(--app-accent-soft),transparent 32%),linear-gradient(145deg,var(--app-panel-strong),var(--app-panel));box-shadow:var(--app-shadow-soft)}.page-header::before{content:'';position:absolute;inset:0 auto 0 0;width:4px;background:var(--app-accent)}.heading{display:flex;align-items:center;gap:15px}.page-icon{display:grid;place-items:center;width:52px;height:52px;border-radius:15px;background:var(--app-accent-soft);color:var(--app-accent);--custom-icon-color:currentColor;--custom-icon-size:27px}.eyebrow{color:var(--app-accent);font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1{margin-top:3px;font-size:clamp(1.65rem,3vw,2.3rem);line-height:1.05}.subtitle{margin-top:6px;color:var(--md-sys-color-on-surface-variant);font-size:.86rem}.primary,.secondary,.download{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:0 15px;border-radius:12px;font-weight:750;cursor:pointer}.primary{border:1px solid var(--app-accent-strong);background:var(--app-accent);color:var(--md-sys-color-on-primary)}.secondary,.download{border:1px solid var(--app-border);background:var(--app-panel);color:var(--md-sys-color-on-surface)}button:disabled{cursor:wait;opacity:.55}custom-icon{--custom-icon-color:currentColor;--custom-icon-size:19px}.overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.stat,.panel{border:1px solid var(--app-border);background:linear-gradient(145deg,var(--app-panel-strong),var(--app-panel));box-shadow:var(--app-shadow-soft)}.stat{display:flex;align-items:center;gap:12px;padding:16px;border-radius:16px}.stat-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--app-accent-soft);color:var(--app-accent)}.stat-copy{display:flex;flex-direction:column;gap:3px}.stat-copy strong{font-size:.93rem}.stat-copy span,.muted{color:var(--md-sys-color-on-surface-variant);font-size:.76rem}.panel{padding:20px;border-radius:20px}.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}.panel-head h2{font-size:1.05rem}.panel-head p{margin-top:5px;color:var(--md-sys-color-on-surface-variant);font-size:.8rem}.backup-list{display:flex;flex-direction:column;gap:8px}.backup-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:12px 13px;border:1px solid var(--app-border);border-radius:13px}.backup-copy{min-width:0}.backup-copy strong,.backup-copy span{display:block}.backup-copy strong{font-size:.88rem}.backup-copy span{margin-top:3px;color:var(--md-sys-color-on-surface-variant);font-size:.73rem}.badge{padding:5px 9px;border-radius:999px;background:var(--app-accent-soft);color:var(--app-accent);font-size:.68rem;font-weight:800}.empty{padding:32px 16px;border:1px dashed var(--app-border);border-radius:14px;color:var(--md-sys-color-on-surface-variant);text-align:center}.restore-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.6fr);gap:16px}.dropzone{display:flex;align-items:center;gap:13px;min-height:72px;padding:13px;border:1px dashed var(--app-border);border-radius:14px;cursor:pointer}.dropzone:hover{border-color:var(--app-accent)}.dropzone input{position:absolute;width:1px;height:1px;opacity:0}.drop-icon{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border-radius:12px;background:var(--app-accent-soft);color:var(--app-accent)}.drop-copy{min-width:0}.drop-copy strong,.drop-copy span{display:block}.drop-copy strong{font-size:.86rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.drop-copy span{margin-top:4px;color:var(--md-sys-color-on-surface-variant);font-size:.73rem}.confirm{display:flex;flex-direction:column;gap:8px}.confirm label{font-size:.76rem;font-weight:750}.confirm input{height:42px;padding:0 12px;border:1px solid var(--app-border);border-radius:11px;background:var(--app-panel);color:var(--md-sys-color-on-surface);box-sizing:border-box}.danger{border-color:color-mix(in srgb,var(--md-sys-color-error) 45%,var(--app-border));color:var(--md-sys-color-error)}.notice{padding:11px 13px;border-radius:12px;font-size:.8rem}.notice.success{background:color-mix(in srgb,#2e7d32 18%,transparent);color:#70c477}.notice.error{background:color-mix(in srgb,var(--md-sys-color-error) 16%,transparent);color:var(--md-sys-color-error)}.scope{margin-top:13px;color:var(--md-sys-color-on-surface-variant);font-size:.75rem;line-height:1.5}@media(max-width:760px){:host{padding:12px}.page-header{align-items:flex-start;padding:18px;border-radius:19px}.page-icon{display:none}.page-header .primary{width:44px;padding:0}.page-header .primary span{display:none}.overview{grid-template-columns:1fr}.panel{padding:15px}.panel-head,.restore-grid{display:flex;flex-direction:column}.backup-row{grid-template-columns:minmax(0,1fr) auto}.badge{grid-column:1}.download{width:42px;padding:0}.download span{display:none}.confirm{width:100%}}
    .page-header{position:static;padding:18px 20px;overflow:visible;border-radius:var(--app-radius-panel);background:var(--app-panel)}.page-header::before{display:none}.heading{gap:13px}.page-icon{width:44px;height:44px;border-radius:var(--app-radius-control);--custom-icon-size:23px}.eyebrow{font-weight:500;letter-spacing:0;text-transform:none}h1{font-size:1.65rem;font-weight:600;line-height:1.12}.subtitle{margin-top:5px;font-size:.8rem}.primary,.secondary,.download{border-radius:var(--app-radius-control);font-weight:600}.stat,.panel{border-radius:var(--app-radius-panel);background:var(--app-panel)}.stat{padding:14px}.stat-icon,.drop-icon{border-radius:var(--app-radius-control)}.stat-copy strong,.panel-head h2,.backup-copy strong{font-weight:600}.panel{padding:18px}.panel-head h2{font-size:.95rem}.badge{font-weight:600}.empty,.dropzone{border-radius:var(--app-radius-control)}.dropzone:focus-within{outline:2px solid var(--app-accent);outline-offset:2px}.confirm label{font-weight:600}.confirm input{border-radius:var(--app-radius-control)}@media(max-width:760px){.page-header{padding:14px;border-radius:var(--app-radius-panel)}.panel{padding:14px}}
  `]

  connectedCallback() {
    super.connectedCallback()
    void this.loadBackups()
  }

  async loadBackups() {
    this.loading = true
    this.error = ''
    try {
      const result = await api.getBackups()
      this.backups = result.backups
      this.automaticRetention = result.automaticRetention
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Back-ups konden niet geladen worden.'
    } finally {
      this.loading = false
    }
  }

  async createBackup() {
    this.busy = true; this.error = ''; this.message = ''
    try {
      await api.createBackup()
      this.message = 'De back-up is veilig aangemaakt.'
      await this.loadBackups()
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Back-up maken is mislukt.'
    } finally { this.busy = false }
  }

  async download(item: BackupSummary) {
    try {
      const blob = await api.downloadBackup(item.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = item.id; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Download is mislukt.'
    }
  }

  async selectFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    this.selectedBackup = undefined; this.selectedFileName = ''; this.error = ''; this.confirmation = ''
    if (!file) return
    if (file.size > 25 * 1024 * 1024) { this.error = 'Het bestand is groter dan 25 MB.'; return }
    try {
      const parsed = JSON.parse(await file.text()) as KeepitBackup
      if (parsed.format !== 'keepit-backup' || parsed.version !== 1 || !parsed.datasets) throw new Error()
      this.selectedBackup = parsed; this.selectedFileName = file.name
    } catch {
      this.error = 'Dit is geen geldige Keepit-back-up.'
    }
  }

  async restore() {
    if (!this.selectedBackup || this.confirmation !== 'HERSTEL') return
    this.busy = true; this.error = ''; this.message = ''
    try {
      await api.restoreBackup(this.selectedBackup, this.confirmation)
      showToast('De gegevens zijn hersteld. Keepit wordt opnieuw geladen.')
      setTimeout(() => { location.hash = '#!/home'; location.reload() }, 900)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Herstellen is mislukt.'
      this.busy = false
    }
  }

  render() {
    const latest = this.backups[0]
    const manualCount = this.backups.filter((item) => item.reason === 'manual').length
    const formatDate = (value?: string) => value ? new Date(value).toLocaleString('nl-BE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Nog niet beschikbaar'
    const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
    return html`
      <header class="page-header"><div class="heading"><span class="page-icon"><custom-icon icon="backup"></custom-icon></span><div><span class="eyebrow">Systeembeheer</span><h1>Back-ups</h1><p class="subtitle">Bescherm de unieke bedrijfsgegevens en herstel ze wanneer nodig.</p></div></div><button class="primary" aria-label="Nu back-up maken" ?disabled=${this.busy} @click=${()=>this.createBackup()}><custom-icon icon="add"></custom-icon><span>${this.busy ? 'Bezig…' : 'Nu back-up maken'}</span></button></header>
      ${this.message ? html`<div class="notice success" role="status">${this.message}</div>` : ''}${this.error ? html`<div class="notice error" role="alert">${this.error}</div>` : ''}
      <section class="overview"><article class="stat"><span class="stat-icon"><custom-icon icon="schedule"></custom-icon></span><div class="stat-copy"><strong>Laatste back-up</strong><span>${formatDate(latest?.createdAt)}</span></div></article><article class="stat"><span class="stat-icon"><custom-icon icon="shield"></custom-icon></span><div class="stat-copy"><strong>Automatisch beschermd</strong><span>Na wijzigingen en dagelijks</span></div></article><article class="stat"><span class="stat-icon"><custom-icon icon="inventory2"></custom-icon></span><div class="stat-copy"><strong>${manualCount} handmatig</strong><span>${this.automaticRetention} automatische versies bewaard</span></div></article></section>
      <section class="panel" aria-busy=${this.loading}><div class="panel-head"><div><h2>Beschikbare back-ups</h2><p>Download regelmatig een kopie en bewaar die buiten deze server.</p></div></div>${this.loading ? html`<div class="empty" role="status">Back-ups laden…</div>` : this.backups.length ? html`<div class="backup-list">${this.backups.map((item)=>html`<article class="backup-row"><div class="backup-copy"><strong>${formatDate(item.createdAt)}</strong><span>${formatSize(item.sizeBytes)} · ${item.id}</span></div><span class="badge">${reasonLabels[item.reason]}</span><button class="download" aria-label=${`Back-up van ${formatDate(item.createdAt)} downloaden`} @click=${()=>this.download(item)}><custom-icon icon="download"></custom-icon><span>Download</span></button></article>`)}</div>` : html`<div class="empty">Nog geen back-ups beschikbaar.</div>`}<p class="scope">Inbegrepen: uren, jobs, planning, klanten en leveranciers, offertes, factuurgegevens, gebruikers, bestellingen, meldingen en tijdlijngegevens. De grote, opnieuw opbouwbare shopcatalogus en binaire productafbeeldingen zijn niet inbegrepen.</p></section>
      <section class="panel"><div class="panel-head"><div><h2>Back-up herstellen</h2><p>Er wordt automatisch nog een veiligheidskopie gemaakt vóór het herstel.</p></div></div><div class="restore-grid"><label class="dropzone"><input type="file" accept="application/json,.json" @change=${(event:Event)=>this.selectFile(event)} /><span class="drop-icon"><custom-icon icon="upload_file"></custom-icon></span><span class="drop-copy"><strong>${this.selectedFileName || 'Kies een Keepit-back-up'}</strong><span>${this.selectedBackup ? `Gemaakt op ${formatDate(this.selectedBackup.createdAt)}` : 'JSON-bestand, maximaal 25 MB'}</span></span></label><div class="confirm"><label for="restore-confirmation">Typ HERSTEL om te bevestigen</label><input id="restore-confirmation" autocomplete="off" placeholder="HERSTEL" .value=${this.confirmation} @input=${(event:Event)=>(this.confirmation=(event.target as HTMLInputElement).value)} /><button class="secondary danger" ?disabled=${this.busy || !this.selectedBackup || this.confirmation !== 'HERSTEL'} @click=${()=>this.restore()}><custom-icon icon="restore"></custom-icon>Gegevens herstellen</button></div></div></section>`
  }
}

customElements.define('backups-view', BackupsView)
