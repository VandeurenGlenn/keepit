import { html, css, LiteElement, property, query } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/dropdown.js'
import { CustomDropdown } from '@vandeurenglenn/lite-elements/dropdown.js'

import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/lite-elements/list-item.js'
import { CustomSelector } from '@vandeurenglenn/lite-elements/selector'
import '@vandeurenglenn/lite-elements/selector.js'
import '@material/web/textfield/outlined-text-field.js'
import type { Place } from '../../types/index.js'
import { api } from '../api/client.js'
import { getPlaceSearchSettings } from '../helpers/place-settings.js'

declare const google: typeof globalThis.google

export class DataInput extends LiteElement {
  @property({ type: String }) accessor label = ''

  @property({ type: String }) accessor value = ''

  @property({ type: String }) accessor type: 'text' | 'number' | 'place' | 'select' = 'text'

  @property({ type: Array }) accessor options: Array<{ value: string; label: string }> = []

  @property({ type: Object }) accessor place: Place

  @property({ type: Boolean, attribute: 'current-location' }) accessor currentLocation = false

  @property({ type: Boolean }) accessor locating = false

  @property({ type: String }) accessor placeMessage = ''

  timeout?: ReturnType<typeof setTimeout>
  suggestions: any[] = []
  autocompleteSessionToken?: any
  searchRequestId = 0

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

      .select-field {
        display: flex;
        flex-direction: column;
        gap: 7px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: .78rem;
        font-weight: 700;
      }

      .select-field select {
        width: 100%;
        min-height: 56px;
        padding: 0 14px;
        box-sizing: border-box;
        border: 1px solid var(--app-border);
        border-radius: var(--app-radius-control);
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
      }

      custom-icon {
        margin-left: 0;
      }

      .selected-place,
      .place-message {
        margin: 0;
        padding: 12px 14px;
        border-radius: 16px;
        background: color-mix(in srgb, var(--app-accent) 10%, var(--app-panel) 90%);
        border: 1px solid color-mix(in srgb, var(--app-border) 80%, transparent 20%);
        color: var(--md-sys-color-on-surface-variant);
        line-height: 1.5;
      }

      .place-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .current-location {
        min-height: 42px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 0 14px;
        border: 1px solid color-mix(in srgb, var(--app-accent) 42%, var(--app-border) 58%);
        border-radius: var(--app-radius-control);
        background: color-mix(in srgb, var(--app-accent) 10%, var(--app-panel) 90%);
        color: var(--app-accent-strong);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .current-location:hover:not(:disabled) {
        background: color-mix(in srgb, var(--app-accent) 16%, var(--app-panel) 84%);
      }

      .current-location:disabled {
        cursor: wait;
        opacity: 0.68;
      }

      .place-message {
        padding: 10px 12px;
        color: var(--md-sys-color-error);
        background: color-mix(in srgb, var(--md-sys-color-error) 9%, var(--app-panel) 91%);
        border-color: color-mix(in srgb, var(--md-sys-color-error) 36%, var(--app-border) 64%);
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

    // Keep normal form values in sync immediately. Previously every value was
    // delayed by the places debounce, so a quick submit could send stale data.
    this.value = value
    if (this.type === 'place') this.place = undefined
    this.dispatchEvent(
      new CustomEvent('data-input-changed', {
        detail: { value: this.value, place: this.place },
        bubbles: true,
        composed: true
      })
    )

    if (this.type !== 'place') return

    if (this.timeout) clearTimeout(this.timeout)
    const requestId = ++this.searchRequestId
    this.timeout = setTimeout(async () => {
      const input = this.value.trim()
      if (input) {
        try {
          const { AutocompleteSessionToken, AutocompleteSuggestion } = await google.maps.importLibrary('places')
          const preferences = await getPlaceSearchSettings()
          this.autocompleteSessionToken ||= new AutocompleteSessionToken()
          const request = {
            input,
            sessionToken: this.autocompleteSessionToken,
            ...(preferences.countryCode ? { includedRegionCodes: [preferences.countryCode] } : {}),
            language: preferences.language,
            region: preferences.countryCode
          }
          const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request as any)
          if (requestId !== this.searchRequestId) return
          this.renderSuggestions(response.suggestions)
          this.placeMessage = response.suggestions.length
            ? ''
            : 'Geen adres gevonden. Voeg ook de gemeente of postcode toe.'
        } catch (error) {
          if (requestId !== this.searchRequestId) return
          console.error('Adres zoeken mislukt:', error)
          this.renderSuggestions([])
          this.placeMessage = this.currentLocation
            ? 'Adres zoeken lukt momenteel niet. Probeer opnieuw of gebruik je huidige locatie.'
            : 'Adres zoeken lukt momenteel niet. Probeer het opnieuw.'
        }
      } else {
        this.suggestions = []
        this.autocompleteSessionToken = undefined
        this.selector.innerHTML = ''
        this.dropdown.open = false
        this.placeMessage = ''
      }
    }, 300)
  }

