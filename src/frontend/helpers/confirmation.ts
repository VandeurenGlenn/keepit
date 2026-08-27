export type ConfirmationOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}

export const confirmAction = (options: ConfirmationOptions): Promise<boolean> =>
  new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent('keepit-confirm', {
        detail: { ...options, resolve }
      })
    )
  })
