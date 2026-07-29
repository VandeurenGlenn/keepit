import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { JobsMixin } from '../mixins/jobs.js'
import { Job, Jobs } from '../../types/index.js'

const jobsMixin = JobsMixin(LiteElement)

export class JobsView extends jobsMixin {
  @property({ type: String }) accessor searchQuery = ''
  @property({ type: String }) accessor statusFilter = 'active'

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 1180px;
        min-height: 100%;
        gap: 16px;
        padding: 22px;
        box-sizing: border-box;
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      .page-header {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 22px 24px;
        overflow: hidden;
        border: 1px solid var(--app-border);
        border-radius: 22px;
        background:
          radial-gradient(circle at 92% 10%, color-mix(in srgb, var(--app-accent) 13%, transparent 87%), transparent 32%),
          linear-gradient(145deg, var(--app-panel-strong), var(--app-panel));
        box-shadow: var(--app-shadow-soft);
      }

      .page-header::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: var(--app-accent);
      }

      .page-heading {
        display: flex;
        align-items: center;
        gap: 15px;
        min-width: 0;
      }

      .page-icon,
      .job-icon {
        display: grid;
        place-items: center;
        flex: none;
        color: var(--app-accent);
        background: var(--app-accent-soft);
        --custom-icon-color: var(--app-accent);
      }

      .page-icon {
        width: 52px;
        height: 52px;
        border-radius: 15px;
        --custom-icon-size: 28px;
      }

      .eyebrow {
        display: inline-flex;
        margin-bottom: 4px;
        color: var(--app-accent);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .page-header h1 {
        font-size: clamp(1.65rem, 3vw, 2.3rem);
        line-height: 1.05;
        letter-spacing: -0.025em;
      }

      .page-header p {
        margin-top: 6px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.88rem;
      }

      button {
        border: 1px solid var(--app-border);
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
        cursor: pointer;
      }

      .primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 44px;
        padding: 0 16px;
        border-radius: 12px;
        border-color: var(--app-accent-strong);
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
        font-weight: 750;
        white-space: nowrap;
      }

      .primary custom-icon {
        --custom-icon-color: currentColor;
        --custom-icon-size: 19px;
      }

      .toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
      }

      .search-wrap {
        position: relative;
        flex: 1;
      }

      .search-wrap custom-icon {
        position: absolute;
        top: 50%;
        left: 13px;
        transform: translateY(-50%);
        pointer-events: none;
        --custom-icon-color: var(--md-sys-color-on-surface-variant);
        --custom-icon-size: 20px;
      }

      .search,
      .status-filter {
        min-height: 44px;
        box-sizing: border-box;
        border: 1px solid var(--app-border);
        border-radius: 13px;
        background: var(--app-panel);
        color: var(--md-sys-color-on-surface);
        font: inherit;
      }

      .search {
        width: 100%;
        padding: 0 14px 0 42px;
      }

      .status-filter {
        padding: 0 34px 0 13px;
        font-size: 0.84rem;
        font-weight: 650;
      }

      .search:focus-visible,
      .status-filter:focus-visible,
      button:focus-visible,
      .job-link:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-accent) 22%, transparent 78%);
      }

      .list-heading {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 12px;
      }

      .list-heading h2 {
        font-size: 1rem;
      }

      .job-count {
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.8rem;
        font-weight: 650;
      }

      .jobs-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .job-card {
        position: relative;
        display: flex;
        min-width: 0;
        min-height: 118px;
        overflow: hidden;
        border: 1px solid var(--app-border);
        border-radius: 18px;
        background: linear-gradient(145deg, var(--app-panel-strong), var(--app-panel));
        box-shadow: var(--app-shadow-soft);
        transition:
          transform 160ms ease,
          border-color 160ms ease,
          box-shadow 160ms ease;
      }

      .job-card:hover {
        transform: translateY(-2px);
        border-color: color-mix(in srgb, var(--app-accent) 34%, var(--app-border) 66%);
        box-shadow: var(--app-shadow-strong);
      }

      .job-link {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) 24px;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 17px 54px 17px 17px;
        box-sizing: border-box;
        color: inherit;
        text-decoration: none;
      }

      .job-icon {
        width: 44px;
        height: 44px;
        border-radius: 13px;
        font-size: 1rem;
        font-weight: 850;
        text-transform: uppercase;
      }

      .job-info {
        min-width: 0;
      }

      .job-title {
        overflow: hidden;
        font-size: 1rem;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .job-address {
        margin-top: 5px;
        overflow: hidden;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.8rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .job-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 9px;
      }

      .status,
      .material-count {
        display: inline-flex;
        align-items: center;
        min-height: 23px;
        padding: 0 8px;
        border-radius: 999px;
        font-size: 0.67rem;
        font-weight: 750;
      }

      .status {
        color: var(--app-success);
        background: var(--app-success-soft);
      }

      .status.completed {
        color: var(--md-sys-color-on-surface-variant);
        background: var(--app-panel-strong);
      }

      .material-count {
        color: var(--md-sys-color-on-surface-variant);
        background: var(--app-panel-strong);
        border: 1px solid var(--app-border);
      }

      .job-arrow {
        color: var(--md-sys-color-on-surface-variant);
        --custom-icon-color: currentColor;
        --custom-icon-size: 20px;
      }

      .delete-button {
        position: absolute;
        top: 12px;
        right: 12px;
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        padding: 0;
        border-radius: 10px;
        opacity: 0.62;
      }

      .delete-button:hover {
        opacity: 1;
        color: var(--md-sys-color-error);
        border-color: color-mix(in srgb, var(--md-sys-color-error) 45%, var(--app-border) 55%);
      }

      .delete-button custom-icon {
        --custom-icon-color: currentColor;
        --custom-icon-size: 18px;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 54px 20px;
        border: 1px dashed var(--app-border);
        border-radius: 18px;
        color: var(--md-sys-color-on-surface-variant);
        text-align: center;
      }

      .empty-state custom-icon {
        --custom-icon-color: var(--app-accent);
        --custom-icon-size: 34px;
      }

      @media (max-width: 820px) {
        .jobs-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .page-header {
          align-items: flex-start;
          padding: 18px;
          border-radius: 19px;
        }

        .page-icon {
          display: none;
        }

        .primary {
          min-width: 44px;
          padding: 0 12px;
        }

        .primary-label {
          display: none;
        }

        .toolbar {
          align-items: stretch;
          flex-direction: column;
        }

        .status-filter {
          width: 100%;
        }

        .job-card {
          min-height: 108px;
        }

        .job-link {
          padding-left: 13px;
        }
      }
    `
  ]

  get visibleJobs(): Array<[string, Job]> {
    const query = this.searchQuery.trim().toLowerCase()
    return Object.entries((this.jobs as Jobs) || {})
      .filter(([, job]) => {
        const completed = job.status === 'completed'
        if (this.statusFilter === 'active' && completed) return false
        if (this.statusFilter === 'completed' && !completed) return false
        if (!query) return true
        return `${job.name} ${job.description || ''} ${job.place?.formattedAddress || ''}`.toLowerCase().includes(query)
      })
      .sort(([, left], [, right]) => {
        const leftCompleted = left.status === 'completed' ? 1 : 0
        const rightCompleted = right.status === 'completed' ? 1 : 0
        return leftCompleted - rightCompleted || left.name.localeCompare(right.name, 'nl')
      })
  }

  render() {
    const allJobs = Object.values((this.jobs as Jobs) || {})
    const visibleJobs = this.visibleJobs
    const activeCount = allJobs.filter((job) => job.status !== 'completed').length

    return html`
      <header class="page-header">
        <div class="page-heading">
          <span class="page-icon"><custom-icon icon="work"></custom-icon></span>
          <div>
            <span class="eyebrow">Werkplanning</span>
            <h1>Jobs</h1>
            <p>${activeCount} actieve ${activeCount === 1 ? 'job' : 'jobs'} · ${allJobs.length} totaal</p>
          </div>
        </div>
        <button
          class="primary"
          ?disabled=${this.creatingJob}
          @click=${() => this._createJob()}>
          <custom-icon icon="add"></custom-icon>
          <span class="primary-label">Nieuwe job</span>
        </button>
      </header>

      <div class="toolbar">
        <div class="search-wrap">
          <custom-icon icon="search"></custom-icon>
          <input
            class="search"
            type="search"
            placeholder="Zoek op naam, adres of omschrijving..."
            .value=${this.searchQuery}
            @input=${(event: Event) => {
              this.searchQuery = (event.target as HTMLInputElement).value
            }} />
        </div>
        <select
          class="status-filter"
          aria-label="Filter jobs op status"
          .value=${this.statusFilter}
          @change=${(event: Event) => {
            this.statusFilter = (event.target as HTMLSelectElement).value
          }}>
          <option value="active">Actieve jobs</option>
          <option value="completed">Afgeronde jobs</option>
          <option value="all">Alle jobs</option>
        </select>
      </div>

      <div class="list-heading">
        <h2>${this.statusFilter === 'completed' ? 'Afgeronde jobs' : this.statusFilter === 'all' ? 'Alle jobs' : 'Actieve jobs'}</h2>
        <span class="job-count">${visibleJobs.length} resultaten</span>
      </div>

      ${visibleJobs.length
        ? html`<section class="jobs-grid">
            ${visibleJobs.map(
              ([key, job]) => html`<article class="job-card">
                <a
                  class="job-link"
                  href=${`#!/job?selected=${key}`}>
                  <span class="job-icon">${job.name.trim().charAt(0) || '?'}</span>
                  <div class="job-info">
                    <h3 class="job-title">${job.name || 'Naamloze job'}</h3>
                    <p class="job-address">${job.place?.formattedAddress || 'Locatie ontbreekt'}</p>
                    <div class="job-meta">
                      <span class="status ${job.status === 'completed' ? 'completed' : ''}">
                        ${job.status === 'completed' ? 'Afgerond' : 'Actief'}
                      </span>
                      <span class="material-count">${job.materials?.length || 0} materialen</span>
                    </div>
                  </div>
                  <custom-icon
                    class="job-arrow"
                    icon="arrow-forward"></custom-icon>
                </a>
                <button
                  type="button"
                  class="delete-button"
                  aria-label=${`${job.name || 'job'} verwijderen`}
                  title="Job verwijderen"
                  @click=${() => this._deleteJob(key)}>
                  <custom-icon icon="delete"></custom-icon>
                </button>
              </article>`
            )}
          </section>`
        : html`<div class="empty-state">
            <custom-icon icon="search"></custom-icon>
            <strong>Geen jobs gevonden</strong>
            <span>Pas je zoekopdracht of statusfilter aan.</span>
          </div>`}
    `
  }
}

customElements.define('jobs-view', JobsView)
