import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { CompaniesMixin } from '../mixins/companies.js'
import type { Company, Place } from '../../types/index.js'
import { api } from '../api/client.js'
import { showToast } from '../helpers/toast.js'
import '../flows/data-input.js'

export class CompaniesView extends CompaniesMixin(LiteElement) {
  @property({ type: String }) accessor searchQuery = ''
  @property({ type: String }) accessor editingCompanyId = ''
  @property({ type: String }) accessor editCompanyName = ''
  @property({ type: String }) accessor editCompanyDescription = ''
  @property({ type: String }) accessor editCompanyPlaceValue = ''
  @property({ type: Object }) accessor editCompanyPlace: Place | undefined
  @property({ type: Boolean }) accessor savingCompany = false

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
      button,
      input,
      textarea {
        font: inherit;
      }
      .page-header {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 20px 22px;
        overflow: hidden;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-panel);
        background: var(--app-panel);
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
      .page-icon {
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        flex: none;
        border-radius: var(--app-radius-control);
        color: var(--app-accent);
        background: var(--app-accent-soft);
        --custom-icon-color: currentColor;
        --custom-icon-size: 24px;
      }
      .eyebrow {
        color: var(--app-accent);
        font-size: 0.72rem;
        font-weight: 500;
        letter-spacing: 0;
      }
      h1 {
        margin-top: 3px;
        font-size: 1.75rem;
        font-weight: 600;
        line-height: 1.2;
        letter-spacing: 0;
      }
      .subtitle {
        margin-top: 6px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.88rem;
      }
      .primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 44px;
        padding: 0 16px;
        border: 1px solid var(--app-accent-strong);
        border-radius: var(--app-radius-control);
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .primary custom-icon {
        --custom-icon-color: currentColor;
        --custom-icon-size: 19px;
      }
      .search-wrap {
        position: relative;
        width: 100%;
      }
      .search-wrap custom-icon {
        position: absolute;
        top: 50%;
        left: 13px;
        transform: translateY(-50%);
        pointer-events: none;
        --custom-icon-size: 20px;
        --custom-icon-color: var(--md-sys-color-on-surface-variant);
      }
      .search {
        width: 100%;
        min-height: 44px;
        padding: 0 14px 0 42px;
        box-sizing: border-box;
        border: 1px solid var(--app-border);
        border-radius: 13px;
        background: var(--app-panel);
        color: var(--md-sys-color-on-surface);
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
      .count {
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.8rem;
        font-weight: 500;
      }
      .companies-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .company-card {
        position: relative;
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        min-height: 80px;
        padding: 12px 14px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-control);
        background: var(--app-panel);
        box-shadow: none;
        transition:
          background-color 160ms ease,
          border-color 160ms ease;
      }
      .company-card:hover {
        background: var(--app-panel-strong);
        border-color: color-mix(in srgb, var(--app-accent) 28%, var(--app-border) 72%);
      }
      .company-icon {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: var(--app-radius-control);
        background: var(--app-accent-soft);
        color: var(--app-accent);
        font-weight: 600;
        text-transform: uppercase;
      }
      .company-copy {
        min-width: 0;
      }
      .company-copy h3,
      .company-copy p {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .company-copy h3 {
        font-size: 0.95rem;
      }
      .company-copy p {
        margin-top: 5px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.78rem;
      }
      .card-actions {
        display: flex;
        gap: 7px;
      }
      .icon-action {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        padding: 0;
        border: 1px solid var(--app-border);
        border-radius: 10px;
        background: transparent;
        color: var(--md-sys-color-on-surface-variant);
        cursor: pointer;
      }
      .icon-action:hover {
        color: var(--app-accent);
        border-color: color-mix(in srgb, var(--app-accent) 40%, var(--app-border) 60%);
      }
      .icon-action.delete:hover {
        color: var(--md-sys-color-error);
        border-color: color-mix(in srgb, var(--md-sys-color-error) 40%, var(--app-border) 60%);
      }
      .icon-action custom-icon {
        --custom-icon-color: currentColor;
        --custom-icon-size: 18px;
      }
      .empty {
        padding: 48px 20px;
        border: 1px dashed var(--app-border);
        border-radius: 18px;
        color: var(--md-sys-color-on-surface-variant);
        text-align: center;
      }
      .editor-layer {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgb(0 0 0 / 56%);
      }
      .editor {
        display: flex;
        flex-direction: column;
        gap: 15px;
        width: min(100%, 560px);
        max-height: calc(100dvh - 36px);
        overflow: auto;
        padding: 20px;
        box-sizing: border-box;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-panel);
        background: var(--app-panel);
        box-shadow: var(--app-shadow-strong);
      }
      .editor-header,
      .editor-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .editor-header h2 { font-size: 1.2rem; }
      .editor-field {
        display: flex;
        flex-direction: column;
        gap: 7px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: .78rem;
        font-weight: 700;
      }
      .editor-field input,
      .editor-field textarea {
        width: 100%;
        padding: 0 12px;
        box-sizing: border-box;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-control);
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
      }
      .editor-field input { min-height: 44px; }
      .editor-field textarea { min-height: 92px; padding-top: 11px; resize: vertical; }
      .editor-actions { justify-content: flex-end; }
      .editor-actions button {
        min-height: 42px;
        padding: 0 15px;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-control);
        background: var(--app-panel-strong);
        color: inherit;
        font: inherit;
        font-weight: 700;
      }
      .editor-actions .save {
        border-color: var(--app-accent-strong);
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
      }
      button:focus-visible,
      input:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--app-accent) 23%, transparent 77%);
      }
      @media (max-width: 760px) {
        :host {
          padding: 12px;
        }
        .companies-grid {
          grid-template-columns: 1fr;
        }
        .page-header {
          padding: 16px;
          border-radius: var(--app-radius-panel);
        }
        .page-icon {
          display: none;
        }
        .primary {
          width: 44px;
          padding: 0;
        }
        .primary span {
          display: none;
        }
        .editor-layer { align-items: end; padding: 0; }
        .editor { width: 100%; max-height: 92dvh; border-radius: var(--app-radius-dialog) var(--app-radius-dialog) 0 0; }
      }
    `
  ]

  startEditingCompany(uuid: string, company: Company) {
    this.editingCompanyId = uuid
    this.editCompanyName = company.name || ''
    this.editCompanyDescription = company.description || ''
    this.editCompanyPlace = company.place
    this.editCompanyPlaceValue = company.place?.displayName || company.place?.formattedAddress || ''
  }

  cancelEditingCompany() {
    this.editingCompanyId = ''
    this.editCompanyPlace = undefined
  }

  async saveCompany() {
    const name = this.editCompanyName.trim()
    if (!this.editingCompanyId || !name || !this.editCompanyPlace?.id) {
      showToast('Vul een naam in en kies het adres uit de resultaten.')
      return
    }
    this.savingCompany = true
    try {
      const updated = await api.updateCompany(this.editingCompanyId, {
        name,
        description: this.editCompanyDescription.trim(),
        place: this.editCompanyPlace
      })
      this.companies = { ...this.companies, [this.editingCompanyId]: updated }
      this.cancelEditingCompany()
      showToast('Gegevens opgeslagen.')
    } catch (error) {
      console.error('Company update failed', error)
      showToast('De gegevens konden niet opgeslagen worden.')
    } finally {
      this.savingCompany = false
    }
  }

  renderCompanyCard(uuid: string, company: Company, relationshipType: 'customer' | 'supplier') {
    return html`<article class="company-card">
      <span class="company-icon">${(company.name || '?').charAt(0)}</span>
      <div class="company-copy">
        <h3>${company.name || (relationshipType === 'supplier' ? 'Naamloze leverancier' : 'Naamloze klant')}</h3>
        <p>${company.place?.formattedAddress || 'Geen adres ingesteld'}</p>
      </div>
      <div class="card-actions">
        <button class="icon-action" aria-label="${company.name} bewerken" @click=${() => this.startEditingCompany(uuid, company)}>
          <custom-icon icon="edit"></custom-icon>
        </button>
        <button class="icon-action delete" aria-label="${company.name} verwijderen" @click=${() => this._deleteCompany(uuid, relationshipType)}>
          <custom-icon icon="delete"></custom-icon>
        </button>
      </div>
    </article>`
  }

  renderCompanyEditor() {
    if (!this.editingCompanyId) return ''
    return html`<div class="editor-layer" role="presentation">
      <section class="editor" role="dialog" aria-modal="true" aria-labelledby="company-editor-title">
        <div class="editor-header"><div><span class="eyebrow">Gegevens aanpassen</span><h2 id="company-editor-title">${this.editCompanyName}</h2></div></div>
        <label class="editor-field">Naam<input .value=${this.editCompanyName} @input=${(event: Event) => (this.editCompanyName = (event.target as HTMLInputElement).value)} /></label>
        <label class="editor-field">Omschrijving<textarea .value=${this.editCompanyDescription} @input=${(event: Event) => (this.editCompanyDescription = (event.target as HTMLTextAreaElement).value)}></textarea></label>
        <data-input
          label="place"
          type="place"
          current-location
          .value=${this.editCompanyPlaceValue}
          .place=${this.editCompanyPlace}
          @data-input-changed=${(event: CustomEvent) => {
            this.editCompanyPlaceValue = event.detail.value
            this.editCompanyPlace = event.detail.place
          }}></data-input>
        <div class="editor-actions"><button @click=${() => this.cancelEditingCompany()}>Annuleren</button><button class="save" ?disabled=${this.savingCompany} @click=${() => void this.saveCompany()}>${this.savingCompany ? 'Opslaan…' : 'Opslaan'}</button></div>
      </section>
    </div>`
  }

  render() {
    const query = this.searchQuery.trim().toLowerCase()
    const entries = (Object.entries(this.companies || {}) as Array<[string, any]>)
      .filter(([, company]) => (company.relationshipType || 'customer') === 'customer')
      .filter(
        ([, company]) =>
          !query || `${company.name} ${company.place?.formattedAddress || ''}`.toLowerCase().includes(query)
      )
      .sort(([, left], [, right]) => (left.name || '').localeCompare(right.name || '', 'nl'))
    return html`
      <header class="page-header">
        <div class="page-heading">
          <span class="page-icon"><custom-icon icon="source_environment"></custom-icon></span>
          <div>
            <span class="eyebrow">Klantenbeheer</span>
            <h1>Klanten</h1>
            <p class="subtitle">${entries.length} klanten en locaties</p>
          </div>
        </div>
        <button
          class="primary"
          ?disabled=${this.creatingCompany}
          @click=${() => this._addCompany('customer')}>
          <custom-icon icon="add"></custom-icon><span>Nieuwe klant</span>
        </button>
      </header>
      <div class="search-wrap">
        <custom-icon icon="search"></custom-icon
        ><input
          class="search"
          type="search"
          placeholder="Zoek op naam of adres…"
          .value=${this.searchQuery}
          @input=${(event: Event) => (this.searchQuery = (event.target as HTMLInputElement).value)} />
      </div>
      <div class="list-heading">
        <h2>Klanten</h2>
        <span class="count">${entries.length} resultaten</span>
      </div>
      ${entries.length
        ? html`<section class="companies-grid">
            ${entries.map(([uuid, company]) => this.renderCompanyCard(uuid, company, 'customer'))}
          </section>`
        : html`<div class="empty">Geen klanten gevonden.</div>`}
      ${this.renderCompanyEditor()}
    `
  }
}

customElements.define('companies-view', CompaniesView)
