import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { api } from '../api/client.js'
import type { Prestation } from '../../types/index.js'

export class HomeView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user
  @property({ type: Object, consumes: true }) accessor jobs
  @property({ type: Boolean }) accessor savingPreference = false
  @property({ type: Object }) accessor control: any
  @property({ type: Array }) accessor todayPlanning: any[] = []
  @property({ type: Object }) accessor activeSession: (Prestation & { id: string }) | undefined
  @property({ type: Number }) accessor now = Date.now()
  clockTimer?: ReturnType<typeof setInterval>

  connectedCallback(){super.connectedCallback();setTimeout(()=>void this.loadDashboard());this.clockTimer=setInterval(()=>{this.now=Date.now()},60_000)}
  disconnectedCallback(){if(this.clockTimer)clearInterval(this.clockTimer);super.disconnectedCallback()}

  async loadDashboard(){
    try{
      const timelinePromise=this.user?.currentJob?api.getMyTimeline(90):Promise.resolve([])
      if(this.user?.roles?.includes('admin')) {
        const [control,timeline]=await Promise.all([api.getControlCenter(),timelinePromise]);this.control=control;this.setActiveSession(timeline)
      } else if(this.user?.id){const start=new Date();start.setHours(0,0,0,0);const end=new Date(start.getTime()+2*86_400_000);const [planning,timeline]=await Promise.all([api.getPlanning(start.toISOString(),end.toISOString()),timelinePromise]);this.todayPlanning=planning.filter(item=>item.userIds.includes(this.user.id)).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));this.setActiveSession(timeline)}
    }catch(error){console.warn('Dashboard laden mislukt',error)}
  }

  setActiveSession(entries:Array<Prestation & {id:string}>){this.activeSession=entries.find(item=>item.id===this.user?.currentPrestationId&&!item.checkout)||entries.find(item=>item.jobId===this.user?.currentJob&&!item.checkout)}

  activeSessionLabel(){
    if(!this.activeSession)return 'Je handmatig bevestigde werkregistratie loopt.'
    const started=new Intl.DateTimeFormat('nl-BE',{hour:'2-digit',minute:'2-digit'}).format(this.activeSession.checkin)
    const minutes=Math.max(0,Math.floor((this.now-this.activeSession.checkin)/60_000));const hours=Math.floor(minutes/60);const rest=minutes%60
    return `Manueel gestart om ${started} · ${hours?`${hours}u `:''}${rest} min bezig`
  }

  get greeting(){
    const hour=Number(new Intl.DateTimeFormat('en-GB',{
      hour:'2-digit',
      hourCycle:'h23',
      timeZone:'Europe/Brussels'
    }).format(this.now))
    if(hour>=5&&hour<12)return 'Goedemorgen'
    if(hour>=12&&hour<18)return 'Goedemiddag'
    if(hour>=18)return 'Goedenavond'
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
        transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
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
        font-size: .72rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .quick-action {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 52px;
        padding: 0 14px;
        font-size: .79rem;
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
        font-size: .75rem;
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
        font-size: .82rem;
      }

      .alert-copy span {
        margin-top: 3px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: .72rem;
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
        font-size: .76rem;
      }

      .work-card {
        position: relative;
        align-items: center;
        justify-content: space-between;
        overflow: hidden;
        background:
          radial-gradient(circle at 92% 12%, var(--app-accent-soft), transparent 32%),
          var(--app-panel);
      }

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

        .admin-grid,.quick-actions{grid-template-columns:repeat(2,minmax(0,1fr))}

        .primary,
        .secondary {
          width: 100%;
        }

        .privacy-actions {
          flex-direction: column;
          align-items: stretch;
        }
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
    const enabled = !this.user?.preferences?.continuousTimelineLocation
    this.savingPreference = true
    try {
      if (enabled && 'Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      await api.updateContinuousTimelinePreference(enabled)
      this.user.preferences = { ...this.user.preferences, continuousTimelineLocation: enabled }
      this.requestRender()
      window.dispatchEvent(new CustomEvent('keepit-timeline-preference', { detail: { enabled } }))
    } finally {
      this.savingPreference = false
    }
  }

  async toggleNotificationPreference(key: 'planningNotifications' | 'planningEmailNotifications' | 'locationSuggestionNotifications') {
    const enabled = this.user?.preferences?.[key] !== false
    this.savingPreference = true
    try {
      const preferences = await api.updateUserPreferences({ [key]: !enabled })
      this.user.preferences = { ...this.user.preferences, ...preferences }
      this.requestRender()
      window.dispatchEvent(new CustomEvent('keepit-timeline-preference'))
    } finally { this.savingPreference = false }
  }

  render() {
    const tracking = Boolean(this.user?.preferences?.continuousTimelineLocation)
    if(this.user?.roles?.includes('admin')) return this.renderAdminDashboard()
    return html`
      <section class="hero">
        <span class="eyebrow">Mijn werkdag</span>
        <h1>Dag ${this.user?.name ? this.user.name.split(' ')[0] : ''}</h1>
        <p class="muted">Registreer je job zonder administratie achteraf.</p>
      </section>
      <section class="privacy-card">
        <div class="privacy-copy"><span class="eyebrow">Meldingsvoorkeuren</span><h2>Kies welke suggesties je ontvangt</h2><p class="muted">Planning en locatievoorstellen blijven apart instelbaar. Geen enkele melding start of stopt automatisch werk.</p></div>
        <div class="privacy-actions"><button class="secondary" ?disabled=${this.savingPreference} @click=${()=>this.toggleNotificationPreference('planningNotifications')}>Planning: ${this.user?.preferences?.planningNotifications===false?'uit':'aan'}</button><button class="secondary" ?disabled=${this.savingPreference} @click=${()=>this.toggleNotificationPreference('planningEmailNotifications')}>Planning via e-mail: ${this.user?.preferences?.planningEmailNotifications===false?'uit':'aan'}</button><button class="secondary" ?disabled=${this.savingPreference} @click=${()=>this.toggleNotificationPreference('locationSuggestionNotifications')}>Locatiesuggesties: ${this.user?.preferences?.locationSuggestionNotifications===false?'uit':'aan'}</button></div>
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

      ${this.todayPlanning[0]?html`<div class="section-heading"><h2>Eerstvolgende planning</h2><a class="muted" href="#!/planning">Volledige planning</a></div><a class="planning-card" href="#!/planning"><div><strong>${this.jobs?.[this.todayPlanning[0].jobId]?.name||'Geplande job'}</strong><span>${new Date(this.todayPlanning[0].start).toLocaleString('nl-BE',{weekday:'short',hour:'2-digit',minute:'2-digit'})}–${new Date(this.todayPlanning[0].end).toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'})}</span></div><custom-icon icon="chevron_right"></custom-icon></a>`:''}

      <div class="quick-actions"><a class="quick-action" href="#!/planning"><custom-icon icon="calendar_month"></custom-icon>Planning</a><a class="quick-action" href="#!/timeline"><custom-icon icon="timeline"></custom-icon>Tijdlijn</a>${this.currentJob?html`<a class="quick-action" href=${`#!/job?selected=${this.user.currentJob}`}><custom-icon icon="inventory2"></custom-icon>Jobdetails</a><a class="quick-action" href=${`#!/job?selected=${this.user.currentJob}&tab=materials`}><custom-icon icon="add_shopping_cart"></custom-icon>Materiaal</a>`:''}</div>

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

      <section class="privacy-card">
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
    `
  }

  renderAdminDashboard(){
    const summary=this.control?.summary||{}
    const alerts=this.control?.alerts||[]
    return html`
      <section class="hero"><span class="eyebrow">Controlecentrum</span><h1>${this.greeting} ${this.user?.name?.split(' ')[0]||''}</h1><p class="muted">Planning, afwijkingen en administratie in één overzicht.</p></section>
      <section class="work-card"><div class="work-copy"><span class="status">${this.currentJob?'Aan het werk':'Klaar om te starten'}</span><h2>${this.currentJob?.name||'Eigen werkregistratie'}</h2><p class="muted">${this.currentJob?this.activeSessionLabel():'Start ook als admin eenvoudig je eigen job.'}</p></div><a class="primary" href=${this.currentJob?'#!/checkout':'#!/checkin'}><custom-icon icon=${this.currentJob?'stop_circle':'play_arrow'}></custom-icon>${this.currentJob?'Werk stoppen':'Werk starten'}</a></section>
      <section class="admin-grid"><a class="admin-stat" href="#!/jobs"><span class="stat-icon"><custom-icon icon="inventory2"></custom-icon></span><strong>${summary.activeJobs??'–'}</strong><span>Actieve jobs</span></a><a class="admin-stat" href="#!/planning"><span class="stat-icon"><custom-icon icon="calendar_month"></custom-icon></span><strong>${summary.todayPlanning??'–'}</strong><span>Vandaag gepland</span></a><a class="admin-stat" href="#!/quotes"><span class="stat-icon"><custom-icon icon="request_quote"></custom-icon></span><strong>${summary.draftQuotes??'–'}</strong><span>Conceptoffertes</span></a><a class="admin-stat" href="#!/invoices"><span class="stat-icon"><custom-icon icon="receipt"></custom-icon></span><strong>${summary.invoices??'–'}</strong><span>Facturen</span></a></section>
      <div class="quick-actions"><a class="quick-action" href="#!/planning"><custom-icon icon="add"></custom-icon>Planning maken</a><a class="quick-action" href="#!/jobs"><custom-icon icon="add_task"></custom-icon>Nieuwe job</a><a class="quick-action" href="#!/quotes"><custom-icon icon="request_quote"></custom-icon>Nieuwe offerte</a><a class="quick-action" href="#!/backups"><custom-icon icon="backup"></custom-icon>Back-ups</a></div>
      <div class="section-heading"><h2>Te controleren uren</h2><a class="section-link" href="#!/timeline">Open tijdlijn<custom-icon icon="arrow_forward"></custom-icon></a></div>
      ${alerts.length?html`<div class="alerts">${alerts.slice(0,8).map((item:any)=>html`<a class=${`alert ${item.severity}`} href=${item.href}><span class="alert-icon"><custom-icon icon=${item.kind==='open'?'timer':item.kind==='future'?'schedule':'warning'}></custom-icon></span><span class="alert-copy"><strong>${item.title}</strong><span>${item.detail}</span></span><custom-icon icon="chevron_right"></custom-icon></a>`)}</div>`:html`<section class="privacy-card"><div class="privacy-copy"><span class="eyebrow">Alles in orde</span><h2>Geen opvallende registraties</h2><p class="muted">Er zijn momenteel geen lange, toekomstige of openstaande uren die controle vragen.</p></div></section>`}`
  }
}

customElements.define('home-view', HomeView)
