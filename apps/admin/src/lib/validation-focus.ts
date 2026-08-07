/**
 * Brings the first visible validation problem into view after a user submits a
 * form.  Native browser validation is deliberately disabled on several Admin
 * forms because their rules also depend on server authority; this gives those
 * forms the same clear recovery behaviour without duplicating validation.
 */
export function revealFirstValidationError(scope?: ParentNode | null): void {
  if (typeof window === "undefined") return;

  window.requestAnimationFrame(() => {
    const root = scope ?? document;
    const target = root.querySelector<HTMLElement>(
      [
        '[aria-invalid="true"]:not([disabled])',
        '[data-validation-target="true"]',
        '[data-validation-error="true"]',
      ].join(", "),
    );

    if (!target) return;

    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });

    // Inputs, selects, and buttons can receive focus directly. For a grouped
    // card (for example a room choice) callers provide a focusable target.
    if (typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }
  });
}
