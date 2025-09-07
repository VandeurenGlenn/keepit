// Type definitions for importing CSS/SCSS files
// - `import styles from './shell.css' with { type: 'css' }` -> CSSStyleSheet
// - `import classes from './something.module.css'` -> Record<string, string>

declare module '*.css' {
  // For the import assertion `with { type: 'css' }` the default export is a CSSStyleSheet
  const sheet: CSSStyleSheet
  export default sheet
}

declare module '*.scss' {
  const sheet: CSSStyleSheet
  export default sheet
}

declare module '*.module.css' {
  const classes: { [key: string]: string }
  export default classes
}

declare module '*.module.scss' {
  const classes: { [key: string]: string }
  export default classes
}
