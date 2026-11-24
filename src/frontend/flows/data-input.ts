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
import { LatestOperation } from '../helpers/latest-operation.js'

declare const google: typeof globalThis.google

export class DataInput extends LiteElement {
  @property({ type: String }) accessor label = ''
  @property({ type: String, attribute: 'display-label' }) accessor displayLabel = ''

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
  private readonly placeOperation = new LatestOperation()

  disconnectedCallback() {
    this.placeOperation.cancel()
    clearTimeout(this.timeout)
    this.locating = false
    this.autocompleteSessionToken = undefined
    this.renderSuggestions([])
    super.disconnectedCallback()
  }

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

    clearTimeout(this.timeout)
    const signal = this.placeOperation.begin()
    this.locating = false
    this.placeMessage = ''
    this.renderSuggestions([])
    const input = value.trim()
    if (!input) {
      this.autocompleteSessionToken = undefined
      return
    }
    this.timeout = setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = await google.maps.importLibrary('places')
        if (signal.aborted) return
        const preferences = await getPlaceSearchSettings()
        if (signal.aborted) return
        this.autocompleteSessionToken ||= new AutocompleteSessionToken()
        const request = {
          input,
          sessionToken: this.autocompleteSessionToken,
          ...(preferences.restrictedCountryCode ? { includedRegionCodes: [preferences.restrictedCountryCode] } : {}),
          language: preferences.language,
          region: preferences.countryCode
        }
        const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request as any)
        if (signal.aborted) return
        const suggestions = response.suggestions.filter((suggestion) => suggestion.placePrediction)
        this.renderSuggestions(suggestions)
        this.placeMessage = suggestions.length
          ? ''
          : 'Geen adres gevonden. Voeg ook de gemeente of postcode toe.'
      } catch (error) {
        if (signal.aborted) return
        console.error('Adres zoeken mislukt:', error)
        this.renderSuggestions([])
        this.placeMessage = this.currentLocation
          ? 'Adres zoeken lukt momenteel niet. Probeer opnieuw of gebruik je huidige locatie.'
          : 'Adres zoeken lukt momenteel niet. Probeer het opnieuw.'
      }
    }, 300)
  }

  renderSuggestions(suggestions: any[]) {
    this.suggestions = suggestions
    const selector = this.selector
    if (!selector || !this.dropdown) return
    selector.replaceChildren()

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
    const prediction = this.suggestions[event.detail]?.placePrediction
    if (!prediction) return
    const signal = this.placeOperation.begin()
    clearTimeout(this.timeout)
    this.locating = false
    this.renderSuggestions([])
    this.autocompleteSessionToken = undefined
    try {
      const { place } = await prediction.toPlace().fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'location']
      })
      if (signal.aborted) return
      this.applyPlace({
        id: place.id,
        displayName: place.displayName,
        formattedAddress: place.formattedAddress,
        location: place.location ? { latitude: place.location.lat(), longitude: place.location.lng() } : undefined
      })
    } catch {
      if (!signal.aborted) this.placeMessage = 'Dit adres kon niet worden geladen. Zoek opnieuw of gebruik je huidige locatie als die optie beschikbaar is.'
    }
  }

  private applyPlace(place: Place) {
    if (!place?.id || !place.formattedAddress) throw new Error('Er is geen volledig adres gevonden.')
    this.place = place
    this.value = place.displayName || place.formattedAddress
    this.placeMessage = ''
    this.renderSuggestions([])
    this.autocompleteSessionToken = undefined
    this.dispatchEvent(
      new CustomEvent('data-input-changed', {
        detail: { value: this.value, place: this.place },
        bubbles: true,
        composed: true
      })
    )
  }

  useCurrentLocation = async () => {
    if (this.locating) return
    if (!('geolocation' in navigator)) {
      this.placeMessage = 'Deze browser ondersteunt geen huidige locatie.'
      return
    }

    this.locating = true
    this.placeMessage = ''
    const signal = this.placeOperation.begin()
    clearTimeout(this.timeout)
    this.renderSuggestions([])
    try {
      const location = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12_000,
          maximumAge: 60_000
        })
      })
      if (signal.aborted) return
      const preferences = await getPlaceSearchSettings()
      if (signal.aborted) return
      const place = await api.reverseGeocode({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        capturedAt: location.timestamp
      }, { countryCode: preferences.countryCode, language: preferences.language }, signal)
      if (!signal.aborted) this.applyPlace(place)
    } catch (error) {
      if (signal.aborted) return
      const geolocationError = error as Partial<GeolocationPositionError> | undefined
      if (geolocationError?.code === 1) {
        this.placeMessage = 'Locatietoegang is geweigerd. Sta locatie toe in je browser of zoek het adres.'
      } else {
        this.placeMessage = error instanceof Error
          ? error.message
          : 'Je huidige locatie kon niet worden bepaald. Zoek het adres handmatig.'
      }
    } finally {
      if (!signal.aborted) this.locating = false
    }
  }
  render() {
    const displayLabel = this.displayLabel || ({ name: 'Naam', place: 'Locatie', description: 'Omschrijving', telephone: 'Telefoon', customerId: 'Klant' } as Record<string, string>)[this.label] || this.label
    return html`
      <div class="input">
        ${this.type === 'select'
          ? html`<label class="select-field">${displayLabel}<select .value=${this.value} @change=${(event: Event) => this._change(event)}>${this.options.map((option) => html`<option value=${option.value}>${option.label}</option>`)}</select></label>`
          : html`<md-outlined-text-field
          @input=${(e) => this._change(e)}
          .type=${this.type === 'place' ? 'text' : this.type}
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
