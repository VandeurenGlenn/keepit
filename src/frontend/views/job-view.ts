import { LiteElement, html, css, property } from '@vandeurenglenn/lite'
import '@vandeurenglenn/lite-elements/icon.js'
import { Job, MaterialLine, Prestation, ShopProduct, User } from '../../types/index.js'
import { api } from '../api/client.js'

function msToTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-'
  const seconds = ms / 1000
  const minutes = ms / 60_000
  if (seconds < 60) return `${Math.round(seconds)} sec`
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = ms / 3_600_000
  return `${hours.toLocaleString('nl-BE', { maximumFractionDigits: 1 })} u`
}

const getPrestationDuration = (prestation: Prestation): number => {
  if (typeof prestation.duration === 'number' && Number.isFinite(prestation.duration)) {
    return prestation.duration
  }

  const checkin = Number(prestation.checkin)
  const checkout = prestation.checkout !== undefined ? Number(prestation.checkout) : Number.NaN

  if (Number.isFinite(checkin) && Number.isFinite(checkout)) {
    return Math.max(0, checkout - checkin)
  }

  return Number.NaN
}

const formatPrestationRange = (checkinValue?: number, checkoutValue?: number): string => {
  if (typeof checkinValue !== 'number' || !Number.isFinite(checkinValue)) return '-'

  const checkin = new Date(checkinValue)
  const checkout =
    typeof checkoutValue === 'number' && Number.isFinite(checkoutValue)
      ? new Date(checkoutValue)
      : undefined
  const dateFormatter = new Intl.DateTimeFormat('nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
    hour: '2-digit',
    minute: '2-digit'
  })

  if (!checkout) return `${dateFormatter.format(checkin)} · ${timeFormatter.format(checkin)}`
  if (dateFormatter.format(checkin) === dateFormatter.format(checkout)) {
    return `${dateFormatter.format(checkin)} · ${timeFormatter.format(checkin)}–${timeFormatter.format(checkout)}`
  }

  return `${dateFormatter.format(checkin)} ${timeFormatter.format(checkin)} – ${dateFormatter.format(checkout)} ${timeFormatter.format(checkout)}`
}

type HoursByUser = Record<string, Prestation[]>
const STANDARD_WORKDAY_LIMIT_MS = 12 * 60 * 60 * 1000

type MaterialDraft = {
  name: string
  quantity: number
  unit: string
  unitPrice?: number
  kind?: 'material' | 'small-materials'
  smallMaterialAmount?: number
  articleNumber?: string
  productNumber?: string
  packagingQuantity?: number
  description?: string
  image?: string
  technicalData?: Record<string, string>
}

export class JobView extends LiteElement {
  @property({ type: Object, consumes: true }) accessor user: User | undefined = undefined
  @property({ type: Object }) accessor hours: HoursByUser = {}
  @property({ type: Object }) accessor users: { [userId: string]: User } = {}
  @property({ type: Object }) accessor openUsers: Record<string, boolean> = {}
  @property({ type: Boolean }) accessor openMaterials = false
  @property({ type: Array }) accessor materialSuggestions: MaterialLine[] = []
  @property({ type: Array }) accessor materials: MaterialDraft[] = []
  @property({ type: String }) accessor selectedJobId = ''
  @property({ type: Boolean }) accessor materialPickerOpen = false
  @property({ type: String }) accessor materialPickerQuery = ''
  @property({ type: Array }) accessor materialPickerProducts: ShopProduct[] = []
  @property({ type: Boolean }) accessor materialPickerLoading = false
  @property({ type: Object }) accessor materialPickerQuantities: Map<string, number> = new Map()
  @property({ type: String }) accessor materialPickerMessage = ''
  @property({ type: String }) accessor cartImportSource: 'desco' | 'alelek' = 'desco'
  @property({ type: String }) accessor cartImportText = ''
  @property({ type: Boolean }) accessor cartImporting = false
  @property({ type: Array }) accessor cartImportUnmatched: string[] = []
  @property({ type: Boolean }) accessor editingDetails = false
  @property({ type: Boolean }) accessor savingDetails = false
  @property({ type: String }) accessor detailName = ''
  @property({ type: String }) accessor detailDescription = ''

