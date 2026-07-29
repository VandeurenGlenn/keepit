import { html } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { CompaniesView } from './companies-view.js'

export class SuppliersView extends CompaniesView {
  render() {
    const query = this.searchQuery.trim().toLowerCase()
    const entries = (Object.entries(this.companies || {}) as Array<[string, any]>)
      .filter(([, company]) => company.relationshipType === 'supplier')
      .filter(([, company]) =>
        !query || `${company.name} ${company.place?.formattedAddress || ''}`.toLowerCase().includes(query)
      )
      .sort(([, left], [, right]) => (left.name || '').localeCompare(right.name || '', 'nl'))

    return html`
      <header class="page-header">
        <div class="page-heading"><span class="page-icon"><custom-icon icon="local_shipping"></custom-icon></span><div><span class="eyebrow">Inkoop</span><h1>Leveranciers</h1><p class="subtitle">${entries.length} leveranciers en afhaallocaties</p></div></div>
        <button class="primary" ?disabled=${this.creatingCompany} @click=${() => this._addCompany('supplier')}><custom-icon icon="add"></custom-icon><span>Nieuwe leverancier</span></button>
      </header>
      <div class="search-wrap"><custom-icon icon="search"></custom-icon><input class="search" type="search" placeholder="Zoek leverancier of adres…" .value=${this.searchQuery} @input=${(event:Event)=>(this.searchQuery=(event.target as HTMLInputElement).value)} /></div>
      <div class="list-heading"><h2>Leveranciers</h2><span class="count">${entries.length} resultaten</span></div>
      ${entries.length
        ? html`<section class="companies-grid">${entries.map(([uuid,company])=>html`<article class="company-card"><span class="company-icon">${(company.name || '?').charAt(0)}</span><div class="company-copy"><h3>${company.name || 'Naamloze leverancier'}</h3><p>${company.place?.formattedAddress || 'Geen adres ingesteld'}</p></div><button class="delete" aria-label="${company.name} verwijderen" @click=${()=>this._deleteCompany(uuid,'supplier')}><custom-icon icon="delete"></custom-icon></button></article>`)}</section>`
        : html`<div class="empty">Geen leveranciers gevonden.</div>`}
    `
  }
}

customElements.define('suppliers-view', SuppliersView)
