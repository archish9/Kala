export {
  resolveTailwindClasses, DEFAULT_SCALE, type TailwindScale
} from './tailwind.js'
export {
  declsToStyleFacts, parseInlineStyle, parseStyleSheet,
  type Decl, type CssRule
} from './css.js'
export {
  matchSelector, rulesFor, type ElementKey, type SelectorMatch
} from './selectors.js'
export { mergeFacts } from './merge.js'
