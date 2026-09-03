import { ButtonGhostDefault } from './design-system/button-ghost-default.js'
import { ButtonGhostHover } from './design-system/button-ghost-hover.js'
import { ButtonPrimaryDefault } from './design-system/button-primary-default.js'
import { ButtonPrimaryHover } from './design-system/button-primary-hover.js'
import { ButtonSecondaryDefault } from './design-system/button-secondary-default.js'
import { ButtonSecondaryHover } from './design-system/button-secondary-hover.js'
import { FormField } from './design-system/form-field.js'
import { InputFieldDefault } from './design-system/input-field-default.js'
import { InputFieldError } from './design-system/input-field-error.js'
import { InputFieldFocused } from './design-system/input-field-focused.js'
import { InputFieldHover } from './design-system/input-field-hover.js'
import { DesignSystem } from './design-system/design-system.js'
import { Card } from './generated/card.js'

/**
 * Renders generated components next to the Figma frames they came from. This is
 * the only check that catches "compiles, types fine, looks wrong".
 */
export function App() {
  return (
    <main className="min-h-screen bg-neutral-100 p-12 flex flex-col gap-12">
      <Section title="Buttons — default and hover, as separate components">
        <ButtonPrimaryDefault />
        <ButtonSecondaryDefault />
        <ButtonGhostDefault />
      </Section>

      {/*
        The hover variants render side by side rather than on :hover. Figma
        models a state as another component, and folding two components into one
        with a `hover:` prefix is a merge the generator does not yet do.
      */}
      <Section title="Buttons — hover variants, shown flat">
        <ButtonPrimaryHover />
        <ButtonSecondaryHover />
        <ButtonGhostHover />
      </Section>

      <Section title="Input fields — each variant its own component">
        <InputFieldDefault />
        <InputFieldHover />
        <InputFieldFocused />
        <InputFieldError />
      </Section>

      <Section title="Form field — composes InputFieldDefault, prop threaded through">
        <FormField />
        <FormField label="Email" placeholderText="you@example.com" />
      </Section>

      <Section title="Whole frame — colour swatches must be circles, not squares">
        <div className="origin-top-left scale-[0.55]">
          <DesignSystem />
        </div>
      </Section>

      <Section title="Card — from the test fixture, no token needed">
        <Card />
        <Card title="Quarterly report" body="Churn fell to 1.8%." label="Open" />
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">{title}</h2>
      <div className="flex flex-wrap items-start gap-6 rounded-xl bg-white p-6">{children}</div>
    </section>
  )
}
