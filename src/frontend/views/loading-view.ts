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
        padding: 20px 24px;
        border-radius: var(--app-radius-panel);
        background: var(--app-panel);
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-soft);
      }

      h1 {
        font-size: 1.35rem;
        font-weight: 600;
      }

      .loader {
        border: 4px solid var(--app-accent-soft);
        border-top-color: var(--app-accent);
        border-radius: 50%;
        width: 30px;
        height: 30px;
        animation: spin .8s linear infinite;
        margin-top: 6px;
      }
      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .loader {
          animation-duration: 1.6s;
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
        ${this.type === 'signin' ? html`<h1>Welkom terug</h1>` : html`<h1>Even laden</h1>`}
        <p>
          ${this.type === 'signin'
            ? html`We melden je veilig aan.`
            : html`We halen de nieuwste gegevens op.`}
        </p>
        <div class="loader"></div>
      </div>
    `
  }
}

customElements.define('loading-view', LoadingView)
