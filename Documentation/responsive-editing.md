# Responsive editing

Use **Desktop**, **Tablet**, and **Mobile** above the frontend canvas to switch layouts. The screen picker in the bottom toolbar offers device sizes; Canvas Settings accepts custom dimensions. The canvas fits the new screen into view automatically.

- Desktop is the default layout, used above 1024px.
- Tablet overrides apply at widths up to 1024px and are inherited by mobile.
- Mobile overrides apply at widths up to 600px.

Moving, resizing, styling, or hiding an element on tablet/mobile changes that screen's overrides. Content, element structure, and interactions are shared across screens. **Reset breakpoint overrides** in the selected element's Design inspector returns it to its inherited layout.

Ordinary edits participate in project autosave. Click **Responsive** to review several edits together: **Save** keeps them as one undo step, and **Cancel** restores the layout before the review. Switching screens, pages, canvas modes, opening Preview, or explicitly saving the project keeps the review's changes. Background autosave retains the previous saved layout until the review ends.

Preview opens at the current screen dimensions. Its screen selector is independent of the editor, so checking another device doesn't change your editing screen. Generated frontend and local full-stack previews retain the selected width even when it is larger than the browser window; scroll horizontally to inspect the full screen. Generated frontend preview and exported application CSS share the same breakpoint rules.

On small browser windows, the element tray and property inspector open as panels over the canvas. Use the bottom toolbar to open a panel, or click outside it to close it.
