import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/fab/fab.js'
import '@vandeurenglenn/lite-elements/icon.js'
import '../flows/data.js'
import '../flows/data-input.js'
export class JobsView extends LiteElement {
  @property({ type: Boolean }) accessor creatingJob = false
  @property({ type: Array }) accessor steps = [
    {
      name: 'Basic Info',
      template: html`<data-input label="name"></data-input> `,
      validateAndReturnValues: (inputs) => {
        const data = {}

        for (const input of inputs) {
          data[input.label] = input.value
          if (!data[input.label]) {
            return { valid: false, values: data }
          }
        }
        return { valid: true, values: data }
      }
    },
    {
      name: 'Address',
      template: html` <flex-row
          ><data-input
            label="street"
            type="place"></data-input>
          <data-input
            label="number"
            type="number"></data-input>
        </flex-row>
        <flex-row>
          <data-input
            label="postcode"
            type="number"></data-input>
          <data-input
            label="city"
            auto-complete></data-input>
        </flex-row>
        <data-input label="state"></data-input>`,

      validateAndReturnValues: (inputs) => {
        const data = {}

        for (const input of inputs) {
          data[input.label] = input.value
          if (!data[input.label]) {
            return { valid: false, values: data }
          }
        }
        return { valid: true, values: data }
      }
    },
    {
      name: 'Step 3',
      description: 'Description for step 3',
      template: html`<p>Step 3 content</p>`,
      validateAndReturnValues: (inputs) => {
        const data = {}

        for (const input of inputs) {
          data[input.label] = input.value
          if (!data[input.label]) {
            return { valid: false, values: data }
          }
        }
        return { valid: true, values: data }
      }
    }
  ]
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      md-fab {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000;
      }
      /* Add your styles here */
    `
  ]

  _createJob = () => {
    this.creatingJob = true
    console.log('Creating a new job...')
    // You can add your logic here to create a new job
  }

  _handleFabKeyUp = (event) => {
    if (event.key === 'Enter' || event.key === 'Space') {
      event.preventDefault()
      this._createJob()
    }
  }

  render() {
    if (this.creatingJob)
      return html`<data-flow
        .steps=${this.steps}
        label="Adding Job"></data-flow>`
    return html`
      <md-fab
        icon="add"
        @click=${() => this._createJob()}
        @keyup=${(event) => this._handleFabKeyUp(event)}>
        <custom-icon
          icon="add"
          slot="icon"></custom-icon
      ></md-fab>
    `
  }
}

customElements.define('jobs-view', JobsView)
