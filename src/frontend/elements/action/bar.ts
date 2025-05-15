import { LiteElement, html, css, property, assignedElements } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/dropdown-menu.js'

export class ActionBar extends LiteElement {
  @property({ type: Boolean, reflect: true }) accessor overflows

  currentWidth: number
  maxWidth: number
  resizeTimeout
  itemWidths: { el: HTMLElement; width: number }[]

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        gap: 6px;
        align-items: center;
        padding: 16px;
        background-color: var(--md-sys-color-surface);
        color: var(--md-sys-color-on-surface);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        border-radius: var(--md-sys-shape-corner-small);
        width: 100%;
        height: 56px;
        box-sizing: border-box;
      }

      custom-dropdown-menu::part(dropdown) {
        max-height: 300px;
        overflow-y: auto;
      }
    `
  ]

  render() {
    return html`
      <slot></slot>
      <slot name="leading"></slot>
      ${this.overflows
        ? html`<custom-dropdown-menu right>
            <slot name="dropdown"></slot>
          </custom-dropdown-menu>`
        : ''}
    `
  }

  moveChildren() {
    const leadingSlot = this.shadowRoot.querySelector('slot[name="leading"]') as HTMLSlotElement
    const leadingSlotElements = leadingSlot.assignedElements()
    const dropdownSlot = this.shadowRoot.querySelector('slot[name="dropdown"]') as HTMLSlotElement
    const dropdownSlotElements = dropdownSlot.assignedElements()
  }

  onresize = (event) => {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout)
    }

    const rect = this.getBoundingClientRect()
    this.resizeTimeout = setTimeout(() => {
      const totalWidth = this.itemWidths.reduce((acc, { width }) => acc + width, 0)
      const availableWidth = rect.width - 32 // 16px padding on each side
      console.log('availableWidth', availableWidth)
      console.log('totalWidth', totalWidth)

      this.overflows = totalWidth > availableWidth
      const maxWidth = this.overflows ? availableWidth - 32 : availableWidth
      let currentWidth = 0

      for (const { el, width } of this.itemWidths) {
        if (width + currentWidth <= maxWidth) {
          el.setAttribute('slot', 'leading')
          currentWidth += width

          el.removeAttribute('in-dropdown')
        } else {
          el.setAttribute('in-dropdown', '')
          el.setAttribute('slot', 'dropdown')
        }
      }
      this.currentWidth = currentWidth
      this.maxWidth = maxWidth
    }, 200)
  }

  async setup() {
    const elements = Array.from(this.shadowRoot.querySelector('slot').assignedElements()) as HTMLElement[]
    const rect = this.getBoundingClientRect()

    // we are only interested in the initial width of the elements to calculate if they can be put in the bar
    // when in dropdown we don't care about the width...
    this.itemWidths = elements.map((el) => ({ el, width: el.getBoundingClientRect().width + 6 })) as {
      el: HTMLElement
      width: number
    }[]
    console.log('itemWidths', this.itemWidths)

    const totalWidth = this.itemWidths.reduce((acc, { width }) => acc + width, 0)
    const availableWidth = rect.width - 32 // 16px padding on each side
    this.overflows = totalWidth > availableWidth
    const maxWidth = this.overflows ? availableWidth - 32 : availableWidth
    let currentWidth = 0

    for (const { el, width } of this.itemWidths) {
      if (width + currentWidth <= maxWidth) {
        el.setAttribute('slot', 'leading')
        currentWidth += width
      } else {
        el.setAttribute('slot', 'dropdown')
      }
    }
    this.currentWidth = currentWidth
    this.maxWidth = maxWidth
  }
  firstRender() {
    this.setAttribute('role', 'toolbar')
    this.setAttribute('aria-label', 'Action Bar')
    this.setup()

    this.shadowRoot.querySelector('slot[name="leading"]').addEventListener('slotchange', () => {
      this.shadowRoot
        .querySelector('slot[name="leading"]')
        .assignedElements()
        .forEach((el) => {
          if (el.hasAttribute('in-dropdown')) {
            el.inDropdown = false
          }
        })
    })

    this.shadowRoot.querySelector('slot[name="dropdown"]').addEventListener('slotchange', () => {
      this.shadowRoot
        .querySelector('slot[name="dropdown"]')
        .assignedElements()
        .forEach((el) => {
          if (!el.hasAttribute('in-dropdown')) {
            el.inDropdown = true
          }
        })
    })

    globalThis.addEventListener('resize', this.onresize)
  }
}
customElements.define('action-bar', ActionBar)