  favoriteNames: Set<string> = new Set()
  private materialPickerLoadToken = 0
  private materialPickerSearchTimer: ReturnType<typeof setTimeout> | undefined

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        max-width: 1180px;
        padding: 22px;
        box-sizing: border-box;
        gap: 14px;
      }

      .details-panel,
      .section-panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
        padding: 18px;
        border-radius: 24px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--app-panel) 96%, white 4%), var(--app-panel));
        border: 1px solid var(--app-border);
        box-shadow: var(--app-shadow-strong);
        box-sizing: border-box;
      }

      .section-title,
      .hours-group strong,
      .note-meta,
      h4 {
        margin: 0;
      }

      .section-title {
        font-size: 1.15rem;
      }

      .hours-list,
      .notes-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .hours-group,
      .note-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px;
        border-radius: 18px;
        background: color-mix(in srgb, var(--app-panel-strong) 95%, white 5%);
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
      }

      .materials-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .materials-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .materials-header-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .materials-total-inline {
        color: var(--muted-color, var(--md-sys-color-on-surface-variant));
        font-size: 0.92rem;
      }

      .materials-toggle,
      .materials-add,
      .materials-save {
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        background: color-mix(in srgb, var(--md-sys-color-surface) 94%, white 6%);
        color: var(--md-sys-color-on-surface);
        border-radius: 999px;
        padding: 8px 12px;
        font: inherit;
        cursor: pointer;
      }

      .materials-save {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--app-accent) 88%, white 12%),
          var(--app-accent-strong)
        );
        color: var(--md-sys-color-on-primary);
      }

      .small-materials-control {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 13px 14px;
        border: 1px solid color-mix(in srgb, var(--app-accent) 30%, var(--app-border));
        border-radius: 14px;
        background: color-mix(in srgb, var(--app-accent) 7%, var(--app-panel-strong));
      }

      .small-materials-copy {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .small-materials-copy span {
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.76rem;
      }

      .small-materials-options {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .small-materials-options button,
      .small-materials-remove {
        min-height: 36px;
        padding: 0 11px;
        border: 1px solid var(--app-border);
        border-radius: 10px;
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
        font-size: 0.78rem;
        font-weight: 750;
        cursor: pointer;
      }

      .small-materials-options button[aria-pressed='true'] {
        border-color: var(--app-accent);
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
      }

      .small-materials-amount {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 70px;
        color: var(--app-accent);
        font-size: 0.82rem;
        font-weight: 800;
        text-align: right;
      }

      .small-materials-clear {
        padding: 2px 0;
        border: 0;
        background: transparent;
        color: var(--md-sys-color-on-surface-variant);
        font: inherit;
        font-size: 0.74rem;
        font-weight: 700;
        text-decoration: underline;
        text-underline-offset: 3px;
        cursor: pointer;
      }

      .materials-row {
        display: grid;
        grid-template-columns: minmax(180px, 1fr) 100px 120px 120px auto;
        gap: 8px;
        align-items: center;
      }

      .material-input-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .materials-actions {
        display: flex;
        gap: 7px;
        flex-wrap: wrap;
      }

      .material-row-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .material-row-actions button {
        min-height: 40px;
        padding: 0 11px;
        border: 1px solid var(--app-border);
        border-radius: 11px;
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
        font-size: 0.78rem;
        font-weight: 700;
        cursor: pointer;
      }

      .material-favorite {
        width: 42px;
        flex: none;
        color: var(--app-accent) !important;
        font-size: 1.05rem !important;
      }

      .materials-row input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        background: color-mix(in srgb, var(--app-panel-strong) 95%, white 5%);
        color: var(--md-sys-color-on-surface);
        box-sizing: border-box;
      }

      .material-meta {
        min-height: 1em;
        font-size: 0.75rem;
        color: var(--md-sys-color-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .material-picker-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1300;
        background: color-mix(in srgb, black 42%, transparent 58%);
        backdrop-filter: blur(2px);
      }

      .material-picker {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(480px, calc(100vw - 24px));
        display: flex;
        flex-direction: column;
        background: var(--md-sys-color-surface, var(--app-panel));
        border-left: 1px solid var(--app-border);
        box-shadow: -18px 0 48px rgb(0 0 0 / 28%);
      }

      .material-picker-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding: 20px 20px 12px;
      }

      .material-picker-header h3,
      .material-picker-header p,
      .material-picker-section h4,
      .material-picker-empty {
        margin: 0;
      }

      .material-picker-header p {
        margin-top: 4px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.82rem;
        line-height: 1.4;
      }

      .material-picker-close {
        width: 40px;
        height: 40px;
        flex: none;
        border: 1px solid var(--app-border);
        border-radius: 12px;
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
        cursor: pointer;
      }

      .material-picker-tools {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 0 20px 14px;
        border-bottom: 1px solid var(--app-border);
      }

      .material-picker-search,
      .cart-import textarea,
      .cart-import select,
      .picker-quantity {
        box-sizing: border-box;
        border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent 14%);
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
      }

      .material-picker-search {
        width: 100%;
        min-height: 46px;
        padding: 0 14px;
        border-radius: 14px;
      }

      .material-picker-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .picker-secondary,
      .picker-add,
      .cart-import-button {
        min-height: 38px;
        padding: 0 12px;
        border-radius: 11px;
        border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent 14%);
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
        font-size: 0.82rem;
        font-weight: 650;
        cursor: pointer;
      }

      .picker-add,
      .cart-import-button {
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
        border-color: var(--app-accent-strong);
      }

      .material-picker-message {
        padding: 9px 11px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--app-accent) 12%, var(--app-panel-strong) 88%);
        color: var(--md-sys-color-on-surface);
        font-size: 0.8rem;
      }

      .material-picker-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 16px 20px 28px;
      }

      .material-picker-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 20px;
        border-top: 1px solid var(--app-border);
        background: color-mix(in srgb, var(--md-sys-color-surface) 94%, var(--app-panel) 6%);
      }

      .material-picker-footer span {
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.78rem;
      }

      .material-picker-save {
        min-height: 42px;
        padding: 0 16px;
        border: 1px solid var(--app-accent-strong);
        border-radius: 12px;
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .material-picker-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .material-picker-section h4 {
        font-size: 0.92rem;
      }

      .picker-product-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .picker-product {
        display: grid;
        grid-template-columns: 54px minmax(0, 1fr) 58px auto;
        gap: 9px;
        align-items: center;
        padding: 10px;
        border: 1px solid color-mix(in srgb, var(--app-border) 86%, transparent 14%);
        border-radius: 14px;
        background: color-mix(in srgb, var(--app-panel-strong) 94%, white 6%);
      }

      .picker-product-image {
        width: 54px;
        height: 54px;
        object-fit: contain;
        border-radius: 9px;
        background: white;
      }

      .picker-product-placeholder {
        display: grid;
        place-items: center;
        width: 54px;
        height: 54px;
        border-radius: 9px;
        background: color-mix(in srgb, var(--app-accent) 10%, var(--app-panel) 90%);
        color: var(--app-accent);
        font-weight: 800;
      }

      .picker-product-info {
        min-width: 0;
      }

      .picker-product-name {
        font-size: 0.83rem;
        font-weight: 700;
        line-height: 1.25;
      }

      .picker-product-meta {
        margin-top: 4px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.72rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .picker-quantity {
        width: 58px;
        height: 38px;
        padding: 0 6px;
        border-radius: 10px;
        text-align: center;
      }

      .material-picker-empty {
        padding: 28px 10px;
        color: var(--md-sys-color-on-surface-variant);
        text-align: center;
      }

      .cart-import {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid var(--app-border);
      }

      .cart-import summary {
        cursor: pointer;
        font-weight: 700;
      }

      .cart-import-content {
        display: flex;
        flex-direction: column;
        gap: 9px;
        padding-top: 10px;
      }

      .cart-import-help,
      .cart-import-unmatched {
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.77rem;
        line-height: 1.4;
      }

      .cart-import select {
        min-height: 40px;
        padding: 0 10px;
        border-radius: 11px;
      }

      .cart-import textarea {
        width: 100%;
        min-height: 110px;
        resize: vertical;
        padding: 10px;
        border-radius: 11px;
      }

      .cart-import-file {
        font-size: 0.78rem;
      }

      .cart-import-unmatched {
        padding: 9px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--md-sys-color-error) 10%, var(--app-panel-strong) 90%);
      }

      .hours-user-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .hours-user-title {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .hours-user-total {
        color: var(--muted-color, var(--md-sys-color-on-surface-variant));
        font-size: 0.92rem;
      }

      .hours-user-toggle {
        border: 1px solid color-mix(in srgb, var(--app-border) 84%, transparent 16%);
        background: color-mix(in srgb, var(--md-sys-color-surface) 94%, white 6%);
        color: var(--md-sys-color-on-surface);
        border-radius: 999px;
        padding: 8px 12px;
        font: inherit;
        cursor: pointer;
      }

      .hours-total {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        border-radius: 14px;
        background: color-mix(in srgb, var(--app-accent) 12%, var(--app-panel-strong) 88%);
        border: 1px solid color-mix(in srgb, var(--app-accent) 28%, var(--app-border) 72%);
        font-weight: 600;
      }

      .hour-entry {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .hour-future-warning {
        flex-basis: 100%;
        padding: 8px 10px;
        border: 1px solid color-mix(in srgb, #f0a13a 54%, var(--app-border));
        border-radius: 10px;
        background: color-mix(in srgb, #f0a13a 10%, var(--app-panel-strong));
        color: color-mix(in srgb, #f0a13a 82%, white);
        font-size: 0.76rem;
        font-weight: 750;
        line-height: 1.4;
      }

      .note-meta {
        font-size: 12px;
        color: var(--muted-color, var(--md-sys-color-on-surface-variant));
      }

      button.primary {
        border: 1px solid color-mix(in srgb, var(--app-accent) 82%, white 18%);
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--app-accent) 88%, white 12%),
          var(--app-accent-strong)
        );
        color: var(--md-sys-color-on-primary);
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        cursor: pointer;
        width: fit-content;
      }

      .job-hero {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        width: 100%;
        padding: 22px 24px;
        box-sizing: border-box;
        overflow: hidden;
        border: 1px solid var(--app-border);
        border-radius: 22px;
        background:
          radial-gradient(circle at 92% 10%, color-mix(in srgb, var(--app-accent) 13%, transparent 87%), transparent 32%),
          linear-gradient(145deg, var(--app-panel-strong), var(--app-panel));
        box-shadow: var(--app-shadow-soft);
      }

      .job-hero::before {
        content: '';
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: var(--app-accent);
      }

      .job-identity {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
      }

      .job-icon {
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        flex: none;
        border-radius: 15px;
        color: var(--app-accent);
        background: var(--app-accent-soft);
        --custom-icon-color: var(--app-accent);
        --custom-icon-size: 28px;
      }

      .job-copy {
        min-width: 0;
      }

      .job-kicker {
        display: inline-flex;
        margin-bottom: 5px;
        color: var(--app-accent);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .job-title,
      .job-subtitle,
      .section-heading h2,
      .section-heading p,
      .stat-label,
      .stat-value {
        margin: 0;
      }

      .job-title {
        font-size: clamp(1.65rem, 3vw, 2.3rem);
        line-height: 1.05;
        letter-spacing: -0.025em;
      }

      .job-subtitle {
        margin-top: 6px;
        max-width: 62ch;
        overflow: hidden;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.9rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ghost-button,
      .section-action,
      .details-cancel,
      .details-save {
        min-height: 40px;
        padding: 0 14px;
        border-radius: 12px;
        border: 1px solid var(--app-border);
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
        font-size: 0.83rem;
        font-weight: 700;
        cursor: pointer;
      }

      .details-save,
      .section-action.primary-action {
        border-color: var(--app-accent-strong);
        background: var(--app-accent);
        color: var(--md-sys-color-on-primary);
      }

      .details-panel {
        gap: 12px;
        padding: 18px 20px;
        border-radius: 18px;
        box-shadow: var(--app-shadow-soft);
      }

      .details-form {
        display: grid;
        grid-template-columns: minmax(180px, 0.8fr) minmax(260px, 1.2fr);
        gap: 12px;
      }

      .details-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.75rem;
        font-weight: 700;
      }

      .details-field input {
        min-height: 44px;
        padding: 0 12px;
        border: 1px solid var(--app-border);
        border-radius: 11px;
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
      }

      .details-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        width: 100%;
      }

      .stat-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
        padding: 15px 17px;
        border: 1px solid var(--app-border);
        border-radius: 16px;
        background: color-mix(in srgb, var(--app-panel) 96%, white 4%);
      }

      .stat-copy {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .stat-label {
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .stat-value {
        font-size: 1.3rem;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
      }

      .stat-icon {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        flex: none;
        border-radius: 11px;
        color: var(--app-accent);
        background: var(--app-accent-soft);
        --custom-icon-color: var(--app-accent);
        --custom-icon-size: 21px;
      }

      .job-content-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
        align-items: start;
        gap: 14px;
        width: 100%;
      }

      .main-column,
      .side-column {
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-width: 0;
      }

      .section-panel {
        gap: 15px;
        padding: 20px;
        border-radius: 18px;
        box-shadow: var(--app-shadow-soft);
      }

      .section-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .section-heading h2 {
        font-size: 1.05rem;
      }

      .section-heading p {
        margin-top: 4px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.78rem;
      }

      .hours-group,
      .note-item {
        padding: 12px 13px;
        border-radius: 13px;
        box-shadow: none;
      }

      .hours-user-toggle {
        min-height: 34px;
        padding: 0 11px;
        border-radius: 10px;
        font-size: 0.76rem;
      }

      .hour-entry {
        padding-top: 8px;
        border-top: 1px solid var(--app-border);
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.78rem;
      }

      .materials-header {
        align-items: flex-start;
      }

      .materials-header-meta {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
      }

      .materials-total-inline {
        font-size: 0.78rem;
      }

      .materials-toggle,
      .materials-add,
      .materials-save {
        min-height: 38px;
        padding: 0 13px;
        border-radius: 11px;
        font-size: 0.8rem;
        font-weight: 700;
      }

      .notes-list {
        gap: 8px;
      }

      .notes-empty {
        padding: 18px 12px;
        border: 1px dashed var(--app-border);
        border-radius: 13px;
        color: var(--md-sys-color-on-surface-variant);
        font-size: 0.82rem;
        text-align: center;
      }

      .note-meta {
        font-size: 0.7rem;
      }

      .note-composer {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .note-composer textarea {
        width: 100%;
        min-height: 86px;
        padding: 11px 12px;
        resize: vertical;
        box-sizing: border-box;
        border: 1px solid var(--app-border);
        border-radius: 12px;
        background: var(--app-panel-strong);
        color: var(--md-sys-color-on-surface);
        font: inherit;
      }

      .note-composer button.primary {
        min-height: 40px;
        padding: 0 14px;
        border-radius: 11px;
        font-size: 0.82rem;
        font-weight: 700;
      }

      @media (max-width: 920px) {
        .job-content-grid {
          grid-template-columns: 1fr;
        }

        .side-column {
          order: 2;
        }
      }

      @media (max-width: 720px) {
        :host {
          padding: 12px;
        }

        .details-panel,
        .section-panel {
          padding: 16px;
          border-radius: 20px;
        }

        .job-hero {
          align-items: flex-start;
          padding: 18px;
          border-radius: 19px;
        }

        .job-icon {
          width: 44px;
          height: 44px;
        }

        .job-subtitle {
          white-space: normal;
        }

        .ghost-button {
          min-width: 42px;
          padding: 0 10px;
        }

        .details-form {
          grid-template-columns: 1fr;
        }

        .stats-grid {
          grid-template-columns: 1fr;
        }

        .stat-card {
          padding: 12px 14px;
        }

        .section-heading {
          align-items: center;
        }

        .hour-entry {
          flex-direction: column;
        }

        .materials-row {
          grid-template-columns: 1fr 1fr;
        }

        .materials-header {
          flex-direction: column;
          align-items: stretch;
        }

        .materials-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          width: 100%;
        }

        .materials-actions > :only-child {
          grid-column: 1 / -1;
        }

        .materials-actions button {
          width: 100%;
        }

        .small-materials-control {
          align-items: flex-start;
          flex-direction: column;
        }

        .small-materials-options {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
        }

        .small-materials-options button {
          padding: 0 8px;
        }

        .small-materials-amount {
          grid-column: 1 / -1;
          width: 100%;
          text-align: left;
        }

        .material-row-actions {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: 44px 1fr;
        }

        .material-row-actions button {
          width: 100%;
        }

        .material-picker-backdrop {
          display: flex;
          align-items: flex-end;
        }

        .material-picker {
          position: relative;
          width: 100%;
          height: min(88dvh, 820px);
          border-left: none;
          border-top: 1px solid var(--app-border);
          border-radius: 22px 22px 0 0;
          box-shadow: 0 -18px 48px rgb(0 0 0 / 28%);
        }

        .material-picker-header {
          padding: 16px 14px 10px;
        }

        .material-picker-tools {
          padding: 0 14px 12px;
        }

        .material-picker-body {
          padding: 14px 14px 24px;
        }

        .material-picker-footer {
          padding: 10px 14px max(10px, env(safe-area-inset-bottom));
        }

        .picker-product {
          grid-template-columns: 46px minmax(0, 1fr) 52px;
        }

        .picker-product-image,
        .picker-product-placeholder {
          width: 46px;
          height: 46px;
        }

        .picker-add {
          grid-column: 2 / -1;
        }

        button.primary {
          width: 100%;
        }
      }
    `
  ]

  async onChange(propertyKey: string): Promise<void> {
    if (propertyKey === 'job') {
      const params = new URLSearchParams(globalThis.location.href.split('?')[1] || '')
      const selected = params.get('selected')
      if (!selected) {
        this.hours = {}
        this.users = {}
        this.openUsers = {}
        return
      }
      this.selectedJobId = selected
      this.materials = this.normalizeMaterials(this.job?.materials)
      this.openMaterials = false
      this.editingDetails = false
      this.detailName = this.job?.name || ''
      this.detailDescription = this.job?.description || ''
      await this.loadMaterialSuggestions()

      try {
        this.hours = await api.getJobHours(selected)

        const nextUsers: Record<string, User> = {}
        const userIds = Object.keys(this.hours)

        for (const userId of userIds) {
          try {
            nextUsers[userId] = await api.getUser(userId)
          } catch (error) {
            console.error(`Failed to load user ${userId}:`, error)
          }
        }

        this.users = nextUsers
        this.openUsers = {}
      } catch (error) {
        console.error('Failed to load hours:', error)
        this.hours = {}
        this.users = {}
        this.openUsers = {}
      }
    }
  }

  normalizeMaterials(value: MaterialLine[] | undefined): MaterialDraft[] {
    if (!Array.isArray(value)) return [{ name: '', quantity: 1, unit: '', unitPrice: undefined }]

    const normalized = value
      .map((material) => ({
        name: material.name || '',
        quantity: Number(material.quantity) > 0 ? Number(material.quantity) : 1,
        unit: material.unit || '',
        unitPrice: material.unitPrice !== undefined ? Number(material.unitPrice) : undefined,
        kind: material.kind,
        smallMaterialAmount:
          (material.smallMaterialAmount ??
            Number((material as MaterialLine & { percentage?: number }).percentage)) ||
          undefined,
        articleNumber: material.articleNumber,
        productNumber: material.productNumber,
        packagingQuantity: material.packagingQuantity,
        description: material.description,
        image: material.image,
        technicalData: material.technicalData
      }))
      .filter((material) => material.name.trim().length > 0)

    return normalized.length > 0 ? normalized : [{ name: '', quantity: 1, unit: '', unitPrice: undefined }]
  }

  resetMaterials() {
    this.materials = [{ name: '', quantity: 1, unit: '', unitPrice: undefined }]
  }

  addMaterialRow = () => {
    const hasEmptyRow = this.materials.some(
      (material) => material.kind !== 'small-materials' && !material.name.trim()
    )
    if (hasEmptyRow) {
      this.openMaterials = true
      return
    }
    this.materials = [...this.materials, { name: '', quantity: 1, unit: '', unitPrice: undefined }]
  }

  async openMaterialPickerPanel() {
    this.materialPickerOpen = true
    this.materialPickerMessage = ''
    this.cartImportUnmatched = []
    await this.loadMaterialPickerProducts()
  }

  closeMaterialPickerPanel() {
    this.materialPickerOpen = false
    if (this.materialPickerSearchTimer) clearTimeout(this.materialPickerSearchTimer)
  }

  handleMaterialPickerSearch(event: Event) {
    this.materialPickerQuery = (event.target as HTMLInputElement).value
    if (this.materialPickerSearchTimer) clearTimeout(this.materialPickerSearchTimer)
    this.materialPickerSearchTimer = setTimeout(() => void this.loadMaterialPickerProducts(), 220)
  }

  async loadMaterialPickerProducts() {
    const token = ++this.materialPickerLoadToken
    const query = this.materialPickerQuery.trim()
    this.materialPickerLoading = true
    try {
      let response = await api.getShopProducts(query || undefined, {
        limit: 24,
        offset: 0,
        popular: !query
      })
      if (token !== this.materialPickerLoadToken) return
      if (!query && response.products.length === 0) {
        response = await api.getShopProducts(undefined, { limit: 24, offset: 0 })
      }
      if (token !== this.materialPickerLoadToken) return
      this.materialPickerProducts = response.products || []
    } catch (error) {
      if (token !== this.materialPickerLoadToken) return
      console.error('Failed to load shop materials:', error)
      this.materialPickerProducts = []
      this.materialPickerMessage = 'De shopmaterialen konden niet geladen worden.'
    } finally {
      if (token === this.materialPickerLoadToken) this.materialPickerLoading = false
    }
  }

  getMaterialPickerQuantity(productId: string): number {
    return this.materialPickerQuantities.get(productId) || 1
  }

  setMaterialPickerQuantity(productId: string, value: number) {
    const quantities = new Map(this.materialPickerQuantities)
    quantities.set(productId, Number.isFinite(value) && value > 0 ? value : 1)
    this.materialPickerQuantities = quantities
  }

  mergeMaterials(incoming: MaterialLine[]) {
    const surcharge = this.materials.find((material) => material.kind === 'small-materials')
    const merged = this.materials.filter((material) => material.kind !== 'small-materials' && material.name.trim())
    for (const material of incoming) {
      const index = merged.findIndex(
        (existing) =>
          (material.articleNumber && existing.articleNumber === material.articleNumber) ||
          (material.productNumber && existing.productNumber === material.productNumber) ||
          existing.name.trim().toLowerCase() === material.name.trim().toLowerCase()
      )
      const draft: MaterialDraft = {
        name: material.name,
        quantity: Number(material.quantity) > 0 ? Number(material.quantity) : 1,
        unit: material.unit || '',
        unitPrice: material.unitPrice,
        articleNumber: material.articleNumber,
        productNumber: material.productNumber,
        packagingQuantity: material.packagingQuantity,
        description: material.description,
        image: material.image,
        technicalData: material.technicalData
      }
      if (index >= 0) {
        merged[index] = { ...merged[index], ...draft, quantity: merged[index].quantity + draft.quantity }
      } else {
        merged.push(draft)
      }
    }
    if (surcharge) merged.push(surcharge)
    this.materials = merged.length ? merged : [{ name: '', quantity: 1, unit: '', unitPrice: undefined }]
  }

  addShopProduct(product: ShopProduct) {
    const material: MaterialLine = {
      name: product.name,
      quantity: this.getMaterialPickerQuantity(product.id),
      unit: product.unit,
      unitPrice: product.price,
      articleNumber: product.articleNumber,
      productNumber: product.productNumber,
      packagingQuantity: product.packagingQuantity,
      description: product.description,
      image: product.image,
      technicalData: product.technicalData
    }
    this.mergeMaterials([material])
    void api.addToHistory(material)
    this.materialPickerMessage = `${material.quantity} × ${material.name} toegevoegd. Sla de materiaallijst nog op.`
    this.setMaterialPickerQuantity(product.id, 1)
  }

  addManualMaterialFromPicker() {
    this.addMaterialRow()
    this.openMaterials = true
    this.closeMaterialPickerPanel()
  }

  async handleCartImportFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    if (file.size > 1_000_000) {
      this.materialPickerMessage = 'Het importbestand mag maximaal 1 MB groot zijn.'
      return
    }
    this.cartImportText = await file.text()
  }

  async importSupplierCart() {
    const text = this.cartImportText.trim()
    if (!text) {
      this.materialPickerMessage = 'Plak winkelwagenregels of kies eerst een CSV/TXT-bestand.'
      return
    }
    this.cartImporting = true
    this.cartImportUnmatched = []
    try {
      const result = await api.importShopCart(this.cartImportSource, text)
      this.mergeMaterials(result.materials)
      result.materials.forEach((material) => void api.addToHistory(material))
      this.cartImportUnmatched = result.unmatched || []
      this.materialPickerMessage = `${result.materials.length} materiaalregels uit ${this.cartImportSource === 'desco' ? 'Desco' : 'Alelek'} toegevoegd. Sla de materiaallijst nog op.`
    } catch (error) {
      console.error('Failed to import supplier cart:', error)
      this.materialPickerMessage = 'De winkelwagen kon niet geïmporteerd worden.'
    } finally {
      this.cartImporting = false
    }
  }

  removeMaterialRow = (index: number) => {
    this.materials = this.materials.filter((_, currentIndex) => currentIndex !== index)
    if (this.materials.length === 0) this.resetMaterials()
  }

  updateMaterialField<K extends keyof MaterialDraft>(index: number, key: K, value: MaterialDraft[K]) {
    this.materials = this.materials.map((material, currentIndex) =>
      currentIndex === index ? { ...material, [key]: value } : material
    )

    // Track to history when a complete material is added
    if (key === 'name' && typeof value === 'string' && value.trim()) {
      const updatedMaterial = this.materials[index]
      if (updatedMaterial) {
        void api.addToHistory({
          name: updatedMaterial.name,
          quantity: updatedMaterial.quantity,
          unit: updatedMaterial.unit,
          unitPrice: updatedMaterial.unitPrice,
          articleNumber: updatedMaterial.articleNumber,
          productNumber: updatedMaterial.productNumber,
          packagingQuantity: updatedMaterial.packagingQuantity
        })
      }
    }
  }

  get sanitizedMaterials(): MaterialLine[] {
    const normalized: MaterialLine[] = []

    for (const material of this.materials) {
      if (material.kind === 'small-materials') continue
      const name = material.name.trim()
      if (!name) continue

      const quantity = Number(material.quantity)
      const unitPrice = material.unitPrice === undefined ? undefined : Number(material.unitPrice)

      normalized.push({
        name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: material.unit.trim() || undefined,
        unitPrice: unitPrice !== undefined && Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : undefined,
        articleNumber: material.articleNumber,
        productNumber: material.productNumber,
        packagingQuantity: material.packagingQuantity,
        description: material.description,
        image: material.image,
        technicalData: material.technicalData
      })
    }

    const amount = this.smallMaterialsAmount
    if (amount > 0) {
      normalized.push({
        name: `Klein materiaal (+ €${amount.toFixed(2)})`,
        quantity: 1,
        unit: 'toeslag',
        unitPrice: amount,
        kind: 'small-materials',
        smallMaterialAmount: amount,
        description: 'Vaste toeslag voor klein materiaal'
      })
    }

    return normalized
  }

  get smallMaterialsAmount(): number {
    const material = this.materials.find((item) => item.kind === 'small-materials')
    const amount = Number(material?.smallMaterialAmount ?? material?.unitPrice)
    return [15, 20, 25].includes(amount) ? amount : 0
  }

  setSmallMaterialsAmount(amount: number) {
    const regularMaterials = this.materials.filter((material) => material.kind !== 'small-materials')
    const firstEmptyIndex = regularMaterials.findIndex((material) => !material.name.trim())
    const deduplicatedMaterials = regularMaterials.filter(
      (material, index) => material.name.trim() || index === firstEmptyIndex
    )
    this.materials = [
      ...deduplicatedMaterials,
      {
        name: `Klein materiaal (+ €${amount.toFixed(2)})`,
        quantity: 1,
        unit: 'toeslag',
        unitPrice: amount,
        kind: 'small-materials',
        smallMaterialAmount: amount
      }
    ]
    this.openMaterials = true
  }

  removeSmallMaterials() {
    this.materials = this.materials.filter((material) => material.kind !== 'small-materials')
    if (this.materials.length === 0) this.resetMaterials()
  }

  get materialsTotal(): number {
    return this.sanitizedMaterials.reduce((sum, material) => {
      const unitPrice = material.unitPrice || 0
      return sum + unitPrice * material.quantity
    }, 0)
  }

  get materialsSummary(): string {
    const count = this.sanitizedMaterials.length
    return `${count} ${count === 1 ? 'regel' : 'regels'} · € ${this.materialsTotal.toFixed(2)}`
  }

  getMaterialSuggestion(name: string): MaterialLine | undefined {
    const normalized = name.trim().toLowerCase()
    if (!normalized) return undefined
    return this.materialSuggestions.find((suggestion) => suggestion.name.trim().toLowerCase() === normalized)
  }

  getMaterialSuggestionLabel(suggestion: MaterialLine): string {
    const details: string[] = []
    if (suggestion.articleNumber) details.push(`ART: ${suggestion.articleNumber}`)
    if (suggestion.productNumber) details.push(`PROD: ${suggestion.productNumber}`)
    if (typeof suggestion.packagingQuantity === 'number') details.push(`VPH: ${suggestion.packagingQuantity}`)
    if (typeof suggestion.unitPrice === 'number') {
      const unit = suggestion.unit?.trim() ? `/${suggestion.unit.trim()}` : ''
      details.push(`€${suggestion.unitPrice.toFixed(2)}${unit}`)
    }
    return details.join(' | ')
  }

  applyMaterialSuggestion(index: number, name: string) {
    const suggestion = this.getMaterialSuggestion(name)
    if (!suggestion) return

    this.materials = this.materials.map((material, currentIndex) => {
      if (currentIndex !== index) return material
      return {
        ...material,
        name: suggestion.name,
        unit: suggestion.unit || material.unit,
        unitPrice: suggestion.unitPrice ?? material.unitPrice,
        articleNumber: suggestion.articleNumber,
        productNumber: suggestion.productNumber,
        packagingQuantity: suggestion.packagingQuantity
      }
    })
  }

  async loadMaterialSuggestions() {
    try {
      const suggestions = await api.getInvoiceMaterials()
      const allMaterials = Array.isArray(suggestions) ? suggestions : []

      // Get favorites and history
      const favorites = await api.getFavorites()
      const history = await api.getHistory()

      // Cache favorite names for template use
      this.favoriteNames = new Set(favorites.map((m) => m.name))

      // Create a map for quick lookups
      const favoriteNames = new Set(favorites.map((m) => m.name))
      const historyNames = new Set(history.map((m) => m.name))

      // Separate materials
      const favoriteMats = allMaterials.filter((m) => favoriteNames.has(m.name))
      const historyMats = allMaterials.filter((m) => historyNames.has(m.name) && !favoriteNames.has(m.name))
      const otherMats = allMaterials.filter((m) => !favoriteNames.has(m.name) && !historyNames.has(m.name))

      // Combine: favorites first, then recently used, then others
      this.materialSuggestions = [...favoriteMats, ...historyMats, ...otherMats]
    } catch (error) {
      console.error('Failed to load material suggestions:', error)
      this.materialSuggestions = []
    }
  }

  private async refreshFavorites(): Promise<void> {
    try {
      const favorites = await api.getFavorites()
      this.favoriteNames = new Set(favorites.map((m) => m.name))
      this.requestRender()
    } catch (error) {
      console.error('Failed to refresh favorites:', error)
    }
  }

  toggleMaterials() {
    this.openMaterials = !this.openMaterials
  }

  async saveMaterials(closePicker = false) {
    if (!this.selectedJobId) return alert('De job kon niet bepaald worden.')

    try {
      const updated = await api.updateJob(this.selectedJobId, { materials: this.sanitizedMaterials })
      this.job = updated
      if (closePicker) this.closeMaterialPickerPanel()
      this.requestRender()
    } catch (error) {
      console.error('Failed to save materials:', error)
      alert('De materialen konden niet opgeslagen worden.')
    }
  }

  startEditingDetails() {
    this.detailName = this.job?.name || ''
    this.detailDescription = this.job?.description || ''
    this.editingDetails = true
  }

  cancelEditingDetails() {
    this.editingDetails = false
    this.detailName = this.job?.name || ''
    this.detailDescription = this.job?.description || ''
  }

  async saveJobDetails() {
    const name = this.detailName.trim()
    if (!this.selectedJobId || !name) return
    this.savingDetails = true
    try {
      this.job = await api.updateJob(this.selectedJobId, {
        name,
        description: this.detailDescription.trim()
      })
      this.editingDetails = false
      this.requestRender()
    } catch (error) {
      console.error('Failed to save job details:', error)
      alert('De jobgegevens konden niet opgeslagen worden.')
    } finally {
      this.savingDetails = false
    }
  }

  toggleUserHours(userId: string) {
    this.openUsers = {
      ...this.openUsers,
      [userId]: !this.openUsers[userId]
    }
  }

  getFutureTimeWarning(prestation: Prestation): string {
    if (!this.user?.roles?.includes('admin')) return ''

    const checkin = Number(prestation.checkin)
    const checkout = Number(prestation.checkout)
    const serverCheckin = Number(prestation.serverCheckin)
    const serverCheckout = Number(prestation.serverCheckout)
    const futureCheckin =
      Number.isFinite(checkin) && Number.isFinite(serverCheckin) && checkin > serverCheckin
    const futureCheckout =
      Number.isFinite(checkout) && Number.isFinite(serverCheckout) && checkout > serverCheckout

    if (futureCheckin && futureCheckout) {
      return 'De ingegeven check-in en checkout lagen na het moment van indienen.'
    }
    if (futureCheckin) return 'De ingegeven check-in lag na het moment van indienen.'
    if (futureCheckout) return 'De ingegeven checkout lag na het moment van indienen.'
    return ''
  }

  getLongDurationWarning(prestation: Prestation): string {
    if (!this.user?.roles?.includes('admin')) return ''
    const duration = getPrestationDuration(prestation)
    if (!Number.isFinite(duration) || duration <= STANDARD_WORKDAY_LIMIT_MS) return ''
    return 'Ongebruikelijk lange registratie: meer dan 12 uur. Controleer de tijden.'
  }

  @property({ type: Object, consumes: true }) accessor job: Job | undefined = undefined

  @property({ type: String }) accessor newNoteText = ''

  async _addNote() {
    if (!this.job) return

    const text = (this.newNoteText || '').trim()
    if (!text) return alert('Vul eerst een notitie in.')

    const note = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
      author: (this.user as User & { id?: string })?.id || undefined
    }

    const updatedNotes = [...(this.job.notes || []), note]

    // try to determine job uuid key; shell provides this.job from consuming context and may include uuid elsewhere
    const jobId = this.selectedJobId
    if (!jobId) {
      return alert('Unable to determine job id')
    }

    try {
      const updated = await api.updateJob(jobId, { notes: updatedNotes })
      this.job = updated
      this.newNoteText = ''
      this.requestRender()
    } catch (error) {
      console.error('Failed to save note:', error)
      alert('De notitie kon niet bewaard worden.')
    }
  }

  renderMaterialPicker() {
    const isSearching = Boolean(this.materialPickerQuery.trim())
    return html`
      <div
        class="material-picker-backdrop"
        @click=${(event: Event) => {
          if (event.target === event.currentTarget) this.closeMaterialPickerPanel()
        }}>
        <aside
          class="material-picker"
          role="dialog"
          aria-modal="true"
          aria-label="Materiaal uit de shop toevoegen">
          <div class="material-picker-header">
            <div>
              <h3>Materiaal toevoegen</h3>
              <p>Kies vaak gebruikt materiaal of zoek in de volledige Desco- en Alelek-catalogus.</p>
            </div>
            <button
              type="button"
              class="material-picker-close"
              aria-label="Sluiten"
              @click=${() => this.closeMaterialPickerPanel()}>
              ✕
            </button>
          </div>

          <div class="material-picker-tools">
            <input
              class="material-picker-search"
              type="search"
              autocomplete="off"
              placeholder="Zoek naam, artikel- of productnummer..."
              .value=${this.materialPickerQuery}
              @input=${(event: Event) => this.handleMaterialPickerSearch(event)} />
            <div class="material-picker-actions">
              <button
                type="button"
                class="picker-secondary"
                @click=${() => this.addManualMaterialFromPicker()}>
                Handmatig invoeren
              </button>
            </div>
            ${this.materialPickerMessage
              ? html`<div
                  class="material-picker-message"
                  role="status">
                  ${this.materialPickerMessage}
                </div>`
              : null}
          </div>

          <div class="material-picker-body">
            <section class="material-picker-section">
              <h4>${isSearching ? 'Zoekresultaten' : 'Meest gebruikt'}</h4>
              ${this.materialPickerLoading
                ? html`<p class="material-picker-empty">Materialen laden...</p>`
                : this.materialPickerProducts.length
                  ? html`<div class="picker-product-list">
                      ${this.materialPickerProducts.map(
                        (product) => html`
                          <article class="picker-product">
                            ${product.image
                              ? html`<img
                                  class="picker-product-image"
                                  src=${product.image}
                                  alt=""
                                  loading="lazy" />`
                              : html`<div class="picker-product-placeholder">${product.source === 'desco' ? 'D' : 'A'}</div>`}
                            <div class="picker-product-info">
                              <div class="picker-product-name">${product.name}</div>
                              <div class="picker-product-meta">
                                ${product.source === 'desco' ? 'Desco' : 'Alelek'}
                                ${product.articleNumber ? ` · ${product.articleNumber}` : ''} · €${product.price.toFixed(2)}
                              </div>
                            </div>
                            <input
                              class="picker-quantity"
                              type="number"
                              min="0.01"
                              step="0.01"
                              aria-label=${`Aantal ${product.name}`}
                              .value=${String(this.getMaterialPickerQuantity(product.id))}
                              @input=${(event: Event) =>
                                this.setMaterialPickerQuantity(
                                  product.id,
                                  Number((event.target as HTMLInputElement).value || 1)
                                )} />
                            <button
                              type="button"
                              class="picker-add"
                              @click=${() => this.addShopProduct(product)}>
                              Toevoegen
                            </button>
                          </article>
                        `
                      )}
                    </div>`
                  : html`<p class="material-picker-empty">
                      ${isSearching ? 'Geen shopmaterialen gevonden.' : 'Nog geen vaak gebruikte materialen.'}
                    </p>`}
            </section>

            <details class="cart-import">
              <summary>Winkelwagen van Desco of Alelek importeren</summary>
              <div class="cart-import-content">
                <p class="cart-import-help">
                  Exporteer of kopieer de winkelwagen en plak de regels hieronder. CSV met kolommen zoals
                  artikelnummer, omschrijving en aantal wordt automatisch herkend.
                </p>
                <select
                  aria-label="Leverancier van winkelwagen"
                  .value=${this.cartImportSource}
                  @change=${(event: Event) => {
                    this.cartImportSource = (event.target as HTMLSelectElement).value as 'desco' | 'alelek'
                  }}>
                  <option value="desco">Desco</option>
                  <option value="alelek">Alelek</option>
                </select>
                <input
                  class="cart-import-file"
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  @change=${(event: Event) => void this.handleCartImportFile(event)} />
                <textarea
                  placeholder="Artikelnummer; Omschrijving; Aantal"
                  .value=${this.cartImportText}
                  @input=${(event: Event) => {
                    this.cartImportText = (event.target as HTMLTextAreaElement).value
                  }}></textarea>
                <button
                  type="button"
                  class="cart-import-button"
                  ?disabled=${this.cartImporting}
                  @click=${() => void this.importSupplierCart()}>
                  ${this.cartImporting ? 'Importeren...' : 'Winkelwagen importeren'}
                </button>
                ${this.cartImportUnmatched.length
                  ? html`<div class="cart-import-unmatched">
                      ${this.cartImportUnmatched.length} regels niet herkend:<br />
                      ${this.cartImportUnmatched.slice(0, 5).join(' · ')}
                    </div>`
                  : null}
              </div>
            </details>
          </div>
          <div class="material-picker-footer">
            <span>${this.materialsSummary}</span>
            <button
              type="button"
              class="material-picker-save"
              @click=${() => void this.saveMaterials(true)}>
              Opslaan en sluiten
            </button>
          </div>
        </aside>
      </div>
    `
  }

  render() {
    if (!this.job) return html`<loading-view></loading-view>`
    const job = this.job
    const totalDurationMs = Object.values(this.hours)
      .flatMap((prestations) => prestations)
      .reduce((sum, prestation) => {
        const duration = getPrestationDuration(prestation)
        return Number.isFinite(duration) ? sum + duration : sum
      }, 0)

    return html`
      <header class="job-hero">
        <div class="job-identity">
          <div class="job-icon"><custom-icon icon="work"></custom-icon></div>
          <div class="job-copy">
            <span class="job-kicker">Joboverzicht</span>
            <h1 class="job-title">${job.name}</h1>
            <p class="job-subtitle">
              ${[job.description, job.place?.formattedAddress].filter(Boolean).join(' · ') ||
              'Geen omschrijving toegevoegd'}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="ghost-button"
          @click=${() => (this.editingDetails ? this.cancelEditingDetails() : this.startEditingDetails())}>
          ${this.editingDetails ? 'Annuleren' : 'Bewerken'}
        </button>
      </header>

      ${this.editingDetails
        ? html`<section class="details-panel">
            <div class="details-form">
              <label class="details-field">
                Jobnaam
                <input
                  type="text"
                  .value=${this.detailName}
                  @input=${(event: Event) => {
                    this.detailName = (event.target as HTMLInputElement).value
                  }} />
              </label>
              <label class="details-field">
                Omschrijving
                <input
                  type="text"
                  .value=${this.detailDescription}
                  @input=${(event: Event) => {
                    this.detailDescription = (event.target as HTMLInputElement).value
                  }} />
              </label>
            </div>
            <div class="details-actions">
              <button
                type="button"
                class="details-cancel"
                @click=${() => this.cancelEditingDetails()}>
                Annuleren
              </button>
              <button
                type="button"
                class="details-save"
                ?disabled=${this.savingDetails || !this.detailName.trim()}
                @click=${() => void this.saveJobDetails()}>
                ${this.savingDetails ? 'Opslaan...' : 'Wijzigingen opslaan'}
              </button>
            </div>
          </section>`
        : null}

      <section class="stats-grid" aria-label="Jobsamenvatting">
        <div class="stat-card">
          <div class="stat-copy"><span class="stat-label">Gewerkte tijd</span><strong class="stat-value">${msToTime(totalDurationMs)}</strong></div>
          <span class="stat-icon"><custom-icon icon="schedule"></custom-icon></span>
        </div>
        <div class="stat-card">
          <div class="stat-copy"><span class="stat-label">Medewerkers</span><strong class="stat-value">${Object.keys(this.hours).length}</strong></div>
          <span class="stat-icon"><custom-icon icon="group"></custom-icon></span>
        </div>
        <div class="stat-card">
          <div class="stat-copy"><span class="stat-label">Materialen</span><strong class="stat-value">${this.sanitizedMaterials.length}</strong></div>
          <span class="stat-icon"><custom-icon icon="inventory2"></custom-icon></span>
        </div>
      </section>

      <div class="job-content-grid">
        <div class="main-column">
      <section class="section-panel">
        <div class="section-heading">
          <div><h2>Uren</h2><p>Registraties per medewerker</p></div>
        </div>
        <div class="hours-list">
          ${Object.keys(this.hours).length
            ? Object.entries(this.hours).map(([userId, prestations]) => {
                const userTotal = prestations.reduce((sum, prestation) => {
                  const duration = getPrestationDuration(prestation)
                  return Number.isFinite(duration) ? sum + duration : sum
                }, 0)
                const isOpen = Boolean(this.openUsers[userId])

                return html`<div class="hours-group">
                  <div class="hours-user-header">
                    <div class="hours-user-title">
                      <strong>${this.users[userId]?.name || userId}</strong>
                      <span class="hours-user-total">${msToTime(userTotal)}</span>
                    </div>
                    <button
                      type="button"
                      class="hours-user-toggle"
                      @click=${() => this.toggleUserHours(userId)}>
                      ${isOpen ? 'Verberg uren' : 'Toon uren'}
                    </button>
                  </div>
                  ${isOpen
                    ? html`<div class="hours-list">
                        ${prestations.map(
                          (prestation) => {
                            const futureTimeWarning = this.getFutureTimeWarning(prestation)
                            const longDurationWarning = this.getLongDurationWarning(prestation)
                            return html`<div class="hour-entry">
                              <span
                                >${formatPrestationRange(
                                  Number(prestation.checkin),
                                  Number(prestation.checkout)
                                )}</span
                              >
                              <span>${msToTime(getPrestationDuration(prestation))}</span>
                              ${futureTimeWarning
                                ? html`<div class="hour-future-warning" role="status">
                                    ⚠ ${futureTimeWarning}
                                  </div>`
                                : null}
                              ${longDurationWarning
                                ? html`<div class="hour-future-warning" role="status">
                                    ⚠ ${longDurationWarning}
                                  </div>`
                                : null}
                            </div>`
                          }
                        )}
                      </div>`
                    : null}
                </div>`
              })
            : html`<div class="hours-group">Nog geen geregistreerde uren.</div>`}
        </div>
      </section>

      <section class="section-panel">
        <div class="materials-header">
          <div class="materials-header-meta">
            <h4 class="section-title">Materialen</h4>
            <span class="materials-total-inline">${this.materialsSummary}</span>
          </div>
          <div class="materials-actions">
            ${this.openMaterials || this.sanitizedMaterials.length
              ? html`<button
                  type="button"
                  class="materials-toggle"
                  @click=${() => this.toggleMaterials()}>
                  ${this.openMaterials ? 'Lijst sluiten' : 'Bekijk lijst'}
                </button>`
              : null}
            <button
              type="button"
              class="section-action primary-action"
              @click=${() => void this.openMaterialPickerPanel()}>
              Materiaal toevoegen
            </button>
          </div>
        </div>

        ${this.openMaterials
          ? html`
              <datalist id="job-material-suggestions">
                ${this.materialSuggestions.map(
                  (suggestion) =>
                    html`<option
                      value=${suggestion.name}
                      label=${this.getMaterialSuggestionLabel(suggestion)}></option>`
                )}
              </datalist>

              <div class="small-materials-control">
                <div class="small-materials-copy">
                  <strong>Klein materiaal</strong>
                  <span>Voeg een vast bedrag toe voor klein verbruiksmateriaal.</span>
                </div>
                <div class="small-materials-options" aria-label="Bedrag klein materiaal">
                  ${[15, 20, 25].map(
                    (amount) => html`
                      <button
                        type="button"
                        aria-pressed=${this.smallMaterialsAmount === amount ? 'true' : 'false'}
                        @click=${() => this.setSmallMaterialsAmount(amount)}>
                        + €${amount}
                      </button>
                    `
                  )}
                  <span class="small-materials-amount">
                    ${this.smallMaterialsAmount
                      ? html`
                          € ${this.smallMaterialsAmount.toFixed(2)} toegevoegd
                          <button
                            type="button"
                            class="small-materials-clear"
                            @click=${() => this.removeSmallMaterials()}>
                            Wissen
                          </button>
                        `
                      : 'Niet gekozen'}
                  </span>
                </div>
              </div>

              ${this.materials.map(
                (material, index) =>
                  material.kind === 'small-materials'
                    ? null
                    : html`
                  <div class="materials-row">
                    <div class="material-input-wrap">
                      <input
                        type="text"
                        list="job-material-suggestions"
                        placeholder="Materiaal"
                        .value=${material.name}
                        @input=${(event: Event) => {
                          const input = event.target as HTMLInputElement
                          this.updateMaterialField(index, 'name', input.value)
                          this.applyMaterialSuggestion(index, input.value)
                        }} />
                      <div class="material-meta">
                        ${material.name
                          ? this.getMaterialSuggestionLabel(this.getMaterialSuggestion(material.name) || material)
                          : ''}
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Aantal"
                      .value=${String(material.quantity)}
                      @input=${(event: Event) => {
                        const input = event.target as HTMLInputElement
                        this.updateMaterialField(index, 'quantity', Number(input.value || 0))
                      }} />
                    <input
                      type="text"
                      placeholder="Eenheid"
                      .value=${material.unit}
                      @input=${(event: Event) => {
                        const input = event.target as HTMLInputElement
                        this.updateMaterialField(index, 'unit', input.value)
                      }} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="€/stuk"
                      .value=${material.unitPrice === undefined ? '' : String(material.unitPrice)}
                      @input=${(event: Event) => {
                        const input = event.target as HTMLInputElement
                        this.updateMaterialField(
                          index,
                          'unitPrice',
                          input.value === '' ? undefined : Number(input.value)
                        )
                      }} />
                    <div class="material-row-actions">
                      <button
                        type="button"
                        class="material-favorite"
                        aria-label=${this.favoriteNames.has(material.name)
                          ? 'Uit favorieten verwijderen'
                          : 'Toevoegen aan favorieten'}
                        title=${this.favoriteNames.has(material.name)
                          ? 'Uit favorieten verwijderen'
                          : 'Toevoegen aan favorieten'}
                        @click=${() => {
                          if (material.name.trim()) {
                            if (this.favoriteNames.has(material.name)) {
                              void api.removeFromFavorites(material.name).then(() => this.refreshFavorites())
                            } else {
                              void api
                                .addToFavorites(this.getMaterialSuggestion(material.name) || material)
                                .then(() => this.refreshFavorites())
                            }
                          }
                        }}>
                        ${this.favoriteNames.has(material.name) ? '★' : '☆'}
                      </button>
                      <button
                        type="button"
                        @click=${() => this.removeMaterialRow(index)}>
                        Verwijder
                      </button>
                    </div>
                  </div>
                `
              )}

              <button
                type="button"
                class="materials-save"
                @click=${() => this.saveMaterials()}>
                Materialen opslaan
              </button>
            `
          : null}
      </section>

        </div>
        <div class="side-column">

      <section class="section-panel">
        <div class="section-heading">
          <div><h2>Notities</h2><p>Afspraken en werfinfo</p></div>
        </div>
        <div class="notes-list">
          ${(job.notes || []).length === 0
            ? html`<div class="notes-empty">Nog geen notities voor deze job.</div>`
            : html`${(job.notes || []).map(
                (n) =>
                  html`<div class="note-item">
                    <div class="note-meta">
                      ${new Date(n.createdAt).toLocaleString('nl-BE')}${n.author ? ' — ' + n.author : ''}
                    </div>
                    <div>${n.text}</div>
                  </div>`
              )}`}
        </div>

        <div class="note-composer">
          <textarea
            placeholder="Schrijf een korte notitie..."
            .value=${this.newNoteText}
            @input=${(event: Event) => {
              this.newNoteText = (event.target as HTMLTextAreaElement).value
            }}></textarea>
          <button
            class="primary"
            ?disabled=${!this.newNoteText.trim()}
            @click=${this._addNote.bind(this)}>
            Notitie toevoegen
          </button>
        </div>
      </section>
        </div>
      </div>

      ${this.materialPickerOpen ? this.renderMaterialPicker() : null}
    `
  }
}

customElements.define('job-view', JobView)
