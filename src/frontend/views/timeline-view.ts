import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { api } from '../api/client.js'
import { showToast } from '../helpers/toast.js'
import {
  LocationVerification,
  Prestation,
  TimelinePlace,
  User,
  WorkLocation
} from '../../types/index.js'

type TimelineEntry = Prestation & { id: string }
const STANDARD_WORKDAY_LIMIT_MS = 12 * 60 * 60 * 1000

export class TimelineView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor jobs
  @property({ type: Object, consumes: true }) accessor user: User
  @property({ type: Array }) accessor entries: TimelineEntry[] = []
  @property({ type: Boolean }) accessor loading = true
  @property({ type: String }) accessor error = ''
  @property({ type: String }) accessor editingId = ''
  @property({ type: String }) accessor editStart = ''
  @property({ type: String }) accessor editEnd = ''
  @property({ type: String }) accessor editReason = ''
  @property({ type: Boolean }) accessor savingEdit = false

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 860px;
        padding: 20px;
        box-sizing: border-box;
        gap: 20px;
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      .header {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .eyebrow {
        color: var(--app-accent);
        font-size: 0.78rem;
        font-weight: 500;
        letter-spacing: 0;
      }

      h1 {
        font-size: 2.15rem;
        font-weight: 600;
        line-height: 1.15;
        letter-spacing: 0;
      }

      .muted {
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.5;
      }

      .day {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .day-title {
        font-size: 0.86rem;
        color: var(--md-sys-color-on-surface-variant);
        text-transform: capitalize;
      }

      .entry {
        display: grid;
        grid-template-columns: 12px minmax(0, 1fr) auto;
        gap: 16px;
        align-items: start;
        padding: 16px;
        border-radius: var(--app-radius-panel);
        border: 1px solid var(--app-border);
        background: var(--app-panel);
        box-shadow: var(--app-shadow-soft);
      }

      .marker {
        width: 12px;
        height: 12px;
        margin-top: 5px;
        border-radius: 50%;
        background: var(--app-accent);
        box-shadow: 0 0 0 5px var(--app-accent-soft);
      }

      .marker.movement {
        background: var(--app-success);
        box-shadow: 0 0 0 5px var(--app-success-soft);
      }

      .entry-copy {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }

      .meta,
      .location-links {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px 14px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.9rem;
      }

      .source-badge {
        display: inline-flex;
        width: fit-content;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--app-panel-strong);
        border: 1px solid var(--app-border);
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.7rem;
        font-weight: 650;
      }

      .location-chip {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--app-accent);
        font-weight: 550;
        cursor: help;
      }

      .location-chip.off-site {
        color: var(--md-sys-color-error);
      }

      .location-preview {
        position: absolute;
        z-index: 20;
        left: 0;
        bottom: calc(100% + 9px);
        width: max-content;
        max-width: min(320px, 72vw);
        display: none;
        flex-direction: column;
        gap: 4px;
        padding: 10px 12px;
        border: 1px solid var(--app-border);
        border-radius: 12px;
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        box-shadow: var(--app-shadow-strong);
        font-size: 0.78rem;
        font-weight: 500;
        line-height: 1.4;
      }

      .location-preview strong {
        font-weight: 600;
      }

      .location-preview small {
        color: var(--md-sys-color-on-surface-variant);
      }

      .location-chip:hover .location-preview,
      .location-chip:focus-visible .location-preview {
        display: flex;
      }

      .location-warning {
        display: inline-flex;
        width: fit-content;
        align-items: center;
        gap: 6px;
        padding: 6px 9px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--md-sys-color-error) 12%, transparent 88%);
        color: var(--md-sys-color-error);
        font-size: 0.78rem;
        font-weight: 600;
      }

      .hours-warning {
        display: inline-flex;
        width: fit-content;
        align-items: center;
        gap: 6px;
        padding: 6px 9px;
        border: 1px solid color-mix(in srgb, #f0a13a 46%, var(--app-border));
        border-radius: 10px;
        background: color-mix(in srgb, #f0a13a 11%, transparent);
        color: color-mix(in srgb, #f0a13a 82%, white);
        font-size: 0.78rem;
        font-weight: 600;
      }

      .warning-icon {
        display: inline-grid;
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        place-items: center;
        --custom-icon-color: currentColor;
        --custom-icon-size: 18px;
      }

      .duration {
        padding: 7px 10px;
        border-radius: 999px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
        font-size: 0.82rem;
        font-weight: 600;
        white-space: nowrap;
      }

      .entry-side {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }

      .edit-button,
      .correction-actions button {
        min-height: 34px;
        padding: 0 10px;
        border: 1px solid var(--app-border);
        border-radius: 9px;
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
        font-size: .72rem;
        font-weight: 650;
        cursor: pointer;
      }

      .edit-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .edit-button custom-icon {
        --custom-icon-color: var(--app-accent);
        --custom-icon-size: 16px;
      }

      .correction-form {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 6px;
        padding: 14px;
        border: 1px solid color-mix(in srgb, var(--app-accent) 28%, var(--app-border));
        border-radius: var(--app-radius-control);
        background: color-mix(in srgb, var(--app-accent) 6%, var(--app-panel-strong));
      }

      .correction-form label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: .7rem;
        font-weight: 650;
      }

      .correction-form h4 {
        grid-column: 1 / -1;
        margin: 0;
        font-size: .82rem;
      }

      .correction-form input {
        width: 100%;
        height: 40px;
        padding: 0 9px;
        box-sizing: border-box;
        border: 1px solid var(--app-border);
        border-radius: 9px;
        background: var(--app-panel);
        color: var(--md-sys-color-on-surface);
        font: inherit;
      }

      .correction-reason,
      .correction-actions {
        grid-column: 1 / -1;
      }

      .correction-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .correction-actions .save {
        border-color: var(--app-accent-strong);
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
      }

      .correction-actions button:disabled {
        opacity: .55;
        cursor: wait;
      }

      .correction-audit {
        color: var(--md-sys-color-on-surface-variant);
        font-size: .68rem;
      }

      .empty {
        padding: 34px;
        border: 1px dashed var(--app-border);
        border-radius: var(--app-radius-panel);
        text-align: center;
      }

      .empty a {
        display: inline-flex;
        margin-top: 14px;
        color: var(--app-accent);
        font-weight: 600;
      }

      .timeline-explanation {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-control);
        background: var(--app-panel);
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.82rem;
        line-height: 1.45;
      }

      .timeline-explanation custom-icon {
        flex: 0 0 auto;
        --custom-icon-color: var(--app-accent);
        --custom-icon-size: 19px;
      }

      @media (max-width: 620px) {
        :host {
          padding: 12px;
        }

        .entry {
          grid-template-columns: 12px minmax(0, 1fr);
        }

        .duration {
          width: fit-content;
        }

        .entry-side {
          grid-column: 2;
          align-items: flex-start;
          flex-direction: row;
          flex-wrap: wrap;
        }

        .correction-form {
          grid-template-columns: 1fr;
        }

        .correction-reason,
        .correction-actions {
          grid-column: auto;
        }
      }
    `
  ]

  connectedCallback() {
    super.connectedCallback()
    void this.loadTimeline()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
  }

  async loadTimeline() {
    this.loading = true
    this.error = ''
    try {
      this.entries = await api.getMyTimeline(30)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Tijdlijn laden mislukt'
    } finally {
      this.loading = false
    }
  }

  formatTime(timestamp?: number) {
    if (!timestamp) return 'Nu'
    return new Intl.DateTimeFormat('nl-BE', { hour: '2-digit', minute: '2-digit' }).format(timestamp)
  }

  toLocalDateTime(value?: number) {
    if (!value || !Number.isFinite(value)) return ''
    const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000)
    return date.toISOString().slice(0, 16)
  }

  startEditing(entry: TimelineEntry) {
    this.editingId = entry.id
    this.editStart = this.toLocalDateTime(Number(entry.checkin))
    this.editEnd = this.toLocalDateTime(Number(entry.checkout))
    this.editReason = ''
    requestAnimationFrame(() => this.shadowRoot?.querySelector<HTMLInputElement>('.correction-form input')?.focus())
  }

  cancelEditing() {
    this.editingId = ''
    this.editStart = ''
    this.editEnd = ''
    this.editReason = ''
  }

  async saveCorrection(entry: TimelineEntry) {
    const userId = this.user?.id
    const jobId = entry.jobId
    const checkin = new Date(this.editStart).getTime()
    const checkout = this.editEnd ? new Date(this.editEnd).getTime() : undefined
    if (!userId || !jobId || !entry.id) return showToast('Deze registratie kan niet aangepast worden.')
    if (!Number.isFinite(checkin) || (checkout !== undefined && (!Number.isFinite(checkout) || checkout < checkin))) {
      return showToast('Controleer de begin- en eindtijd.')
    }
    if (this.editReason.trim().length < 3) return showToast('Geef kort aan waarom je de uren aanpast.')
    this.savingEdit = true
    try {
      const updated = await api.correctHours(jobId, userId, entry.id, {
        checkin,
        checkout,
        reason: this.editReason.trim()
      })
      this.entries = this.entries.map((item) => item.id === entry.id ? { ...item, ...updated, id: entry.id } : item)
      this.cancelEditing()
      showToast('Uren aangepast. De wijziging is bewaard in het correctielog.')
    } catch (error) {
      console.error(error)
      showToast(error instanceof Error ? error.message : 'Uren aanpassen is mislukt.')
    } finally {
      this.savingEdit = false
    }
  }

  getDuration(entry: TimelineEntry) {
    return entry.duration ?? (entry.checkout ? entry.checkout - entry.checkin : Date.now() - entry.checkin)
  }

  formatDuration(entry: TimelineEntry) {
    const duration = this.getDuration(entry)
    const minutes = Math.max(0, Math.round(duration / 60_000))
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return hours ? `${hours}u ${rest.toString().padStart(2, '0')}` : `${rest} min`
  }

  renderHoursWarning(entry: TimelineEntry) {
    const duration = this.getDuration(entry)
    if (!Number.isFinite(duration) || duration <= STANDARD_WORKDAY_LIMIT_MS) return ''
    return html`<span class="hours-warning" role="status">
      <custom-icon
        class="warning-icon"
        icon="warning"></custom-icon
      >Ongebruikelijk lange registratie: meer dan 12 uur. Controleer de tijden.
    </span>`
  }

  formatDistance(distance?: number) {
    if (distance === undefined) return ''
    return distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`
  }

  canViewLocationFlags() {
    return Boolean(this.user?.roles?.includes('admin'))
  }

  renderLocationChip(
    label: string,
    icon: string,
    _location: WorkLocation,
    place?: TimelinePlace,
    verification?: LocationVerification
  ) {
    return html`
      <span
        class="location-chip ${this.canViewLocationFlags() && verification?.status === 'off-site' ? 'off-site' : ''}"
        tabindex="0">
        <custom-icon icon=${icon}></custom-icon>${label}
        <span
          class="location-preview"
          role="tooltip">
          <strong>${place?.name || 'Plaats wordt opgezocht'}</strong>
          ${place?.formattedAddress ? html`<span>${place.formattedAddress}</span>` : ''}
          ${!place ? html`<small>Vernieuw de tijdlijn om de plaatsnaam aan te vullen.</small>` : ''}
        </span>
      </span>
    `
  }

  renderOffSiteWarning(label: string, verification?: LocationVerification) {
    if (!this.canViewLocationFlags() || verification?.status !== 'off-site') return ''
    return html`<span class="location-warning">
      <custom-icon
        class="warning-icon"
        icon="warning"></custom-icon
      >${label} gebeurde ${this.formatDistance(
        verification.distanceMeters
      )} van de joblocatie
    </span>`
  }

  get groupedEntries() {
    const formatter = new Intl.DateTimeFormat('nl-BE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    })
    return this.entries.reduce<Record<string, TimelineEntry[]>>((groups, entry) => {
      const label = formatter.format(entry.checkin)
      ;(groups[label] ||= []).push(entry)
      return groups
    }, {})
  }

  renderEntry(entry: TimelineEntry) {
    const job = entry.jobId ? this.jobs?.[entry.jobId] : undefined
    return html`
      <article class="entry">
        <span class="marker"></span>
        <div class="entry-copy">
          <h3>${job?.name || 'Onbekende job'}</h3>
          <div class="meta">
            <span>${this.formatTime(entry.checkin)} – ${this.formatTime(entry.checkout)}</span>
            ${job?.place?.formattedAddress ? html`<span>${job.place.formattedAddress}</span>` : ''}
          </div>
          <span class="source-badge">${entry.source === 'offline-sync' ? 'Offline geregistreerd' : entry.source === 'admin' ? 'Door admin ingevoerd' : entry.source === 'legacy' ? 'Oude registratie' : 'Manueel gestart'}</span>
          ${entry.checkinLocation || entry.checkoutLocation
            ? html`
                <div class="location-links">
                  ${entry.checkinLocation
                    ? this.renderLocationChip(
                        'Startlocatie',
                        'location_on',
                        entry.checkinLocation,
                        entry.checkinPlace,
                        entry.checkinLocationVerification
                      )
                    : ''}
                  ${entry.checkoutLocation
                    ? this.renderLocationChip(
                        'Eindlocatie',
                        'flag',
                        entry.checkoutLocation,
                        entry.checkoutPlace,
                        entry.checkoutLocationVerification
                      )
                    : ''}
                </div>
              `
            : ''}
          ${this.renderOffSiteWarning('Check-in', entry.checkinLocationVerification)}
          ${this.renderOffSiteWarning('Check-out', entry.checkoutLocationVerification)}
          ${this.renderHoursWarning(entry)}
          ${entry.corrections?.length
            ? html`<span class="correction-audit">${entry.corrections.length} ${entry.corrections.length === 1 ? 'aanpassing' : 'aanpassingen'} · laatste reden: ${entry.corrections.at(-1)?.reason}</span>`
            : ''}
          ${this.editingId === entry.id
            ? html`<section class="correction-form" aria-label="Uren aanpassen"><h4>Uren aanpassen</h4><label>Starttijd<input type="datetime-local" .value=${this.editStart} @input=${(event:Event)=>(this.editStart=(event.target as HTMLInputElement).value)} /></label><label>Eindtijd <span class="muted">(leeg indien bezig)</span><input type="datetime-local" .value=${this.editEnd} @input=${(event:Event)=>(this.editEnd=(event.target as HTMLInputElement).value)} /></label><label class="correction-reason">Reden<input maxlength="500" placeholder="Bijvoorbeeld: verkeerde starttijd gekozen" .value=${this.editReason} @input=${(event:Event)=>(this.editReason=(event.target as HTMLInputElement).value)} /></label><div class="correction-actions"><button @click=${()=>this.cancelEditing()}>Annuleren</button><button class="save" ?disabled=${this.savingEdit} @click=${()=>this.saveCorrection(entry)}>${this.savingEdit?'Opslaan…':'Aanpassing opslaan'}</button></div></section>`
            : ''}
        </div>
        <div class="entry-side"><span class="duration">${this.formatDuration(entry)}</span>${entry.jobId&&!entry.invoiceId&&!entry.invoicedAt&&this.editingId!==entry.id?html`<button class="edit-button" @click=${()=>this.startEditing(entry)}><custom-icon icon="edit"></custom-icon>Aanpassen</button>`:''}</div>
      </article>
    `
  }

  render() {
    return html`
      <section class="header">
        <span class="eyebrow">Laatste 30 dagen</span>
        <h1>Mijn tijdlijn</h1>
        <p class="muted">Je bevestigde werkuren, aankomsten en vertrekken.</p>
      </section>

      ${this.loading
        ? html`<div class="empty"><p class="muted">Tijdlijn laden…</p></div>`
        : this.error
          ? html`<div class="empty"><p>${this.error}</p></div>`
          : this.entries.length === 0
            ? html`
                <div class="empty">
                  <h2>Nog geen werkmomenten</h2>
                  <p class="muted">Start je eerste job; je bevestigde manuele start verschijnt daarna hier.</p>
                  <a href="#!/checkin">Werk starten</a>
                </div>
              `
            : html`
                ${Object.entries(this.groupedEntries).map(
                  ([label, entries]) => html`
                    <section class="day">
                      <h2 class="day-title">${label} · Werkuren</h2>
                      ${entries.map((entry) => this.renderEntry(entry))}
                    </section>
                  `
                )}
              `}
    `
  }
}

customElements.define('timeline-view', TimelineView)
