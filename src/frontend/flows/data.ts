import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/flex-elements/row.js'
import '@vandeurenglenn/flex-elements/container.js'
// @ts-ignore
import styles from './data.css' with { type: 'css' }

export class DataFlow extends LiteElement {
  @property({ type: Number }) accessor step = 0
  @property({ type: Array }) accessor steps: { name?: string; description?: string; template }[]
  @property() accessor data: Record<string, any> = {}
  @property() accessor label: string = 'Data Flow'
  @property() accessor _stepRender: any
  @property({ type: Boolean, reflect: true, attribute: 'is-first-step' }) accessor isFirstStep = true
  @property({ type: Boolean, reflect: true, attribute: 'is-last-step' }) accessor isLastStep = false
  stepResults: Record<string, any>[] = []

  _renders: any[] = []

  static styles = [styles]
  promise: Promise<void>

  nextStep() {
    if (this.isLastStep) return
    const step = this.steps?.[this.step]
    if (step?.validateAndReturnValues) {
      const inputs = this.shadowRoot.querySelectorAll('data-input')
      const { valid, values } = step.validateAndReturnValues(Array.from(inputs))

      this.stepResults[this.step] = values
    }
    this.step++
    this.isLastStep = this.step === this.steps?.length - 1
    this.isFirstStep = this.step === 0
    this._stepRender = this.steps?.[this.step]?.template
    this._renders[this.step] = this._stepRender
  }

  prevStep() {
    const step = this.steps?.[this.step]
    if (step?.validateAndReturnValues) {
      const data = {}

      const inputs = this.shadowRoot.querySelectorAll('data-input')
      const { valid, values } = step.validateAndReturnValues(Array.from(inputs))

      this.stepResults[this.step] = values
    }
    this.step--
    this.isLastStep = this.step === this.steps?.length - 1
    this.isFirstStep = this.step === 0
    this._stepRender = this.steps?.[this.step]?.template
    this._renders[this.step] = this._stepRender
  }

  onChange(propertyKey: string, value: any): void {
    if (propertyKey === '_stepRender' && this.stepResults[this.step]) {
      const inputs = this.shadowRoot.querySelectorAll('data-input')
      for (const input of Array.from(inputs)) {
        const key = input.getAttribute('label')
        if (key) {
          const value = this.stepResults[this.step][key]
          if (value) {
            input.value = value
          }
        }
      }
    }
  }

  private finishFlow() {
    // console.log('Collected data:', this.flowData)
  }

  firstRender(): void {
    this._stepRender = this.steps?.[this.step]?.template
    this._renders[this.step] = this._stepRender
  }

  render() {
    if (this.steps?.length === 0) return html`<p>No steps available</p>`
    return html`
      <div class="hero">
        <header>
          <h2>${this.label}</h2>
          <small>Step ${this.step + 1} of ${this.steps?.length || 1}</small>
        </header>

        <div class="step-info">

        ${this.steps?.[this.step]?.name ? html` <h3>${this.steps?.[this.step]?.name}</h3> ` : ''}
        ${this.steps?.[this.step]?.description ? html` <p>${this.steps?.[this.step]?.description}</p> ` : ''}
        </div>
        ${this._stepRender}

        <footer>
          ${!this.isFirstStep
            ? html`
                <custom-icon-button
                  icon="arrow-back"
                  @click=${() => this.prevStep()}
                  >Previous</custom-icon-button
                >
              `
            : ''}
          <custom-icon-button
            .icon=${this.isLastStep ? 'save' : 'arrow-forward'}
            @click=${this.isLastStep ? () => this.finishFlow() : () => this.nextStep()}>
          </custom-icon-button>
        </footer>
      </div>
    `
  }
}

customElements.define('data-flow', DataFlow)
