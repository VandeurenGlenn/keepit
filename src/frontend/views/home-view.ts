import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { api } from '../api/client.js'

export class HomeView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user
  @property({ type: Object, consumes: true }) accessor jobs
  @property({ type: Boolean }) accessor savingPreference = false

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
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .hero {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .hero h1 {
        font-size: clamp(2rem, 6vw, 3.6rem);
        line-height: 1;
        letter-spacing: -0.04em;
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
        border-radius: 26px;
        border: 1px solid var(--app-border);
        background: linear-gradient(145deg, var(--app-panel-strong), var(--app-panel));
        box-shadow: var(--app-shadow-soft);
      }

      .work-card {
        align-items: center;
        justify-content: space-between;
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
        font-weight: 800;
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
        border-radius: 999px;
        border: 1px solid transparent;
        font: inherit;
        font-weight: 750;
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
        align-items: end;
        justify-content: space-between;
        gap: 12px;
      }

      .jobs {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .job {
        justify-content: flex-start;
        min-height: 70px;
        border-radius: 20px;
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
          border-radius: 22px;
        }

        .jobs {
          grid-template-columns: 1fr;
        }

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

  render() {
    const tracking = Boolean(this.user?.preferences?.continuousTimelineLocation)
    return html`
      <section class="hero">
        <span class="eyebrow">Mijn werkdag</span>
        <h1>Dag ${this.user?.name ? this.user.name.split(' ')[0] : ''}</h1>
        <p class="muted">Registreer je job zonder administratie achteraf.</p>
      </section>

      <section class="work-card">
        <div class="work-copy">
          <span class="status">${this.currentJob ? 'Aan het werk' : 'Klaar om te starten'}</span>
          <h2>${this.currentJob?.name || 'Op welke job werk je?'}</h2>
          <p class="muted">
            ${this.currentJob
              ? this.currentJob.place?.formattedAddress || 'Je actieve werkregistratie loopt.'
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
}

customElements.define('home-view', HomeView)
