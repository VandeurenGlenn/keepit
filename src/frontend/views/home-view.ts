import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { api } from '../api/client.js'
import type { AppSettings, Prestation } from '../../types/index.js'
import { setCachedAppSettings } from '../helpers/place-settings.js'
import { showToast } from '../helpers/toast.js'

export class HomeView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user
  @property({ type: Object, consumes: true }) accessor jobs
  @property({ type: Boolean }) accessor savingPreference = false
  @property({ type: Object }) accessor control: any
  @property({ type: Array }) accessor todayPlanning: any[] = []
  @property({ type: Object }) accessor activeSession: (Prestation & { id: string }) | undefined
  @property({ type: Number }) accessor now = Date.now()
  @property({ type: Object }) accessor appSettings: AppSettings = {}
  @property({ type: String }) accessor addressCountryDraft = ''
  @property({ type: Boolean }) accessor savingAppSettings = false
  clockTimer?: ReturnType<typeof setInterval>

  connectedCallback() {
    super.connectedCallback()
    setTimeout(() => void this.loadDashboard())
    this.clockTimer = setInterval(() => {
      this.now = Date.now()
    }, 60_000)
  }
  disconnectedCallback() {
    if (this.clockTimer) clearInterval(this.clockTimer)
    super.disconnectedCallback()
  }

  async loadDashboard() {
    try {
      const timelinePromise = this.user?.currentJob ? api.getMyTimeline(90) : Promise.resolve([])
      if (this.user?.roles?.includes('admin')) {
        const [control, timeline, settings] = await Promise.all([
          api.getControlCenter(),
          timelinePromise,
          api.getAppSettings()
        ])
        this.control = control
        this.appSettings = settings
        this.addressCountryDraft = settings.addressCountry || ''
        setCachedAppSettings(settings)
        this.setActiveSession(timeline)
      } else if (this.user?.id) {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date(start.getTime() + 2 * 86_400_000)
        const [planning, timeline] = await Promise.all([
          api.getPlanning(start.toISOString(), end.toISOString()),
          timelinePromise
        ])
        this.todayPlanning = planning
          .filter((item) => item.userIds.includes(this.user.id))
          .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
        this.setActiveSession(timeline)
      }
    } catch (error) {
      console.warn('Dashboard laden mislukt', error)
    }
  }

  setActiveSession(entries: Array<Prestation & { id: string }>) {
    this.activeSession =
      entries.find((item) => item.id === this.user?.currentPrestationId && !item.checkout) ||
      entries.find((item) => item.jobId === this.user?.currentJob && !item.checkout)
  }

  activeSessionLabel() {
    if (!this.activeSession) return 'Je handmatig bevestigde werkregistratie loopt.'
    const started = new Intl.DateTimeFormat('nl-BE', { hour: '2-digit', minute: '2-digit' }).format(
      this.activeSession.checkin
    )
    const minutes = Math.max(0, Math.floor((this.now - this.activeSession.checkin) / 60_000))
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return `Manueel gestart om ${started} · ${hours ? `${hours}u ` : ''}${rest} min bezig`
  }

  get greeting() {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hourCycle: 'h23',
        timeZone: 'Europe/Brussels'
      }).format(this.now)
    )
    if (hour >= 5 && hour < 12) return 'Goedemorgen'
    if (hour >= 12 && hour < 18) return 'Goedemiddag'
    if (hour >= 18) return 'Goedenavond'
    return 'Goedenacht'
  }

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 920px;
        padding: 20px;
        box-sizing: border-box;
        gap: 18px;
      }

      h1,
      h2,
      p {
        margin: 0;
      }

      .eyebrow {
        color: var(--app-accent);
        font-size: 0.75rem;
        font-weight: 500;
        letter-spacing: 0;
      }

      .hero {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .hero h1 {
        font-size: 2.15rem;
        font-weight: 600;
        line-height: 1.15;
        letter-spacing: 0;
      }

      .muted {
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.5;
      }

      .work-card,
      .privacy-card {
        display: flex;
        gap: 18px;
        padding: 22px;
        border-radius: var(--app-radius-panel);
        border: 1px solid var(--app-border);
        background: var(--app-panel);
        box-shadow: var(--app-shadow-soft);
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      .admin-grid,
      .quick-actions {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }

      .admin-stat,
      .quick-action,
      .alert {
        border: 1px solid var(--app-border);
        background: var(--app-panel);
        border-radius: var(--app-radius-panel);
        box-shadow: var(--app-shadow-soft);
        transition:
          border-color 160ms ease,
          background 160ms ease,
          transform 160ms ease;
      }

      .admin-stat:hover,
      .quick-action:hover,
      .alert:hover {
        border-color: color-mix(in srgb, var(--app-accent) 36%, var(--app-border));
        background: var(--app-panel-strong);
        transform: translateY(-1px);
      }

      .admin-stat:focus-visible,
      .quick-action:focus-visible,
      .alert:focus-visible,
      .section-link:focus-visible {
        outline: 2px solid var(--app-accent);
        outline-offset: 2px;
      }

      .admin-stat {
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr);
        grid-template-rows: auto auto;
        gap: 3px 11px;
        min-height: 88px;
        padding: 15px;
        box-sizing: border-box;
      }

      .stat-icon {
        grid-row: 1 / 3;
        display: grid;
        place-items: center;
        align-self: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: var(--app-accent-soft);
        color: var(--app-accent);
      }

      .stat-icon custom-icon {
        --custom-icon-color: currentColor;
        --custom-icon-size: 19px;
      }

      .admin-stat strong {
        align-self: end;
        color: var(--md-sys-color-on-surface);
        font-size: 1.45rem;
        line-height: 1;
      }

      .admin-stat > span:last-child {
        align-self: start;
        overflow: hidden;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.72rem;
        text-overflow: ellipsis;
        white-space: normal;
      }

      .quick-action {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 52px;
        padding: 0 14px;
        font-size: 0.79rem;
        font-weight: 700;
      }

      .quick-action custom-icon {
        --custom-icon-color: var(--app-accent);
        --custom-icon-size: 19px;
      }

      .section-link {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-height: 34px;
        padding: 0 10px;
        border: 1px solid var(--app-border);
        border-radius: 9px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.75rem;
        font-weight: 650;
      }

      .section-link custom-icon {
        --custom-icon-color: currentColor;
        --custom-icon-size: 16px;
      }

      .alerts {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .alert {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        min-height: 64px;
        padding: 10px 13px;
        box-sizing: border-box;
      }

      .alert-icon {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 11px;
        background: color-mix(in srgb, #f0a13a 14%, transparent);
        color: #e69a38;
      }

      .alert.critical {
        border-left: 3px solid var(--md-sys-color-error);
      }

      .alert.critical .alert-icon {
        background: color-mix(in srgb, var(--md-sys-color-error) 14%, transparent);
        color: var(--md-sys-color-error);
      }

      .alert-copy strong,
      .alert-copy span {
        display: block;
      }

      .alert-copy strong {
        font-size: 0.82rem;
      }

      .alert-copy span {
        margin-top: 3px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.72rem;
      }

      .planning-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-panel);
        background: var(--app-panel);
      }

      .planning-card strong,
      .planning-card span {
        display: block;
      }

      .planning-card span {
        margin-top: 4px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.76rem;
      }

      .work-card {
        position: relative;
        align-items: center;
        justify-content: space-between;
        overflow: hidden;
        background: var(--app-panel);
        box-shadow: none;
      }

      .dashboard-label { margin:4px 0 -5px; font-size:.88rem; font-weight:650; }
      .dashboard-settings { border-top:1px solid var(--app-border); padding:8px 0; }
      .dashboard-settings summary { width:fit-content; padding:8px 2px; color:var(--md-sys-color-on-surface-variant); font-size:.82rem; cursor:pointer; }
      .dashboard-settings .settings-card { margin-top:8px; box-shadow:none; }
      .dashboard-date { color:var(--app-accent-label); }

      .work-card::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: var(--app-accent);
      }

      .work-copy {
        display: flex;
        flex-direction: column;
        gap: 7px;
        min-width: 0;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        width: fit-content;
        color: var(--app-success);
        font-size: 0.82rem;
        font-weight: 600;
      }

      .status::before {
        content: '';
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: currentColor;
        box-shadow: 0 0 0 5px var(--app-success-soft);
      }

      .work-card h2 {
        font-size: 1.45rem;
      }

      .primary,
      .secondary,
      .job {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 48px;
        padding: 0 18px;
        border-radius: var(--app-radius-control);
        border: 1px solid transparent;
        font: inherit;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        box-sizing: border-box;
      }

      .primary {
        color: var(--md-sys-color-on-primary);
        background: var(--app-accent);
      }

      .secondary {
        color: var(--md-sys-color-on-surface);
        background: var(--app-panel-strong);
        border-color: var(--app-border);
      }

      .section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .section-heading h2 {
        font-size: 1.2rem;
      }

      .jobs {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .job {
        justify-content: flex-start;
        min-height: 70px;
        border-radius: var(--app-radius-control);
        color: var(--md-sys-color-on-surface);
        background: var(--app-panel);
        border-color: var(--app-border);
        overflow: hidden;
      }

      .job custom-icon {
        color: var(--app-accent);
        flex: 0 0 auto;
      }

      .job span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .privacy-card {
        align-items: flex-start;
        justify-content: space-between;
      }

      .privacy-copy {
        display: flex;
        flex-direction: column;
        gap: 7px;
        max-width: 620px;
      }

      .privacy-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 0 0 auto;
      }

      .settings-card {
        align-items: center;
        justify-content: space-between;
      }

      .settings-controls {
        display: flex;
        align-items: end;
        gap: 10px;
        flex: 0 0 auto;
      }

      .settings-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: .72rem;
        font-weight: 700;
      }

      .settings-field select {
        min-width: 210px;
        min-height: 48px;
        padding: 0 12px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-control);
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
      }

      button[disabled] {
        opacity: 0.6;
        cursor: wait;
      }

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .work-card,
        .privacy-card {
          flex-direction: column;
          align-items: stretch;
          padding: 18px;
          border-radius: var(--app-radius-panel);
        }

        .jobs {
          grid-template-columns: 1fr;
        }

        .admin-grid,
        .quick-actions {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .primary,
        .secondary {
          width: 100%;
        }

        .privacy-actions {
          flex-direction: column;
          align-items: stretch;
        }

        .settings-card,
        .settings-controls {
          flex-direction: column;
          align-items: stretch;
        }

        .settings-field select { width: 100%; }
      }
    `
  ]

  get currentJob() {
    return this.user?.currentJob ? this.jobs?.[this.user.currentJob] : undefined
  }

  get availableJobs() {
    return (Object.entries(this.jobs || {}) as Array<[string, any]>)
      .filter(([, job]) => job.status !== 'completed')
      .filter(([, job]) => !job.archivedAt)
      .slice(0, 6)
  }

  async toggleContinuousTimeline() {
    if (this.savingPreference) return
    const enabled = !this.user?.preferences?.continuousTimelineLocation
    this.savingPreference = true
    try {
      if (enabled && 'Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission().catch(() => undefined)
      }
      await api.updateContinuousTimelinePreference(enabled)
      this.user.preferences = { ...this.user.preferences, continuousTimelineLocation: enabled }
      this.requestRender()
      window.dispatchEvent(new CustomEvent('keepit-timeline-preference', { detail: { enabled } }))
    } catch {
      showToast('De locatievoorkeur kon niet worden opgeslagen. Probeer opnieuw.')
    } finally {
      this.savingPreference = false
    }
  }

  async toggleNotificationPreference(
    key: 'planningNotifications' | 'planningEmailNotifications' | 'locationSuggestionNotifications'
  ) {
    if (this.savingPreference) return
    const enabled = this.user?.preferences?.[key] !== false
    this.savingPreference = true
    try {
      const preferences = await api.updateUserPreferences({ [key]: !enabled })
      this.user.preferences = { ...this.user.preferences, ...preferences }
      this.requestRender()
      window.dispatchEvent(new CustomEvent('keepit-timeline-preference'))
    } catch {
      showToast('De meldingsvoorkeur kon niet worden opgeslagen. Probeer opnieuw.')
    } finally {
      this.savingPreference = false
    }
  }

  async saveAddressCountry() {
    this.savingAppSettings = true
    try {
      const settings = await api.updateAppSettings({ addressCountry: this.addressCountryDraft || undefined })
      this.appSettings = settings
      this.addressCountryDraft = settings.addressCountry || ''
      setCachedAppSettings(settings)
      window.dispatchEvent(new CustomEvent('keepit-toast', { detail: { message: 'Globale adresinstelling opgeslagen.' } }))
    } catch (error) {
      console.error('App settings update failed', error)
      window.dispatchEvent(new CustomEvent('keepit-toast', { detail: { message: 'De adresinstelling kon niet opgeslagen worden.' } }))
    } finally {
      this.savingAppSettings = false
    }
  }

  render() {
    const tracking = Boolean(this.user?.preferences?.continuousTimelineLocation)
    if (this.user?.roles?.includes('admin')) return this.renderAdminDashboard()
    const notifications = html`<section class="privacy-card settings-card">
        <div class="privacy-copy">
          <span class="eyebrow">Meldingsvoorkeuren</span>
          <h2>Kies welke suggesties je ontvangt</h2>
          <p class="muted">
            Planning en locatievoorstellen blijven apart instelbaar. Geen enkele melding start of stopt automatisch
            werk.
          </p>
        </div>
        <div class="privacy-actions">
          <button
            class="secondary"
            ?disabled=${this.savingPreference}
            @click=${() => this.toggleNotificationPreference('planningNotifications')}>
            Planning: ${this.user?.preferences?.planningNotifications === false ? 'uit' : 'aan'}</button
          ><button
            class="secondary"
            ?disabled=${this.savingPreference}
            @click=${() => this.toggleNotificationPreference('planningEmailNotifications')}>
            Planning via e-mail: ${this.user?.preferences?.planningEmailNotifications === false ? 'uit' : 'aan'}</button
          ><button
            class="secondary"
            ?disabled=${this.savingPreference}
            @click=${() => this.toggleNotificationPreference('locationSuggestionNotifications')}>
            Locatiesuggesties: ${this.user?.preferences?.locationSuggestionNotifications === false ? 'uit' : 'aan'}
          </button>
        </div>
      </section>`

    return html`
      <section class="hero">
        <span class="eyebrow dashboard-date">Vandaag · ${new Intl.DateTimeFormat('nl-BE', { weekday:'long', day:'numeric', month:'long' }).format(new Date())}</span>
        <h1>${this.greeting} ${this.user?.name?.split(' ')[0] || ''}</h1>
        <p class="muted">Je werkregistratie en planning op één plek.</p>
      </section>

      <section class="work-card">
        <div class="work-copy">
          <span class="status">${this.currentJob ? 'Aan het werk' : 'Klaar om te starten'}</span>
          <h2>${this.currentJob?.name || 'Op welke job werk je?'}</h2>
          <p class="muted">
            ${this.currentJob
              ? `${this.currentJob.place?.formattedAddress ? `${this.currentJob.place.formattedAddress} · ` : ''}${this.activeSessionLabel()}`
              : 'Kies hieronder een job en bevestig je starttijd.'}
          </p>
        </div>
        <a
          class="primary"
          href=${this.currentJob ? '#!/checkout' : '#!/checkin'}>
          <custom-icon icon=${this.currentJob ? 'stop_circle' : 'play_arrow'}></custom-icon>
          ${this.currentJob ? 'Werk stoppen' : 'Werk starten'}
        </a>
      </section>

      ${this.todayPlanning[0]
        ? html`<div class="section-heading">
              <h2>Eerstvolgende planning</h2>
              <a
                class="muted"
                href="#!/planning"
                >Volledige planning</a
              >
            </div>
            <a
              class="planning-card"
              href="#!/planning"
              ><div>
                <strong>${this.jobs?.[this.todayPlanning[0].jobId]?.name || 'Geplande job'}</strong
                ><span
                  >${new Date(this.todayPlanning[0].start).toLocaleString('nl-BE', {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}–${new Date(this.todayPlanning[0].end).toLocaleTimeString('nl-BE', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</span
                >
              </div>
              <custom-icon icon="chevron_right"></custom-icon
            ></a>`
        : ''}

      <div class="quick-actions">
        <a
          class="quick-action"
          href="#!/planning"
          ><custom-icon icon="calendar_month"></custom-icon>Planning</a
        ><a
          class="quick-action"
          href="#!/timeline"
          ><custom-icon icon="timeline"></custom-icon>Tijdlijn</a
        >${this.currentJob
          ? html`<a
                class="quick-action"
                href=${`#!/job?selected=${this.user.currentJob}`}
                ><custom-icon icon="inventory2"></custom-icon>Jobdetails</a
              ><a
                class="quick-action"
                href=${`#!/job?selected=${this.user.currentJob}&tab=materials`}
                ><custom-icon icon="add_shopping_cart"></custom-icon>Materiaal</a
              >`
          : ''}
      </div>

      ${!this.currentJob
        ? html`
            <div class="section-heading">
              <h2>Snel starten</h2>
              <a
                class="muted"
                href="#!/jobs"
                >Alle jobs</a
              >
            </div>
            <div class="jobs">
              ${this.availableJobs.map(
                ([id, job]) => html`
                  <a
                    class="job"
                    href=${`#!/checkin?job=${encodeURIComponent(id)}`}>
                    <custom-icon icon="work"></custom-icon>
                    <span>${job.name}</span>
                  </a>
                `
              )}
            </div>
          `
        : ''}

      <details class="dashboard-settings">
        <summary>Meldingen en locatievoorkeuren</summary>
        ${notifications}
      <section class="privacy-card settings-card">
        <div class="privacy-copy">
          <span class="eyebrow">Optionele 24u-tijdlijn</span>
          <h2>${tracking ? 'Toestemming voor de 24u-tijdlijn staat aan' : 'Doorlopend volgen blijft jouw keuze'}</h2>
          <p class="muted">
            ${tracking
              ? 'De timeline-checker detecteert betekenisvolle stops zolang Keepit actief is. Je kunt de toestemming altijd intrekken.'
              : 'Start- en eindlocaties horen bij je expliciete check-in en checkout. Alleen doorlopende 24u-locatiecontrole vereist deze extra opt-in.'}
          </p>
        </div>
        <div class="privacy-actions">
          <a
            class="secondary"
            href="#!/timeline">
            <custom-icon icon="timeline"></custom-icon>
            Tijdlijn
          </a>
          <button
            class="secondary"
            ?disabled=${this.savingPreference}
            @click=${() => this.toggleContinuousTimeline()}>
            ${tracking ? '24u-tijdlijn uitzetten' : '24u-tijdlijn toestaan'}
          </button>
        </div>
      </section>
      </details>
    `
  }

  renderAdminDashboard() {
    const summary = this.control?.summary || {}
    const alerts = this.control?.alerts || []
    const date = new Intl.DateTimeFormat('nl-BE', { weekday:'long', day:'numeric', month:'long' }).format(new Date())
    return html` <section class="hero">
        <span class="eyebrow dashboard-date">Vandaag · ${date}</span>
        <h1>${this.greeting} ${this.user?.name?.split(' ')[0] || ''}</h1>
        <p class="muted">Planning, afwijkingen en administratie in één overzicht.</p>
      </section>
      <section class="work-card">
        <div class="work-copy">
          <span class="status">${this.currentJob ? 'Aan het werk' : 'Klaar om te starten'}</span>
          <h2>${this.currentJob?.name || 'Eigen werkregistratie'}</h2>
          <p class="muted">
            ${this.currentJob ? this.activeSessionLabel() : 'Start ook als admin eenvoudig je eigen job.'}
          </p>
        </div>
        <a
          class="primary"
          href=${this.currentJob ? '#!/checkout' : '#!/checkin'}
          ><custom-icon icon=${this.currentJob ? 'stop_circle' : 'play_arrow'}></custom-icon>${this.currentJob
            ? 'Werk stoppen'
            : 'Werk starten'}</a
        >
      </section>
      <h2 class="dashboard-label">Overzicht</h2>
      <section class="admin-grid" aria-label="Overzicht">
        <a
          class="admin-stat"
          href="#!/jobs"
          ><span class="stat-icon"><custom-icon icon="inventory2"></custom-icon></span
          ><strong>${summary.activeJobs ?? '–'}</strong><span>Actieve jobs</span></a
        ><a
          class="admin-stat"
          href="#!/planning"
          ><span class="stat-icon"><custom-icon icon="calendar_month"></custom-icon></span
          ><strong>${summary.todayPlanning ?? '–'}</strong><span>Vandaag gepland</span></a
        ><a
          class="admin-stat"
          href="#!/quotes"
          ><span class="stat-icon"><custom-icon icon="request_quote"></custom-icon></span
          ><strong>${summary.draftQuotes ?? '–'}</strong><span>Conceptoffertes</span></a
        ><a
          class="admin-stat"
          href="#!/invoices"
          ><span class="stat-icon"><custom-icon icon="receipt"></custom-icon></span
          ><strong>${summary.invoices ?? '–'}</strong><span>Facturen</span></a
        >
      </section>
      <h2 class="dashboard-label">Snel aan de slag</h2>
      <div class="quick-actions">
        <a
          class="quick-action"
          href="#!/planning?create=1"
          ><custom-icon icon="add"></custom-icon>Planning maken</a
        ><a
          class="quick-action"
          href="#!/jobs?create=1"
          ><custom-icon icon="add_task"></custom-icon>Nieuwe job</a
        ><a
          class="quick-action"
          href="#!/quote"
          ><custom-icon icon="request_quote"></custom-icon>Nieuwe offerte</a
        ><a
          class="quick-action"
          href="#!/backups"
          ><custom-icon icon="backup"></custom-icon>Back-ups</a
        >
      </div>
      <div class="section-heading">
        <h2>Te controleren uren${alerts.length ? ` · ${alerts.length}` : ''}</h2>
        <a class="section-link" href="#!/timeline">Open tijdlijn<custom-icon icon="timeline"></custom-icon></a>
      </div>
      ${alerts.length
        ? html`<div class="alerts">
            ${alerts.slice(0, 8).map((item: any) => html`
              <a class=${`alert ${item.severity}`} href=${item.href}>
                <span class="alert-icon"><custom-icon icon=${item.kind === 'open' ? 'timer' : item.kind === 'future' ? 'schedule' : 'warning'}></custom-icon></span>
                <span class="alert-copy"><strong>${item.title}</strong><span>${item.detail}</span></span>
                <custom-icon icon="chevron_right"></custom-icon>
              </a>`)}
          </div>`
        : html`<p class="muted">Geen urenregistraties die controle vragen.</p>`}
      <details class="dashboard-settings">
        <summary>Werkruimte-instellingen</summary>
        <section class="privacy-card settings-card">
        <div class="privacy-copy">
          <span class="eyebrow">Globale instelling</span>
          <h2>Standaardland voor adressen</h2>
          <p class="muted">Automatisch gebruikt het land uit de browser. Kies hier een land om dit voor iedereen te overschrijven.</p>
        </div>
        <div class="settings-controls">
          <label class="settings-field">Adresland
            <select .value=${this.addressCountryDraft} @change=${(event: Event) => (this.addressCountryDraft = (event.target as HTMLSelectElement).value)}>
              <option value="">Automatisch via browser</option>
              <option value="BE">België</option>
              <option value="NL">Nederland</option>
              <option value="LU">Luxemburg</option>
              <option value="FR">Frankrijk</option>
              <option value="DE">Duitsland</option>
            </select>
          </label>
          <button class="secondary" ?disabled=${this.savingAppSettings || this.addressCountryDraft === (this.appSettings.addressCountry || '')} @click=${() => void this.saveAddressCountry()}>${this.savingAppSettings ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
        </section>
      </details>`
  }
}

customElements.define('home-view', HomeView)
