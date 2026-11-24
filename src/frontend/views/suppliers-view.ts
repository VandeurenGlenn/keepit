import { CompaniesView } from './companies-view.js'

export class SuppliersView extends CompaniesView {
  protected override get relationshipType(): 'customer' | 'supplier' { return 'supplier' }
}

customElements.define('suppliers-view', SuppliersView)
