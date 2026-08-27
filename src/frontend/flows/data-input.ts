import { html, css, LiteElement, property, query } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/dropdown.js'
import { CustomDropdown } from '@vandeurenglenn/lite-elements/dropdown.js'

import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/lite-elements/list-item.js'
import { CustomSelector } from '@vandeurenglenn/lite-elements/selector'
import '@vandeurenglenn/lite-elements/selector.js'
import '@material/web/textfield/outlined-text-field.js'
import type { Place } from '../../types/index.js'

declare const google: typeof globalThis.google

export class DataInput extends LiteElement {
  @property({ type: String }) accessor label = ''

  @property({ type: String }) accessor value = ''

  @property({ type: String }) accessor type: 'text' | 'number' | 'place' = 'text'

  @property({ type: Object }) accessor place: Place

  timeout?: ReturnType<typeof setTimeout>
  suggestions: any[] = []

  @query('custom-dropdown') accessor dropdown: CustomDropdown
  @query('custom-selector') accessor selector: CustomSelector

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      .input {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
      }

      li {
        appearance: none;
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        box-sizing: border-box;
        border: 1px solid color-mix(in srgb, var(--app-border) 80%, transparent 20%);
        border-radius: 18px;
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--app-panel-strong) 94%, white 6%),
          var(--app-panel-strong)
        );
        box-shadow: var(--app-shadow-soft);
        cursor: pointer;
        transition:
          transform 0.18s ease,
          border-color 0.18s ease,
          box-shadow 0.18s ease;
      }

      li:hover {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--app-accent) 38%, var(--app-border) 62%);
        box-shadow: var(--app-shadow-strong);
      }

      li * {
        pointer-events: none;
      }

      li .body {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      li .title {
        font-weight: 700;
        color: var(--md-sys-color-on-surface);
      }

      li .subtitle {
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.45;
      }

      custom-dropdown {
        overflow-y: auto;
        max-height: 300px;
        border-radius: var(--app-radius-dialog);
        background: color-mix(in srgb, var(--app-panel) 94%, white 6%);
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        box-shadow: var(--app-shadow-strong);
      }

      custom-selector {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px;
      }

      md-outlined-text-field {
        width: 100%;
        max-width: none;
      }

      custom-icon {
        margin-left: 0;
      }

      p {
        margin: 0;
        padding: 12px 14px;
        border-radius: 16px;
        background: color-mix(in srgb, var(--app-accent) 10%, var(--app-panel) 90%);
        border: 1px solid color-mix(in srgb, var(--app-border) 80%, transparent 20%);
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.5;
      }

      @media (max-width: 720px) {
        li {
          padding: 12px 14px;
          border-radius: 16px;
        }

        custom-selector {
          padding: 8px;
        }
      }
    `
  ]

  _change = (e: Event) => {
    const value = (e.target as HTMLInputElement).value

    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = setTimeout(async () => {
      this.value = value
      this.dispatchEvent(
        new CustomEvent('data-input-changed', {
          detail: { value: this.value },
          bubbles: true,
          composed: true
        })
      )
      if (this.type === 'place') {
        // Add an initial request body.
        const { Place, AutocompleteSessionToken, AutocompleteSuggestion } = await google.maps.importLibrary('places')
        let request = {
          input: this.value
        }

        // Create a session token.
        const token = new AutocompleteSessionToken()
        // Add the token to the request.
        // @ts-ignore
        request.sessionToken = token
        // Fetch autocomplete suggestions.
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request)

        const selector = this.selector
        selector.innerHTML = '' // Clear previous results.
        this.suggestions = suggestions
        let i = 0
        for (let suggestion of suggestions) {
          const placePrediction = suggestion.placePrediction
          console.log(placePrediction)

          // Create a new list element.
          const listItem = document.createElement('li')
          const body = `
        <custom-icon icon="location_on"></custom-icon>
        <div class="body">
          <div class="title">${placePrediction.mainText}</div>
          <div class="subtitle">${placePrediction.secondaryText}</div>
        </div>
        `
          listItem.innerHTML = body
          listItem.dataset.index = i.toString()
          i++
          selector.appendChild(listItem)
        }

        if (suggestions.length > 0) {
          // @ts-ignore

          this.dropdown.open = true
        }
        // let place = suggestions[0].placePrediction.toPlace() // Get first predicted place.
        // await place.fetchFields({
        //   fields: ['displayName', 'formattedAddress']
        // })
      }
    }, 300)
  }

  select = async (event: CustomEvent) => {
    console.log(event.detail)
    let place = this.suggestions[event.detail].placePrediction.toPlace() // Get first predicted place.
    const fields = await place.fetchFields({
      fields: ['id', 'displayName', 'formattedAddress', 'location']
    })
    console.log(fields)

    console.log(fields.place.displayName)

    const selectedPlace = fields.place
    this.place = {
      id: selectedPlace.id,
      displayName: selectedPlace.displayName,
      formattedAddress: selectedPlace.formattedAddress,
      location: selectedPlace.location
        ? {
            latitude: selectedPlace.location.lat(),
            longitude: selectedPlace.location.lng()
          }
        : undefined
    }

    this.value = selectedPlace.displayName
    this.dispatchEvent(
      new CustomEvent('data-input-changed', {
        detail: { value: this.value },
        bubbles: true,
        composed: true
      })
    )
    this.dropdown.open = false
  }
  render() {
    const displayLabel = ({ name: 'Naam', place: 'Locatie', description: 'Omschrijving', telephone: 'Telefoon' } as Record<string, string>)[this.label] || this.label
    return html`
      <div class="input">
        <md-outlined-text-field
          @input=${(e) => this._change(e)}
          .type=${this.type}
          .label=${displayLabel}
          .value=${this.value}>
          ${this.type === 'place'
            ? html`<custom-icon
                slot="leading-icon"
                icon="location_on"></custom-icon>`
            : html`<custom-icon
                slot="leading-icon"
                icon="info"></custom-icon>`}</md-outlined-text-field
        >

        <custom-dropdown
          ><custom-selector
            attr-for-selected="data-index"
            @selected=${(event) => this.select(event)}></custom-selector>
        </custom-dropdown>

        ${this.type === 'place' && this.place?.formattedAddress ? html`<p>${this.place.formattedAddress}</p>` : ''}
      </div>
    `
  }
}
customElements.define('data-input', DataInput)
