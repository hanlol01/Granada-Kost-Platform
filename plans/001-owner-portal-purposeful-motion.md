# 001 — Add purposeful motion to the Owner dashboard

- **Status**: DONE
- **Commit**: e29ec0d
- **Severity**: MEDIUM
- **Category**: Accessibility, cohesion, and missed opportunities
- **Estimated scope**: Owner dashboard component and scoped stylesheet

## Problem

The Owner dashboard changes from loading to a dense set of financial and room facts without spatial continuity. Payment progress also appears at its final value, so the relationship between the label and the bar is less clear.

```tsx
// apps/admin/src/components/property-owner-portal/PropertyOwnerPortal.tsx:345 — current
<div className="space-y-8">
```

The portal currently has no reduced-motion-aware React animation boundary.

## Target

- Reveal only the dashboard's primary groups once, with `opacity: 0 → 1` and `translateY(12px) → 0`.
- Use `duration: 0.32`, `ease: "power2.out"`, and `stagger: 0.045`.
- Animate payment progress with `scaleX: 0 → 1`, `transformOrigin: "left center"`, `duration: 0.4`, and `ease: "power2.out"`.
- When `prefers-reduced-motion: reduce` matches, skip all spatial GSAP animation and leave content immediately visible.
- Do not add scroll-triggered, continuous, decorative, or hover GSAP animation.

## Repo conventions to follow

- React components live under `apps/admin/src/components/property-owner-portal/`.
- Use `useGSAP()` with a scoped container ref and automatic cleanup.
- Preserve semantic Tailwind tokens and the existing read-only Owner authority boundary.
- CSS interaction timing lives in `apps/admin/src/components/property-owner-portal/owner-portal.css` as named tokens.

## Steps

1. Add one scoped dashboard ref and `useGSAP()` lifecycle to `PropertyOwnerPortal.tsx`.
2. Mark only the welcome, finance, operational summary, attention, priority rooms, and quick actions groups with `data-owner-reveal`.
3. Mark the inner payment bar with `data-payment-progress`; keep its final width in layout and animate only `transform`.
4. Branch on `window.matchMedia("(prefers-reduced-motion: reduce)")` before creating tweens.
5. Add owner-scoped CSS transition tokens and reduced-motion fallbacks to `owner-portal.css`.

## Boundaries

- Do NOT change backend routes, DTOs, financial calculations, or permission checks.
- Do NOT add ScrollTrigger.
- Do NOT animate layout properties, counters, currency values, or frequently used navigation links.
- Do NOT change motion outside the Property Owner portal.

## Verification

- **Mechanical**: run Admin lint, the Owner portal contract tests, and the Admin production build; all must pass.
- **Feel check**: load `/property-owners/portal` at 375px and confirm the dashboard becomes readable within 400ms without blocking taps.
- Confirm payment bars grow from the left and finish at their authoritative percentage.
- Rapidly navigate away and back; no stale animation or detached-node warning may appear.
- Enable reduced motion in DevTools; content must render immediately without vertical movement while focus and pressed feedback remain.
- **Done when**: motion communicates initial hierarchy and payment completion without delaying navigation or changing layout.
