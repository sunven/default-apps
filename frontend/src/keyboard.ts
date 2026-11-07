import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

type CompositionSource = { isComposing?: boolean; keyCode?: number; nativeEvent?: { isComposing?: boolean } }

export function isComposing(event: CompositionSource): boolean {
 return Boolean(event.nativeEvent?.isComposing ?? event.isComposing) || event.keyCode === 229
}

export function plainKey(event: ReactKeyboardEvent): boolean {
 return !isComposing(event) && !event.altKey && !event.ctrlKey && !event.metaKey
}
