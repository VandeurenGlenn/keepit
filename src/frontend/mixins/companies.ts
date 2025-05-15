import { LiteElement, html, css, query, property } from '@vandeurenglenn/lite'
import { DataFlow } from '../flows/data.js'
import '../flows/data.js'
import '../flows/data-input.js'

export const CompaniesMixin = (base: typeof LiteElement) =>
  class CompaniesMixin extends base {
    @query('data-flow') accessor dataFlow: DataFlow

    @property({ type: Object, consumes: true }) accessor companies

    @property({ type: Boolean }) accessor creatingCompany = false

    @property({ type: Array }) accessor companySteps = [
      {
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
        template: html`
          <data-input
            label="place"
            type="place"></data-input>
        `,

        validateAndReturnValues: (inputs) => {
          const data = {}

          for (const input of inputs) {
            data[input.label] = input.place
            if (!data[input.label]) {
              return { valid: false, values: data }
            }
          }
          return { valid: true, values: data }
        }
      },
      {
        description: 'optional',
        template: html`<data-input label="description"></data-input> `,
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
    _addCompany = async () => {
      if (this.creatingCompany) return // Prevent multiple clicks
      this.creatingCompany = true
      const dataFlow = new DataFlow()
      dataFlow.steps = this.companySteps
      dataFlow.label = 'Add Company'
      document.body.appendChild(dataFlow)
      const stepResults = await dataFlow.done
      this.creatingCompany = false
      const response = await fetch('/api/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: localStorage.getItem('token')
        },
        body: JSON.stringify(stepResults.reduce((acc, item) => ({ ...acc, ...item }), {}))
      })
      const data = await response.json()
      console.log(data)

      this.companies = this.companies[data.uuid] = data.content
      document.body.removeChild(dataFlow)
    }

    _deleteCompany = async (uuid) => {
      const answer = confirm('Are you sure you want to delete this company?')
      if (!answer) return
      const response = await fetch(`/api/companies/${uuid}`, {
        method: 'DELETE',
        headers: {
          Authorization: localStorage.getItem('token')
        }
      })
      if (!response.ok) {
        console.error('Error deleting company:', response.statusText)
        return
      }
      delete this.companies[uuid]
      this.requestRender()
    }

    _handleFabKeyUp = (event) => {
      if (event.key === 'Enter' || event.key === 'Space') {
        event.preventDefault()
        this._addCompany()
      }
    }
  }
