import { LiteElement, html, css, property } from '@vandeurenglenn/lite'

export class LoadingView extends LiteElement {
  @property() accessor type
  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
        color: var(--md-sys-color-on-background);
        padding: 16px;
        box-sizing: border-box;
        text-align: center;
      }

      .loading-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 24px 28px;
        border-radius: 24px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--app-panel) 96%, white 4%), var(--app-panel));
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-strong);
      }

      .loader {
        border: 16px solid var(--md-sys-color-tertiary);
        border-top: 16px solid var(--md-sys-color-on-tertiary);
        border-radius: 50%;
        width: 60px;
        height: 60px;
        animation: spin 2s linear infinite;
        margin-top: 20px;
      }
      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }

      h1,
      p {
        margin: 0;
      }

      p {
        color: var(--md-sys-color-on-surface-variant);
        max-width: 32ch;
      }
    `
  ]

  render() {
    return html`
      <div class="loading-panel">
        ${this.type === 'signin' ? html`<h1>Welcome back!</h1>` : html`<h1>Loading...</h1>`}
        <p>
          ${this.type === 'signin'
            ? html`Please wait while we sign you in.`
            : html`Please wait while we load the content for you.`}
        </p>
        <div class="loader"></div>
      </div>
    `
  }
}

customElements.define('loading-view', LoadingView)