  renderSuggestions(suggestions: any[]) {
    const selector = this.selector
    selector.innerHTML = ''
    this.suggestions = suggestions

    suggestions.forEach((suggestion, index) => {
      const placePrediction = suggestion.placePrediction
      const listItem = document.createElement('li')
      const icon = document.createElement('custom-icon')
      icon.setAttribute('icon', 'location_on')
      const body = document.createElement('div')
      body.className = 'body'
      const title = document.createElement('div')
      title.className = 'title'
      title.textContent = String(placePrediction.mainText || '')
      const subtitle = document.createElement('div')
      subtitle.className = 'subtitle'
      subtitle.textContent = String(placePrediction.secondaryText || '')
      body.append(title, subtitle)
      listItem.append(icon, body)
      listItem.dataset.index = String(index)
      selector.appendChild(listItem)
    })

    this.dropdown.open = suggestions.length > 0
  }

  select = async (event: CustomEvent) => {
    let place = this.suggestions[event.detail].placePrediction.toPlace() // Get first predicted place.
    const fields = await place.fetchFields({
      fields: ['id', 'displayName', 'formattedAddress', 'location']
    })
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
    this.placeMessage = ''
    this.suggestions = []
    this.autocompleteSessionToken = undefined
    this.dispatchEvent(
      new CustomEvent('data-input-changed', {
        detail: { value: this.value, place: this.place },
        bubbles: true,
        composed: true
      })
    )
    this.dropdown.open = false
  }

  useCurrentLocation = async () => {
    if (this.locating) return
    if (!('geolocation' in navigator)) {
      this.placeMessage = 'Deze browser ondersteunt geen huidige locatie.'
      return
    }

    this.locating = true
    this.placeMessage = ''
    this.searchRequestId++
    if (this.timeout) clearTimeout(this.timeout)
    try {
      const location = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 60_000
        })
      })
      const preferences = await getPlaceSearchSettings()
      const place = await api.reverseGeocode({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        capturedAt: location.timestamp
      }, preferences)
      this.place = place
      this.value = place.displayName
      this.suggestions = []
      this.autocompleteSessionToken = undefined
      this.selector.innerHTML = ''
      this.dropdown.open = false
      this.dispatchEvent(
        new CustomEvent('data-input-changed', {
          detail: { value: this.value, place: this.place },
          bubbles: true,
          composed: true
        })
      )
    } catch (error) {
      const geolocationError = error as Partial<GeolocationPositionError> | undefined
      if (geolocationError?.code === 1) {
        this.placeMessage = 'Locatietoegang is geweigerd. Sta locatie toe in je browser of zoek het adres.'
      } else {
        this.placeMessage = error instanceof Error
          ? error.message
          : 'Je huidige locatie kon niet worden bepaald. Zoek het adres handmatig.'
      }
    } finally {
      this.locating = false
    }
  }
  render() {
    const displayLabel = ({ name: 'Naam', place: 'Locatie', description: 'Omschrijving', telephone: 'Telefoon', customerId: 'Klant' } as Record<string, string>)[this.label] || this.label
    return html`
      <div class="input">
        ${this.type === 'select'
          ? html`<label class="select-field">${displayLabel}<select .value=${this.value} @change=${(event: Event) => this._change(event)}>${this.options.map((option) => html`<option value=${option.value}>${option.label}</option>`)}</select></label>`
          : html`<md-outlined-text-field
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
                icon="info"></custom-icon>`}</md-outlined-text-field>`}

        <custom-dropdown
          ><custom-selector
            attr-for-selected="data-index"
            @selected=${(event) => this.select(event)}></custom-selector>
        </custom-dropdown>

        ${this.type === 'place' && this.currentLocation
          ? html`<div class="place-actions">
              <button
                class="current-location"
                type="button"
                ?disabled=${this.locating}
                @click=${() => this.useCurrentLocation()}>
                <custom-icon icon="my_location"></custom-icon>
                ${this.locating ? 'Locatie bepalen…' : 'Gebruik huidige locatie'}
              </button>
            </div>`
          : ''}
        ${this.type === 'place' && this.placeMessage
          ? html`<p class="place-message" role="alert">${this.placeMessage}</p>`
          : ''}
        ${this.type === 'place' && this.place?.formattedAddress
          ? html`<p class="selected-place"><strong>Geselecteerd:</strong> ${this.place.formattedAddress}</p>`
          : ''}
      </div>
    `
  }
}
customElements.define('data-input', DataInput)
