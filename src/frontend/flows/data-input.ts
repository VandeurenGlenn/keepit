import { html, css, LiteElement, property, query } from '@vandeurenglenn/lite'
import '@vandeurenGlenn/lite-elements/dropdown.js'
import { CustomDropdown } from '@vandeurenGlenn/lite-elements/dropdown.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '@vandeurenglenn/lite-elements/list-item.js'
import { CustomSelector } from '@vandeurenglenn/lite-elements/selector'
import '@vandeurenglenn/lite-elements/selector.js'
export class DataInput extends LiteElement {
  @property({ type: String }) accessor label = ''
  @property({ type: String }) accessor value = ''
  @property({ type: String }) accessor type: HTMLInputElement['type'] = 'text'

  @query('custom-dropdown') accessor dropdown: CustomDropdown
  @query('custom-selector') accessor selector: CustomSelector
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      li {
        appearance: none;
        display: flex;
        flex-direction: row;
        padding: 16px;
        box-sizing: border-box;
        border-bottom: 1px solid var(--md-sys-color-outline);
        cursor: pointer;
      }

      custom-icon {
        margin-right: 12px;
      }

      custom-dropdown {
        overflow-y: auto;
        max-height: 300px;
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
    }, 500)
  }

  select = (event: CustomEvent) => {
    console.log(event.detail)

    const selectedValue = event.detail.value
    this.value = selectedValue
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
    return html`
      <div class="input-container">
        <md-outlined-text-field
          @input=${(e) => this._change(e)}
          .type=${this.type}
          .label=${this.label}
          .value=${this.value}></md-outlined-text-field>

        <custom-dropdown
          ><custom-selector @selected=${(event) => this.select(event)}></custom-selector>
        </custom-dropdown>
      </div>
    `
  }
}
customElements.define('data-input', DataInput)
